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
  APIKeyCredential,
  CredentialRecord
} from '../types/index.js';

/**
 * Validates and stores a Stripe API key
 * @param userId - User identifier
 * @param apiKey - Stripe API key (sk_test_* or sk_live_*)
 * @returns Validation result and stored credential
 */
export async function validateStripeKey(
  userId: string,
  apiKey: string
): Promise<ValidationResult> {
  const serviceConfig = getServiceConfig();
  const lambdaConfig = getLambdaConfig();

  logInfo('Starting Stripe key validation', {
    user_id: userId,
    service_name: 'stripe',
    action: 'validate'
  });

  // 1. Validate format
  if (!serviceConfig.stripe.keyPattern.test(apiKey)) {
    logError('Stripe key format validation failed', {
      user_id: userId,
      service_name: 'stripe',
      action: 'validate'
    });
    await recordValidationFailure('stripe');

    return {
      success: false,
      service_name: 'stripe',
      error_message: 'Invalid Stripe API key format. Must start with sk_test_ or sk_live_'
    };
  }

  // 2. Smoke test: Retrieve account
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), lambdaConfig.VALIDATION_TIMEOUT_MS);

    const response = await fetch(`${serviceConfig.stripe.apiBaseURL}${serviceConfig.stripe.smokeTestEndpoint}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const statusCode = response.status;
      let errorMessage = 'Stripe API key is invalid or lacks required permissions';

      if (statusCode === 401) {
        errorMessage = 'Invalid credentials. Please check your API key.';
      } else if (statusCode === 403) {
        errorMessage = 'Credentials lack required permissions.';
      } else if (statusCode === 429) {
        errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
      } else if (statusCode >= 500) {
        errorMessage = 'Service temporarily unavailable. Please try again later.';
      }

      logError('Stripe smoke test failed', {
        user_id: userId,
        service_name: 'stripe',
        action: 'validate',
        status_code: statusCode
      });
      await recordValidationFailure('stripe');

      return {
        success: false,
        service_name: 'stripe',
        error_message: errorMessage
      };
    }

    // 3. Encrypt and store
    const credential: APIKeyCredential = { api_key: apiKey };
    const encryptedData = await encryptCredential(credential, lambdaConfig.KMS_KEY_ID);

    const record: CredentialRecord = {
      user_id: userId,
      service_name: 'stripe',
      credential_type: 'api_key',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      encrypted_data: encryptedData,
      display_name: 'Stripe',
      masked_value: maskCredential(apiKey)
    };

    await storeCredential(record);

    logInfo('Stripe credential stored successfully', {
      user_id: userId,
      service_name: 'stripe',
      action: 'store',
      credential_type: 'api_key'
    });
    await recordValidationSuccess('stripe');
    await recordCredentialStored('stripe', 'api_key');

    return {
      success: true,
      service_name: 'stripe',
      credential_record: record
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logError('Stripe validation timeout', {
        user_id: userId,
        service_name: 'stripe',
        action: 'validate'
      });
      await recordValidationFailure('stripe');

      return {
        success: false,
        service_name: 'stripe',
        error_message: 'Validation timeout. Please check your network connection.'
      };
    }

    logError('Stripe validation failed', {
      user_id: userId,
      service_name: 'stripe',
      action: 'validate',
      error: error instanceof Error ? error.message : String(error)
    });
    await recordValidationFailure('stripe');

    return {
      success: false,
      service_name: 'stripe',
      error_message: error instanceof Error ? error.message : 'Validation failed'
    };
  }
}
