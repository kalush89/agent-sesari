/**
 * Webhook security module for Mixpanel signature verification
 * Validates webhook authenticity and prevents replay attacks
 */

import crypto from 'crypto';

/**
 * Maximum age for webhook timestamps (5 minutes in milliseconds)
 * Webhooks older than this are rejected to prevent replay attacks
 */
const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

/**
 * Result of webhook signature verification
 */
export interface VerificationResult {
  isValid: boolean;
  error?: string;
  errorType?: 'invalid_signature' | 'expired_timestamp' | 'missing_header';
}

/**
 * Verifies Mixpanel webhook signature using HMAC SHA-256
 * 
 * Mixpanel sends webhooks with a signature header containing
 * a SHA-256 hash of the request body concatenated with the webhook secret.
 * 
 * @param payload - Raw webhook payload as string
 * @param signature - Mixpanel signature from request header
 * @param secret - Webhook signing secret from environment
 * @param timestamp - Request timestamp in milliseconds (from request header)
 * @returns Verification result with success status or error details
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  timestamp?: string
): VerificationResult {
  // Validate required parameters
  if (!signature) {
    return {
      isValid: false,
      error: 'Missing signature header',
      errorType: 'missing_header'
    };
  }

  // Check timestamp age to prevent replay attacks
  if (timestamp) {
    const requestTime = parseInt(timestamp, 10);
    const currentTime = Date.now();
    const age = currentTime - requestTime;

    if (age >= MAX_TIMESTAMP_AGE_MS) {
      return {
        isValid: false,
        error: `Webhook timestamp too old: ${Math.floor(age / 1000)} seconds (max ${MAX_TIMESTAMP_AGE_MS / 1000})`,
        errorType: 'expired_timestamp'
      };
    }
  }

  try {
    // Compute HMAC SHA-256 hash of payload + secret
    const hash = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Check if signatures have the same length before comparison
    if (hash.length !== signature.length) {
      return {
        isValid: false,
        error: 'Signature verification failed',
        errorType: 'invalid_signature'
      };
    }

    // Compare computed hash with provided signature (constant-time comparison)
    const isValid = crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(signature)
    );

    if (!isValid) {
      return {
        isValid: false,
        error: 'Signature verification failed',
        errorType: 'invalid_signature'
      };
    }

    return {
      isValid: true
    };
  } catch (error) {
    if (error instanceof Error) {
      return {
        isValid: false,
        error: 'Signature verification failed',
        errorType: 'invalid_signature'
      };
    }

    return {
      isValid: false,
      error: 'Unknown verification error',
      errorType: 'invalid_signature'
    };
  }
}

/**
 * Retrieves webhook signing secret from environment variables
 * 
 * @returns Webhook signing secret
 * @throws Error if secret is not configured
 */
export function getWebhookSecret(): string {
  const secret = process.env.MIXPANEL_WEBHOOK_SECRET;
  
  if (!secret) {
    throw new Error('MIXPANEL_WEBHOOK_SECRET environment variable is not set');
  }
  
  return secret;
}

/**
 * Security log entry for webhook verification failures
 */
export interface SecurityLogEntry {
  timestamp: number;
  eventId?: string;
  errorType: string;
  errorMessage: string;
  sourceIp?: string;
  requestTimestamp?: string;
}

/**
 * Creates a structured security log entry for verification failures
 * 
 * @param errorType - Type of security failure
 * @param errorMessage - Detailed error message
 * @param eventId - Mixpanel event ID if available
 * @param sourceIp - Source IP address of the request
 * @param requestTimestamp - Original request timestamp
 * @returns Structured log entry
 */
export function createSecurityLogEntry(
  errorType: string,
  errorMessage: string,
  eventId?: string,
  sourceIp?: string,
  requestTimestamp?: string
): SecurityLogEntry {
  return {
    timestamp: Date.now(),
    eventId,
    errorType,
    errorMessage,
    sourceIp,
    requestTimestamp
  };
}

/**
 * Logs security verification failure with context
 * 
 * @param logEntry - Security log entry to log
 */
export function logSecurityFailure(logEntry: SecurityLogEntry): void {
  console.error('SECURITY_FAILURE', JSON.stringify(logEntry));
}
