"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateStripeKey = validateStripeKey;
const encryption_js_1 = require("../utils/encryption.js");
const storage_js_1 = require("../utils/storage.js");
const masking_js_1 = require("../utils/masking.js");
const index_js_1 = require("../config/index.js");
const logging_js_1 = require("../utils/logging.js");
const metrics_js_1 = require("../utils/metrics.js");
/**
 * Validates and stores a Stripe API key
 * @param userId - User identifier
 * @param apiKey - Stripe API key (sk_test_* or sk_live_*)
 * @returns Validation result and stored credential
 */
async function validateStripeKey(userId, apiKey) {
    const serviceConfig = (0, index_js_1.getServiceConfig)();
    const lambdaConfig = (0, index_js_1.getLambdaConfig)();
    (0, logging_js_1.logInfo)('Starting Stripe key validation', {
        user_id: userId,
        service_name: 'stripe',
        action: 'validate'
    });
    // 1. Validate format
    if (!serviceConfig.stripe.keyPattern.test(apiKey)) {
        (0, logging_js_1.logError)('Stripe key format validation failed', {
            user_id: userId,
            service_name: 'stripe',
            action: 'validate'
        });
        await (0, metrics_js_1.recordValidationFailure)('stripe');
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
            }
            else if (statusCode === 403) {
                errorMessage = 'Credentials lack required permissions.';
            }
            else if (statusCode === 429) {
                errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
            }
            else if (statusCode >= 500) {
                errorMessage = 'Service temporarily unavailable. Please try again later.';
            }
            (0, logging_js_1.logError)('Stripe smoke test failed', {
                user_id: userId,
                service_name: 'stripe',
                action: 'validate',
                status_code: statusCode
            });
            await (0, metrics_js_1.recordValidationFailure)('stripe');
            return {
                success: false,
                service_name: 'stripe',
                error_message: errorMessage
            };
        }
        // 3. Encrypt and store
        const credential = { api_key: apiKey };
        const encryptedData = await (0, encryption_js_1.encryptCredential)(credential, lambdaConfig.KMS_KEY_ID);
        const record = {
            user_id: userId,
            service_name: 'stripe',
            credential_type: 'api_key',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            encrypted_data: encryptedData,
            display_name: 'Stripe',
            masked_value: (0, masking_js_1.maskCredential)(apiKey)
        };
        await (0, storage_js_1.storeCredential)(record);
        (0, logging_js_1.logInfo)('Stripe credential stored successfully', {
            user_id: userId,
            service_name: 'stripe',
            action: 'store',
            credential_type: 'api_key'
        });
        await (0, metrics_js_1.recordValidationSuccess)('stripe');
        await (0, metrics_js_1.recordCredentialStored)('stripe', 'api_key');
        return {
            success: true,
            service_name: 'stripe',
            credential_record: record
        };
    }
    catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            (0, logging_js_1.logError)('Stripe validation timeout', {
                user_id: userId,
                service_name: 'stripe',
                action: 'validate'
            });
            await (0, metrics_js_1.recordValidationFailure)('stripe');
            return {
                success: false,
                service_name: 'stripe',
                error_message: 'Validation timeout. Please check your network connection.'
            };
        }
        (0, logging_js_1.logError)('Stripe validation failed', {
            user_id: userId,
            service_name: 'stripe',
            action: 'validate',
            error: error instanceof Error ? error.message : String(error)
        });
        await (0, metrics_js_1.recordValidationFailure)('stripe');
        return {
            success: false,
            service_name: 'stripe',
            error_message: error instanceof Error ? error.message : 'Validation failed'
        };
    }
}
//# sourceMappingURL=stripe-validation.js.map