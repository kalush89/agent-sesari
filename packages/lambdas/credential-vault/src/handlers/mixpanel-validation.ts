import { encryptCredential } from '../utils/encryption.js';
import { storeCredential } from '../utils/storage.js';
import { maskCredential } from '../utils/masking.js';
import { getServiceConfig, getLambdaConfig } from '../config/index.js';
import { logInfo, logError } from '../utils/logging.js';
import {
  recordValidationSuccess,
  recordValidationFailure,
  recordCredentialStored
} from '../utils/metrics.js';
import {
  ValidationResult,
  ServiceAccountCredential,
  CredentialRecord
} from '../types/index.js';

/**
 * Validates and stores Mixpanel service account credentials
 * @param userId - User identifier
 * @param username - Mixpanel service account username
 * @param secret - Mixpanel service account secret
 * @returns Validation result and stored credential
 */
export async function validateMixpanelCredentials(
  userId: string,
  username: string,
  secret: string
): Promise<ValidationResult> {
  const serviceConfig = getServiceConfig();
  const lambdaConfig = getLambdaConfig();

  logInfo('Starting Mixpanel credential validation', {
    user_id: userId,
    service_name: 'mixpanel',
    action: 'validate'
  });

  // 1. Validate non-empty
  if (!username || !username.trim()) {
    logError('Mixpanel validation failed: empty username', {
      user_id: userId,
      service_name: 'mixpanel',
      action: 'validate'
    });
    await recordValidationFailure('mixpanel');

    return {
      success: false,
      service_name: 'mixpanel',
      error_message: 'Username is required'
    };
  }

  if (!secret || !secret.trim()) {
    logError('Mixpanel validation failed: empty secret', {
      user_id: userId,
      service_name: 'mixpanel',
      action: 'validate'
    });
    await recordValidationFailure('mixpanel');

    return {
      success: false,
      service_name: 'mixpanel',
      error_message: 'Secret is required'
    };
  }

  // 2. Smoke test: Query API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), lambdaConfig.VALIDATION_TIMEOUT_MS);

    const auth = Buffer.from(`${username}:${secret}`).toString('base64');
    const response = await fetch(`${serviceConfig.mixpanel.apiBaseURL}${serviceConfig.mixpanel.smokeTestEndpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        where: 'properties["$email"] == "test@example.com"',
        limit: 1
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const statusCode = response.status;
      let errorMessage = 'Mixpanel credentials are invalid';

      if (statusCode === 401) {
        errorMessage = 'Invalid credentials. Please check your username and secret.';
      } else if (statusCode === 403) {
        errorMessage = 'Credentials lack required permissions.';
      } else if (statusCode === 429) {
        errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
      } else if (statusCode >= 500) {
        errorMessage = 'Service temporarily unavailable. Please try again later.';
      }

      logError('Mixpanel smoke test failed', {
        user_id: userId,
        service_name: 'mixpanel',
        action: 'validate',
        status_code: statusCode
      });
      await recordValidationFailure('mixpanel');

      return {
        success: false,
        service_name: 'mixpanel',
        error_message: errorMessage
      };
    }

    // 3. Encrypt and store
    const credential: ServiceAccountCredential = { username, secret };
    const encryptedData = await encryptCredential(credential, lambdaConfig.KMS_KEY_ID);

    const record: CredentialRecord = {
      user_id: userId,
      service_name: 'mixpanel',
      credential_type: 'service_account',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      encrypted_data: encryptedData,
      display_name: 'Mixpanel',
      masked_value: `${username} / ${maskCredential(secret)}`
    };

    await storeCredential(record);

    logInfo('Mixpanel credential stored successfully', {
      user_id: userId,
      service_name: 'mixpanel',
      action: 'store',
      credential_type: 'service_account'
    });
    await recordValidationSuccess('mixpanel');
    await recordCredentialStored('mixpanel', 'service_account');

    return {
      success: true,
      service_name: 'mixpanel',
      credential_record: record
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logError('Mixpanel validation timeout', {
        user_id: userId,
        service_name: 'mixpanel',
        action: 'validate'
      });
      await recordValidationFailure('mixpanel');

      return {
        success: false,
        service_name: 'mixpanel',
        error_message: 'Validation timeout. Please check your network connection.'
      };
    }

    logError('Mixpanel validation failed', {
      user_id: userId,
      service_name: 'mixpanel',
      action: 'validate',
      error: error instanceof Error ? error.message : String(error)
    });
    await recordValidationFailure('mixpanel');

    return {
      success: false,
      service_name: 'mixpanel',
      error_message: error instanceof Error ? error.message : 'Validation failed'
    };
  }
}
