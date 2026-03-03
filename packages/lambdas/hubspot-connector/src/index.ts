/**
 * HubSpot Webhook Lambda Handler
 * 
 * Processes HubSpot webhook events, verifies signatures, extracts relationship signals,
 * and stores them in DynamoDB. Implements idempotent processing and comprehensive error handling.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { verifyWebhookSignature, getWebhookSecret, logSecurityFailure, createSecurityLogEntry } from './webhook-security';
import { extractRelationshipSignal, HubSpotWebhookEvent } from './signal-extractor';
import { putEvent, eventExists } from './event-store';
import { logInfo, logWarn, logError } from './logger';
import { emitSuccessMetric, emitFailureMetric, emitLatencyMetric } from './metrics';

/**
 * Processing timeout warning threshold (8 seconds)
 */
const TIMEOUT_WARNING_MS = 8000;

/**
 * Main Lambda handler for HubSpot webhook processing
 * 
 * @param event - API Gateway proxy event containing webhook payload
 * @returns API Gateway proxy result with appropriate status code
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const startTime = Date.now();
  let hubspotEventId: string | undefined;

  // Set up timeout warning
  const timeoutWarning = setTimeout(() => {
    logWarn('Processing time exceeded 8 seconds', hubspotEventId, {
      elapsedMs: Date.now() - startTime,
    });
  }, TIMEOUT_WARNING_MS);

  try {
    // Validate environment variables at startup
    validateEnvironment();

    // Parse and validate request
    const parseResult = parseWebhookRequest(event);
    if (!parseResult.success) {
      return createErrorResponse(400, parseResult.error!, hubspotEventId);
    }

    const { payload, signature, timestamp, webhookEvent } = parseResult;
    hubspotEventId = webhookEvent.eventId;

    // Verify webhook signature
    const secret = getWebhookSecret();
    const verificationResult = verifyWebhookSignature(payload, signature, secret, timestamp);

    if (!verificationResult.isValid) {
      // Log security failure
      const logEntry = createSecurityLogEntry(
        verificationResult.errorType || 'unknown',
        verificationResult.error || 'Signature verification failed',
        hubspotEventId,
        event.requestContext?.identity?.sourceIp,
        timestamp
      );
      logSecurityFailure(logEntry);

      return createErrorResponse(401, verificationResult.error!, hubspotEventId);
    }

    // Check for duplicate event (idempotency)
    const isDuplicate = await eventExists(hubspotEventId);
    if (isDuplicate) {
      logInfo('Duplicate webhook detected, returning success without processing', hubspotEventId, {
        eventType: webhookEvent.eventType,
      });

      return createSuccessResponse('Event already processed', hubspotEventId);
    }

    // Extract relationship signal
    const relationshipSignal = extractRelationshipSignal(webhookEvent);

    // If event is not a relationship signal, return success without storing
    if (!relationshipSignal) {
      logInfo('Event ignored (not a relationship signal)', hubspotEventId, {
        eventType: webhookEvent.eventType,
      });
      return createSuccessResponse('Event ignored (not a relationship signal)', hubspotEventId);
    }

    // Store relationship signal in DynamoDB
    await putEvent(relationshipSignal);

    // Log successful processing and emit metrics
    const processingTime = Date.now() - startTime;
    logInfo('Webhook processed successfully', hubspotEventId, {
      eventType: webhookEvent.eventType,
      signalType: relationshipSignal.eventType,
      processingTimeMs: processingTime,
    });

    // Emit success and latency metrics
    await Promise.all([
      emitSuccessMetric(relationshipSignal.eventType),
      emitLatencyMetric(processingTime, relationshipSignal.eventType),
    ]);

    // Log warning if processing took longer than 5 seconds
    if (processingTime > 5000) {
      logWarn('Processing time exceeded 5 seconds', hubspotEventId, {
        processingTimeMs: processingTime,
        eventType: webhookEvent.eventType,
      });
    }

    return createSuccessResponse('Event processed successfully', hubspotEventId);

  } catch (error) {
    // Comprehensive error handling
    const processingTime = Date.now() - startTime;
    
    logError('Webhook processing failed', hubspotEventId, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      processingTimeMs: processingTime,
    });

    // Determine appropriate status code and emit failure metric
    const statusCode = determineErrorStatusCode(error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const errorType = getErrorType(statusCode);

    await emitFailureMetric(errorType);

    return createErrorResponse(statusCode, errorMessage, hubspotEventId);

  } finally {
    clearTimeout(timeoutWarning);
  }
}

/**
 * Validates required environment variables
 * @throws Error if required variables are missing
 */
