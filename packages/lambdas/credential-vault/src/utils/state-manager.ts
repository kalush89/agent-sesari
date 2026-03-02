import { createHmac, randomBytes } from 'crypto';

/**
 * State token structure for CSRF protection
 */
export interface StateToken {
  userId: string;
  timestamp: number;
  nonce: string;
}

/**
 * Generates a secure state token for OAuth CSRF protection
 * @param userId - User identifier
 * @returns Base64 encoded state token with HMAC signature
 */
export function generateStateToken(userId: string): string {
  const state: StateToken = {
    userId,
    timestamp: Date.now(),
    nonce: randomBytes(16).toString('hex')
  };

  const payload = Buffer.from(JSON.stringify(state)).toString('base64');
  const signature = createHmac('sha256', getStateSecret())
    .update(payload)
    .digest('hex');

  return `${payload}.${signature}`;
}

/**
 * Validates a state token and returns the decoded state
 * @param token - State token to validate
 * @returns Decoded state token
 * @throws Error if token is invalid or expired
 */
export function validateStateToken(token: string): StateToken {
  if (!token || typeof token !== 'string') {
    throw new Error('Invalid state token format');
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new Error('Invalid state token format');
  }

  const [payload, signature] = parts;

  // Verify signature
  const expectedSignature = createHmac('sha256', getStateSecret())
    .update(payload)
    .digest('hex');

  if (signature !== expectedSignature) {
    throw new Error('Invalid state token signature');
  }

  // Parse and validate timestamp (must be within 10 minutes)
  let state: StateToken;
  try {
    state = JSON.parse(Buffer.from(payload, 'base64').toString());
  } catch (error) {
    throw new Error('Invalid state token payload');
  }

  // Validate state structure
  if (!state.userId || !state.timestamp || !state.nonce) {
    throw new Error('Invalid state token structure');
  }

  // Check expiration (10 minutes)
  const TEN_MINUTES_MS = 10 * 60 * 1000;
  if (Date.now() - state.timestamp > TEN_MINUTES_MS) {
    throw new Error('State token expired');
  }

  return state;
}

/**
 * Gets the state secret from environment variables
 * @returns State secret for HMAC signing
 * @throws Error if STATE_SECRET is not configured
 */
function getStateSecret(): string {
  const secret = process.env.STATE_SECRET;
  if (!secret) {
    throw new Error('STATE_SECRET environment variable not configured');
  }
  return secret;
}
