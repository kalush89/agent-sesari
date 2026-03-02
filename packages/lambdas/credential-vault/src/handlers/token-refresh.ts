import { getServiceConfig } from '../config/index.js';
import { encryptCredential, decryptCredential } from '../utils/encryption.js';
import { getCredential, updateCredential } from '../utils/storage.js';
import { logInfo, logError } from '../utils/logging.js';
import { recordTokenRefresh } from '../utils/metrics.js';
import {
  OAuthCredential,
  ERROR_CODES,
  CredentialError
} from '../types/index.js';

/**
 * OAuth token response from refresh endpoint
 */
interface OAuthRefreshResponse {
  access_token: string;
  expires_in: number;
}

/**
 * Token refresh response from OAuth provider
 */
interface TokenRefreshResponse {
  access_token: string;
  expires_at: string;
}

/**
 * Refreshes expired OAuth access token using refresh token
 * @param userId - User identifier
 * @param serviceName - Service to refresh (currently only 'hubspot')
 * @returns New access token and expiry timestamp
 * @throws CredentialError if refresh fails
 */
export async function refreshAccessToken(
  userId: string,
  serviceName: string
): Promise<TokenRefreshResponse> {
  logInfo('Starting token refresh', {
    user_id: userId,
    service_name: serviceName,
    action: 'refresh'
  });

  // 1. Retrieve credential from DynamoDB
  const record = await getCredential(userId, serviceName);
  
  if (!record) {
    logError('Token refresh failed: credential not found', {
      user_id: userId,
      service_name: serviceName,
      action: 'refresh'
    });

    throw new CredentialError(
      `No credentials found for service: ${serviceName}`,
      ERROR_CODES.NOT_FOUND,
      'hubspot'
    );
  }

  if (record.credential_type !== 'oauth') {
    throw new CredentialError(
      'Cannot refresh non-OAuth credentials',
      ERROR_CODES.REFRESH_FAILED,
      'hubspot'
    );
  }

  // 2. Decrypt to get refresh token
  const kmsKeyId = process.env.KMS_KEY_ID;
  if (!kmsKeyId) {
    throw new Error('KMS_KEY_ID environment variable not configured');
  }

  const credential = await decryptCredential(
    record.encrypted_data,
    kmsKeyId
  ) as OAuthCredential;

  if (!credential.refresh_token) {
    throw new CredentialError(
      'No refresh token available',
      ERROR_CODES.REFRESH_FAILED,
      'hubspot'
    );
  }

  // 3. Request new access token
  const config = getServiceConfig();
  const tokenResponse = await fetch(config.hubspot.tokenURL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.hubspot.clientId,
      client_secret: config.hubspot.clientSecret,
      refresh_token: credential.refresh_token
    })
  });

  if (!tokenResponse.ok) {
    const errorData = await tokenResponse.json().catch(() => ({})) as { error?: string };
    logError('Token refresh failed', {
      user_id: userId,
      service_name: serviceName,
      action: 'refresh',
      status_code: tokenResponse.status,
      error: errorData.error || 'Unknown error'
    });
    
    throw new CredentialError(
      'HubSpot credentials expired. User must reconnect.',
      ERROR_CODES.REFRESH_FAILED,
      'hubspot'
    );
  }

  const tokens = await tokenResponse.json() as OAuthRefreshResponse;

  // 4. Update stored credential with new access token
  credential.access_token = tokens.access_token;
  credential.token_expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const encryptedData = await encryptCredential(credential, kmsKeyId);

  await updateCredential(userId, serviceName, {
    encrypted_data: encryptedData,
    updated_at: new Date().toISOString()
  });

  logInfo('Access token refreshed successfully', {
    user_id: userId,
    service_name: serviceName,
    action: 'refresh'
  });
  await recordTokenRefresh(serviceName);

  return {
    access_token: tokens.access_token,
    expires_at: credential.token_expiry
  };
}

/**
 * Checks if an OAuth access token is expired
 * @param tokenExpiry - ISO 8601 timestamp of token expiry
 * @returns True if token is expired or will expire within 5 minutes
 */
export function isTokenExpired(tokenExpiry?: string): boolean {
  if (!tokenExpiry) {
    return true;
  }

  const expiryDate = new Date(tokenExpiry);
  const now = new Date();
  
  // Consider token expired if it expires within 5 minutes (buffer for clock skew)
  const BUFFER_MS = 5 * 60 * 1000;
  
  return expiryDate.getTime() - now.getTime() < BUFFER_MS;
}
