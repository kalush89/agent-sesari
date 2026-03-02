"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateMixpanelCredentials = validateMixpanelCredentials;
const encryption_js_1 = require("../utils/encryption.js");
const storage_js_1 = require("../utils/storage.js");
const masking_js_1 = require("../utils/masking.js");
const index_js_1 = require("../config/index.js");
const logging_js_1 = require("../utils/logging.js");
const metrics_js_1 = require("../utils/metrics.js");
/**
 * Validates and stores Mixpanel service account credentials
 * @param userId - User identifier
 * @param username - Mixpanel service account username
 * @param secret - Mixpanel service account secret
 * @returns Validation result and stored credential
 */
async function validateMixpanelCredentials(userId, username, secret) {
    const serviceConfig = (0, index_js_1.getServiceConfig)();
    const lambdaConfig = (0, index_js_1.getLambdaConfig)();
    (0, logging_js_1.logInfo)('Starting Mixpanel credential validation', {
        user_id: userId,
        service_name: 'mixpanel',
        action: 'validate'
    });
    // 1. Validate non-empty
    if (!username || !username.trim()) {
        (0, logging_js_1.logError)('Mixpanel validation failed: empty username', {
            user_id: userId,
            service_name: 'mixpanel',
            action: 'validate'
        });
        await (0, metrics_js_1.recordValidationFailure)('mixpanel');
        return {
            success: false,
            service_name: 'mixpanel',
            error_message: 'Username is required'
        };
    }
    if (!secret || !secret.trim()) {
        (0, logging_js_1.logError)('Mixpanel validation failed: empty secret', {
            user_id: userId,
            service_name: 'mixpanel',
            action: 'validate'
        });
        await (0, metrics_js_1.recordValidationFailure)('mixpanel');
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
            (0, logging_js_1.logError)('Mixpanel smoke test failed', {
                user_id: userId,
                service_name: 'mixpanel',
                action: 'validate',
                status_code: statusCode
            });
            await (0, metrics_js_1.recordValidationFailure)('mixpanel');
            return {
                success: false,
                service_name: 'mixpanel',
                error_message: errorMessage
            };
        }
        // 3. Encrypt and store
        const credential = { username, secret };
        const encryptedData = await (0, encryption_js_1.encryptCredential)(credential, lambdaConfig.KMS_KEY_ID);
        const record = {
            user_id: userId,
            service_name: 'mixpanel',
            credential_type: 'service_account',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            encrypted_data: encryptedData,
            display_name: 'Mixpanel',
            masked_value: `${username} / ${(0, masking_js_1.maskCredential)(secret)}`
        };
        await (0, storage_js_1.storeCredential)(record);
        (0, logging_js_1.logInfo)('Mixpanel credential stored successfully', {
            user_id: userId,
            service_name: 'mixpanel',
            action: 'store',
            credential_type: 'service_account'
        });
        await (0, metrics_js_1.recordValidationSuccess)('mixpanel');
        await (0, metrics_js_1.recordCredentialStored)('mixpanel', 'service_account');
        return {
            success: true,
            service_name: 'mixpanel',
            credential_record: record
        };
    }
    catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            (0, logging_js_1.logError)('Mixpanel validation timeout', {
                user_id: userId,
                service_name: 'mixpanel',
                action: 'validate'
            });
            await (0, metrics_js_1.recordValidationFailure)('mixpanel');
            return {
                success: false,
                service_name: 'mixpanel',
                error_message: 'Validation timeout. Please check your network connection.'
            };
        }
        (0, logging_js_1.logError)('Mixpanel validation failed', {
            user_id: userId,
            service_name: 'mixpanel',
            action: 'validate',
            error: error instanceof Error ? error.message : String(error)
        });
        await (0, metrics_js_1.recordValidationFailure)('mixpanel');
        return {
            success: false,
            service_name: 'mixpanel',
            error_message: error instanceof Error ? error.message : 'Validation failed'
        };
    }
}
//# sourceMappingURL=mixpanel-validation.js.map