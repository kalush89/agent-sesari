/**
 * Lambda handler for Stripe webhook processing
 * Orchestrates signature verification, event extraction, and storage
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { verifyWebhookSignature, getWebhookSecret, logSecurityFailure, createSecurityLogEntry } from './webhook-security.js';
import { extractRevenueSignal } from './signal-extractor.js';
import { putEvent, eventExists } from './event-store.js';
import { logInfo, logWarn, logError } from './logger.js';
import { emitSuccessMetric, emitFailureMetric, emitLatencyMetric } from './metrics.js';

/**
 * Validates required environment variables at startup
 * Throws error if any required variables are missing
 */
function validateEnvironmentVariables(): void {
  const required = [
    'STRIPE_WEBHOOK_SECRET',
    'DYNAMODB_TABLE_NAME',
    'AWS_REGION',
  ];

  const missing = required.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Main Lambda handler for Stripe webhook events
 * 
 * @param event - API Gateway proxy event containing webhook payload
 * @returns API Gateway proxy result with appropriate status code
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Validate environment variables on first invocation
  validateEnvironmentVariables();
  
  const startTime = Date.now();
  let stripeEventId: string | undefined;

  try {
    // Extract payload and signature from request
    const { payload, signature, sourceIp, parseError } = parseRequest(event);

    if (parseError) {
      logError('Request parsing failed', undefined, {
        error: parseError,
        hasPayload: !!payload,
      });
      return createErrorResponse(400, parseError);
    }

    if (!payload || !signature) {
      logError('Missing required fields', undefined, {
        hasPayload: !!payload,
        hasSignature: !!signature,
      });
      return createErrorResponse(400, 'Missing webhook payload or signature header');
    }

    // Verify webhook signature
    const webhookSecret = getWebhookSecret();
    const verificationResult = verifyWebhookSignature(payload, signature, webhookSecret);

    if (!verificationResult.isValid) {
      const logEntry = createSecurityLogEntry(
        verificationResult.errorType || 'unknown',
        verificationResult.error || 'Verification failed',
        undefined,
        sourceIp
      );
      logSecurityFailure(logEntry);
      return createErrorResponse(401, verificationResult.error || 'Signature verification failed');
    }

    const stripeEvent = verificationResult.event!;
    stripeEventId = stripeEvent.id;

    // Check for duplicate event (idempotency)
    const isDuplicate = await eventExists(stripeEventId);
    if (isDuplicate) {
      logInfo('Duplicate webhook received', stripeEventId, {
        stripeEventType: stripeEvent.type,
      });
      return createSuccessResponse('Event already processed');
    }

    // Extract revenue signal from Stripe event
    const revenueSignal = extractRevenueSignal(stripeEvent);

    // If not a revenue event, return success without storing
    if (!revenueSignal) {
      logInfo('Non-revenue event ignored', stripeEventId, {
        stripeEventType: stripeEvent.type,
      });
      return createSuccessResponse('Non-revenue event ignored');
    }

    // Store revenue signal in DynamoDB
    await putEvent(revenueSignal);

    // Log successful processing
    const duration = Date.now() - startTime;
    logInfo('Webhook processed successfully', stripeEventId, {
      stripeEventType: stripeEvent.type,
      revenueEventType: revenueSignal.eventType,
      durationMs: duration,
    });

    // Emit success metrics
    await emitSuccessMetric(revenueSignal.eventType);
    await emitLatencyMetric(duration, revenueSignal.eventType);

    // Warn if processing is slow
    if (duration > 5000) {
      logWarn('Slow webhook processing detected', stripeEventId, {
        durationMs: duration,
        threshold: 5000,
      });
    }

    return createSuccessResponse('Event processed successfully');
  } catch (error) {
    // Comprehensive error handling
    const duration = Date.now() - startTime;
    
    const errorType = error instanceof Error ? error.name : 'UnknownError';
    
    logError('Webhook processing failed', stripeEventId, {
      durationMs: duration,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined,
      errorType,
    });

    // Emit failure metrics
    await emitFailureMetric(errorType);
    await emitLatencyMetric(duration);

    // Check for database unavailability
    if (error instanceof Error && isDatabaseError(error)) {
      return createErrorResponse(500, 'Database temporarily unavailable');
    }

    // Return 500 for all other unexpected errors
    return createErrorResponse(500, 'Internal server error');
  }
}

/**
 * Parses and validates incoming webhook request
 * 
 * @param event - API Gateway proxy event
 * @returns Parsed payload, signature, source IP, and any parse errors
 */
function parseRequest(event: APIGatewayProxyEvent): {
  payload?: string;
  signature?: string;
  sourceIp?: string;
  parseError?: string;
} {
  try {
    const payload = event.body;
    const signature = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
    const sourceIp = event.requestContext?.identity?.sourceIp;

    // Validate payload
    if (!payload) {
      return { parseError: 'Empty webhook payload' };
    }

    // Validate it's valid JSON
    try {
      JSON.parse(payload);
    } catch {
      return { parseError: 'Malformed JSON payload', payload };
    }

    // Validate signature header
    if (!signature) {
      return { parseError: 'Missing stripe-signature header', payload };
    }

    return { payload, signature, sourceIp };
  } catch (error) {
    return {
      parseError: error instanceof Error ? error.message : 'Request parsing failed',
    };
  }
}

/**
 * Checks if error is related to database unavailability
 * 
 * @param error - Error to check
 * @returns True if error indicates database issues
 */
function isDatabaseError(error: Error): boolean {
  const dbErrorPatterns = [
    'ResourceNotFoundException',
    'ServiceUnavailable',
    'InternalServerError',
    'RequestTimeout',
    'NetworkingError',
  ];

  return dbErrorPatterns.some(pattern => 
    error.message.includes(pattern) || error.name.includes(pattern)
  );
}

/**
 * Creates a success response
 * 
 * @param message - Success message
 * @returns API Gateway proxy result
 */
function createSuccessResponse(message: string): APIGatewayProxyResult {
  return {
    statusCode: 200,
    body: JSON.stringify({ message }),
  };
}

/**
 * Creates an error response
 * 
 * @param statusCode - HTTP status code
 * @param error - Error message
 * @returns API Gateway proxy result
 */
function createErrorResponse(statusCode: number, error: string): APIGatewayProxyResult {
  return {
    statusCode,
    body: JSON.stringify({ error }),
  };
}
