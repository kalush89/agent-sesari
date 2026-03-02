import { decryptCredential } from '../utils/encryption.js';
import { getCredential } from '../utils/storage.js';
import { refreshAccessToken, isTokenExpired } from './token-refresh.js';
import { logInfo, logError } from '../utils/logging.js';
import {
  DecryptedCredential,
  OAuthCredential,
  CredentialError,
  ERROR_CODES,
  ServiceName
} from '../types/index.js';

/**
 * Retrieves and decrypts credentials for a service
 * Automatically refreshes expired OAuth tokens before returning
 * @param userId - User identifier
 * @param serviceName - Service to retrieve credentials for
 * @returns Decrypted credential data ready for agent use
 * @throws CredentialError if service is not connected or retrieval fails
 */
export async function getCredentials(
  userId: string,
  serviceName: ServiceName
): Promise<DecryptedCredential> {
  logInfo('Retrieving credentials', {
    user_id: userId,
    service_name: serviceName,
    action: 'retrieve'
  });

  // 1. Query DynamoDB for credential record
  const record = await getCredential(userId, serviceName);

  if (!record) {
    logError('Credential retrieval failed: not found', {
      user_id: userId,
      service_name: serviceName,
      action: 'retrieve'
    });

    throw new CredentialError(
      `No credentials found for service: ${serviceName}`,
      ERROR_CODES.NOT_FOUND,
      serviceName
    );
  }

  // 2. Decrypt credential data
  const kmsKeyId = process.env.KMS_KEY_ID;
  if (!kmsKeyId) {
    throw new Error('KMS_KEY_ID environment variable not configured');
  }

  let decryptedData;
  try {
    decryptedData = await decryptCredential(record.encrypted_data, kmsKeyId);
  } catch (error) {
    logError('Failed to decrypt credentials', {
      user_id: userId,
      service_name: serviceName,
      action: 'retrieve',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    throw new CredentialError(
      'Unable to retrieve credentials. Please reconnect the service.',
      ERROR_CODES.DECRYPTION_FAILED,
      serviceName
    );
  }

  // 3. For OAuth credentials, check if token needs refresh
  if (record.credential_type === 'oauth') {
    const oauthCred = decryptedData as OAuthCredential;

    if (isTokenExpired(oauthCred.token_expiry)) {
      logInfo('OAuth token expired, refreshing', {
        user_id: userId,
        service_name: serviceName,
        action: 'refresh'
      });

      try {
        const refreshed = await refreshAccessToken(userId, serviceName);
        oauthCred.access_token = refreshed.access_token;
        oauthCred.token_expiry = refreshed.expires_at;
      } catch (error) {
        logError('Token refresh failed during retrieval', {
          user_id: userId,
          service_name: serviceName,
          action: 'refresh',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        // Re-throw the error from refresh (already a CredentialError)
        throw error;
      }
    }
  }

  logInfo('Credentials retrieved successfully', {
    user_id: userId,
    service_name: serviceName,
    action: 'retrieve',
    credential_type: record.credential_type
  });

  return {
    service_name: serviceName,
    credential_type: record.credential_type,
    data: decryptedData
  };
}
