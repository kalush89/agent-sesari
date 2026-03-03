/**
 * Mixpanel Webhook Lambda Handler
 * 
 * Processes Mixpanel webhook events, verifies signatures, extracts behavioral signals,
 * and stores usage events in DynamoDB for baseline calculation.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { verifyWebhookSignature, getWebhookSecret, logSecurityFailure, createSecurityLogEntry } from './webhook-security.js';
import { processBatchEvents, MixpanelEvent } from './signal-extractor.js';
import { eventExists, storeUsageEvent } from './event-store.js';
import { logInfo, logWarn, logError } from './logger.js';
import { emitSuccessMetric, emitFailureMetric, emitLatencyMetric } from './metrics.js';

/**
 * Processing timeout warning threshold (8 seconds)
 */
const TIMEOUT_WARNING_MS = 8000;

/**
 * Main Lambda handler for Mixpanel webhook processing
 * 
 * @param event - API Gateway proxy event containing webhook payload
 * @returns API Gateway proxy result with appropriate status code
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const startTime = Date.now();
  let mixpanelEventId: string | undefined;

  // Set up timeout warning
  const timeoutWarning = setTimeout(() => {
    logWarn('Processing time exceeded 8 seconds', mixpanelEventId, {
      elapsedMs: Date.now() - startTime,
    });
  }, TIMEOUT_WARNING_MS);

  try {
    // Validate environment variables at startup
    validateEnvironment();

    // Parse and validate request
    const parseResult = parseWebhookRequest(event);
    if (!parseResult.success) {
      return createErrorResponse(400, parseResult.error!, mixpanelEventId);
    }

    const { payload, signature, timestamp, mixpanelEvents } = parseResult;
    
    // Ensure mixpanelEvents is defined
    if (!mixpanelEvents || mixpanelEvents.length === 0) {
      return createErrorResponse(400, 'No events in payload', mixpanelEventId);
    }
    
    // Use first event ID for logging (if available)
    if (mixpanelEvents[0].properties.$insert_id) {
      mixpanelEventId = mixpanelEvents[0].properties.$insert_id;
    }

    // Verify webhook signature
    const secret = getWebhookSecret();
    const verificationResult = verifyWebhookSignature(payload!, signature!, secret, timestamp);

    if (!verificationResult.isValid) {
      // Log security failure
      const logEntry = createSecurityLogEntry(
        verificationResult.errorType || 'unknown',
        verificationResult.error || 'Signature verification failed',
        mixpanelEventId,
        event.requestContext?.identity?.sourceIp,
        timestamp
      );
      logSecurityFailure(logEntry);

      return createErrorResponse(401, verificationResult.error!, mixpanelEventId);
    }

    // Process events (single or batch)
    const usageEvents = processBatchEvents(mixpanelEvents);

    // If no valid behavioral events, return success
    if (usageEvents.length === 0) {
      logInfo('No behavioral events to process', mixpanelEventId, {
        totalEvents: mixpanelEvents.length,
      });
      return createSuccessResponse('No behavioral events to process', mixpanelEventId);
    }

    // Store usage events with idempotency check
    let storedCount = 0;
    let duplicateCount = 0;

    for (const usageEvent of usageEvents) {
      // Check for duplicate event (idempotency)
      const isDuplicate = await eventExists(usageEvent.eventId);
      if (isDuplicate) {
        duplicateCount++;
        logInfo('Duplicate event detected', usageEvent.eventId, {
          userId: usageEvent.userId,
          feature: usageEvent.feature,
        });
        continue;
      }

      // Store usage event
      await storeUsageEvent(usageEvent);
      storedCount++;
    }

    // Log successful processing
    const processingTime = Date.now() - startTime;
    logInfo('Webhook processed successfully', mixpanelEventId, {
      totalEvents: mixpanelEvents.length,
      storedEvents: storedCount,
      duplicateEvents: duplicateCount,
      processingTimeMs: processingTime,
    });

    // Emit success metrics
    await emitSuccessMetric('webhook_processed');
    await emitLatencyMetric(processingTime, 'webhook');

    // Log warning if processing took longer than 5 seconds
    if (processingTime > 5000) {
      logWarn('Processing time exceeded 5 seconds', mixpanelEventId, {
        processingTimeMs: processingTime,
      });
    }

    return createSuccessResponse(`Processed ${storedCount} events successfully`, mixpanelEventId);

  } catch (error) {
    // Comprehensive error handling
    const processingTime = Date.now() - startTime;
    
    const errorType = getErrorType(determineErrorStatusCode(error));
    
    logError('Webhook processing failed', mixpanelEventId, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      processingTimeMs: processingTime,
      errorType,
    });

    // Emit failure metrics
    await emitFailureMetric(errorType);
    await emitLatencyMetric(processingTime, 'webhook_error');

    // Determine appropriate status code
    const statusCode = determineErrorStatusCode(error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';

    return createErrorResponse(statusCode, errorMessage, mixpanelEventId);

  } finally {
    clearTimeout(timeoutWarning);
  }
}

/**
 * Validates required environment variables
 * @throws Error if required variables are missing
 */
function validateEnvironment(): void {
  const required = ['MIXPANEL_WEBHOOK_SECRET', 'DYNAMODB_SIGNALS_TABLE', 'AWS_REGION'];
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
  mixpanelEvents?: MixpanelEvent[];
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
  const signature = event.headers['X-Mixpanel-Signature'] || 
                    event.headers['x-mixpanel-signature'];
  if (!signature) {
    return {
      success: false,
      error: 'Missing X-Mixpanel-Signature header',
    };
  }

  // Extract timestamp header (optional but recommended)
  const timestamp = event.headers['X-Mixpanel-Timestamp'] || 
                    event.headers['x-mixpanel-timestamp'];

  // Parse JSON payload
  let parsedPayload: any;
  try {
    parsedPayload = JSON.parse(payload);
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

  // Handle both single event and batch event formats
  let mixpanelEvents: MixpanelEvent[];
  
  if (Array.isArray(parsedPayload)) {
    // Batch format: array of events
    mixpanelEvents = parsedPayload;
  } else if (parsedPayload.event) {
    // Single event format
    mixpanelEvents = [parsedPayload];
  } else {
    return {
      success: false,
      error: 'Invalid payload format: expected event or array of events',
    };
  }

  // Validate required fields in events
  for (const mixpanelEvent of mixpanelEvents) {
    if (!mixpanelEvent.event) {
      return {
        success: false,
        error: 'Missing required field: event',
      };
    }

    if (!mixpanelEvent.properties || !mixpanelEvent.properties.distinct_id) {
      return {
        success: false,
        error: 'Missing required field: properties.distinct_id',
      };
    }
  }

  return {
    success: true,
    payload,
    signature,
    timestamp,
    mixpanelEvents,
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
 * @param eventId - Mixpanel event ID
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
 * @param eventId - Mixpanel event ID
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