function validateEnvironment(): void {
  const required = ['HUBSPOT_WEBHOOK_SECRET', 'DYNAMODB_TABLE_NAME', 'AWS_REGION'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Result of webhook request parsing
 */
interface ParseResult {
  success: boolean;
  error?: string;
  payload?: string;
  signature?: string;
  timestamp?: string;
  webhookEvent?: HubSpotWebhookEvent;
}

/**
 * Parses and validates webhook request from API Gateway event
 * 
 * @param event - API Gateway proxy event
 * @returns Parse result with payload and headers or error
 */
function parseWebhookRequest(event: APIGatewayProxyEvent): ParseResult {
  // Extract payload
  const payload = event.body;
  if (!payload) {
    return {
      success: false,
      error: 'Empty request body',
    };
  }

  // Extract signature header
  const signature = event.headers['X-HubSpot-Signature'] || 
                    event.headers['x-hubspot-signature'];
  if (!signature) {
    return {
      success: false,
      error: 'Missing X-HubSpot-Signature header',
    };
  }

  // Extract timestamp header (optional but recommended)
  const timestamp = event.headers['X-HubSpot-Request-Timestamp'] || 
                    event.headers['x-hubspot-request-timestamp'];

  // Parse JSON payload
  let webhookEvent: HubSpotWebhookEvent;
  try {
    webhookEvent = JSON.parse(payload);
  } catch (error) {
    logError('Failed to parse webhook payload', undefined, {
      error: error instanceof Error ? error.message : String(error),
      rawPayload: payload.substring(0, 500), // Log first 500 chars
    });

    return {
      success: false,
      error: 'Malformed JSON payload',
    };
  }

  // Validate required fields
  if (!webhookEvent.eventId) {
    return {
      success: false,
      error: 'Missing required field: eventId',
    };
  }

  if (!webhookEvent.eventType) {
    return {
      success: false,
      error: 'Missing required field: eventType',
    };
  }

  // Validate company/portal ID presence
  const hasCompanyId = webhookEvent.companyId || 
                       webhookEvent.associatedCompanyId || 
                       webhookEvent.portalId;
  if (!hasCompanyId) {
    return {
      success: false,
      error: 'Missing required field: companyId, associatedCompanyId, or portalId',
    };
  }

  return {
    success: true,
    payload,
    signature,
    timestamp,
    webhookEvent,
  };
}

/**
 * Determines appropriate HTTP status code based on error type
 * 
 * @param error - Error object
 * @returns HTTP status code
 */
function determineErrorStatusCode(error: unknown): number {
  if (!(error instanceof Error)) {
    return 500;
  }

  const errorMessage = error.message.toLowerCase();

  // Environment/configuration errors (500)
  if (errorMessage.includes('environment variable')) {
    return 500;
  }

  // Database unavailability or throttling (500)
  if (errorMessage.includes('dynamodb') || 
      errorMessage.includes('unavailable') ||
      errorMessage.includes('throttl')) {
    return 500;
  }

  // Parsing errors (400)
  if (errorMessage.includes('parse') || 
      errorMessage.includes('malformed') ||
      errorMessage.includes('invalid json')) {
    return 400;
  }

  // Missing required fields in request (400)
  if (errorMessage.includes('missing required field')) {
    return 400;
  }

  // Default to 500 for unexpected errors
  return 500;
}

/**
 * Creates a success response
 * 
 * @param message - Success message
 * @param eventId - HubSpot event ID
 * @returns API Gateway proxy result
 */
function createSuccessResponse(message: string, eventId?: string): APIGatewayProxyResult {
  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      message,
      eventId,
    }),
  };
}

/**
 * Creates an error response
 * 
 * @param statusCode - HTTP status code
 * @param message - Error message
 * @param eventId - HubSpot event ID
 * @returns API Gateway proxy result
 */
function createErrorResponse(statusCode: number, message: string, eventId?: string): APIGatewayProxyResult {
  return {
    statusCode,
    body: JSON.stringify({
      error: getErrorType(statusCode),
      message,
      eventId,
    }),
  };
}

/**
 * Maps status code to error type
 * 
 * @param statusCode - HTTP status code
 * @returns Error type string
 */
function getErrorType(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return 'Bad Request';
    case 401:
      return 'Unauthorized';
    case 500:
      return 'Internal Server Error';
    default:
      return 'Error';
  }
}
