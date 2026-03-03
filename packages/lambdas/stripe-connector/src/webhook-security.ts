/**
 * Webhook security module for Stripe signature verification
 * Validates webhook authenticity and prevents replay attacks
 */

import Stripe from 'stripe';

/**
 * Maximum age for webhook timestamps (5 minutes in seconds)
 * Webhooks older than this are rejected to prevent replay attacks
 */
const MAX_TIMESTAMP_AGE_SECONDS = 5 * 60;

/**
 * Result of webhook signature verification
 */
export interface VerificationResult {
  isValid: boolean;
  event?: Stripe.Event;
  error?: string;
  errorType?: 'invalid_signature' | 'expired_timestamp' | 'parsing_error';
}

/**
 * Verifies Stripe webhook signature and timestamp freshness
 * 
 * @param payload - Raw webhook payload as string
 * @param signature - Stripe signature from request header
 * @param secret - Webhook signing secret from environment
 * @returns Verification result with parsed event or error details
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): VerificationResult {
  try {
    // Use Stripe SDK to verify signature and construct event
    const stripe = new Stripe(secret);
    const event = stripe.webhooks.constructEvent(payload, signature, secret);

    // Check timestamp age to prevent replay attacks
    const currentTime = Math.floor(Date.now() / 1000);
    const eventTime = event.created;
    const age = currentTime - eventTime;

    if (age >= MAX_TIMESTAMP_AGE_SECONDS) {
      return {
        isValid: false,
        error: `Webhook timestamp too old: ${age} seconds (max ${MAX_TIMESTAMP_AGE_SECONDS})`,
        errorType: 'expired_timestamp'
      };
    }

    return {
      isValid: true,
      event
    };
  } catch (error) {
    // Stripe SDK throws on invalid signature
    if (error instanceof Error) {
      return {
        isValid: false,
        error: error.message,
        errorType: 'invalid_signature'
      };
    }

    return {
      isValid: false,
      error: 'Unknown verification error',
      errorType: 'parsing_error'
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
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET environment variable is not set');
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
  signature?: string;
}

/**
 * Creates a structured security log entry for verification failures
 * 
 * @param errorType - Type of security failure
 * @param errorMessage - Detailed error message
 * @param eventId - Stripe event ID if available
 * @param sourceIp - Source IP address of the request
 * @returns Structured log entry
 */
export function createSecurityLogEntry(
  errorType: string,
  errorMessage: string,
  eventId?: string,
  sourceIp?: string
): SecurityLogEntry {
  return {
    timestamp: Date.now(),
    eventId,
    errorType,
    errorMessage,
    sourceIp
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
