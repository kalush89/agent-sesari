import { getServiceConfig } from '../config/index.js';
import { encryptCredential } from '../utils/encryption.js';
import { storeCredential } from '../utils/storage.js';
import { generateStateToken, validateStateToken } from '../utils/state-manager.js';
import { logInfo, logError } from '../utils/logging.js';
import { recordCredentialStored } from '../utils/metrics.js';
import {
  CredentialRecord,
  OAuthCredential,
  ERROR_CODES,
  CredentialError
} from '../types/index.js';

/**
 * OAuth token response from HubSpot
 */
interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
}

/**
 * Generates HubSpot authorization URL for OAuth flow
 * @param userId - User identifier
 * @returns Authorization URL to redirect user to
 */
export function generateAuthorizationURL(userId: string): string {
  const config = getServiceConfig();
  const state = generateStateToken(userId);

  logInfo('Generating HubSpot authorization URL', {
    user_id: userId,
    service_name: 'hubspot',
    action: 'authorize'
  });

  const params = new URLSearchParams({
    client_id: config.hubspot.clientId,
    redirect_uri: config.hubspot.redirectURI,
    scope: config.hubspot.scopes.join(' '),
    state
  });

  return `${config.hubspot.authorizationURL}?${params.toString()}`;
}

/**
 * Handles OAuth callback and exchanges authorization code for tokens
 * @param code - Authorization code from OAuth provider
 * @param state - CSRF token to validate
 * @returns Stored credential record
 * @throws CredentialError if OAuth exchange fails
 */
export async function handleOAuthCallback(
  code: string,
  state: string
): Promise<CredentialRecord> {
  logInfo('Handling HubSpot OAuth callback', {
    service_name: 'hubspot',
    action: 'callback'
  });

  // 1. Validate state token (CSRF protection)
  let userId: string;
  try {
    const stateToken = validateStateToken(state);
    userId = stateToken.userId;
  } catch (error) {
    logError('HubSpot OAuth state validation failed', {
      service_name: 'hubspot',
      action: 'callback',
      error: error instanceof Error ? error.message : String(error)
    });

    throw new CredentialError(
      'Invalid or expired state token',
      ERROR_CODES.OAUTH_EXCHANGE_FAILED,
      'hubspot'
    );
  }

  // 2. Exchange authorization code for tokens
  const config = getServiceConfig();
  const tokenResponse = await fetch(config.hubspot.tokenURL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.hubspot.clientId,
      client_secret: config.hubspot.clientSecret,
      redirect_uri: config.hubspot.redirectURI,
      code
    })
  });

  if (!tokenResponse.ok) {
    const errorData = await tokenResponse.json().catch(() => ({})) as { error?: string };
    logError('HubSpot token exchange failed', {
      user_id: userId,
      service_name: 'hubspot',
      action: 'token_exchange',
      status_code: tokenResponse.status,
      error: errorData.error || 'Unknown error'
    });

    throw new CredentialError(
      'Failed to connect to HubSpot. Please try again.',
      ERROR_CODES.OAUTH_EXCHANGE_FAILED,
      'hubspot'
    );
  }

  const tokens = await tokenResponse.json() as OAuthTokenResponse;

  // 3. Encrypt refresh token and access token
  const credential: OAuthCredential = {
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    scope: tokens.scope
  };

  const kmsKeyId = process.env.KMS_KEY_ID;
  if (!kmsKeyId) {
    throw new Error('KMS_KEY_ID environment variable not configured');
  }

  const encryptedData = await encryptCredential(credential, kmsKeyId);

  // 4. Store in DynamoDB
  const record: CredentialRecord = {
    user_id: userId,
    service_name: 'hubspot',
    credential_type: 'oauth',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    encrypted_data: encryptedData,
    display_name: 'HubSpot',
    masked_value: 'Connected'
  };

  await storeCredential(record);

  logInfo('HubSpot OAuth credential stored successfully', {
    user_id: userId,
    service_name: 'hubspot',
    action: 'store',
    credential_type: 'oauth'
  });
  await recordCredentialStored('hubspot', 'oauth');

  return record;
}

/**
 * Handles OAuth error parameters from callback
 * @param error - Error code from OAuth provider
 * @param errorDescription - Error description from OAuth provider
 * @returns User-friendly error message
 */
export function handleOAuthError(error: string, errorDescription?: string): string {
  if (error === 'access_denied') {
    return 'Authorization cancelled. No credentials were stored.';
  }

  if (errorDescription) {
    return `Authorization failed: ${errorDescription}`;
  }

  return `Authorization failed: ${error}`;
}
