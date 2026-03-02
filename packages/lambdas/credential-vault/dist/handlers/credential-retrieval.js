"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCredentials = getCredentials;
const encryption_js_1 = require("../utils/encryption.js");
const storage_js_1 = require("../utils/storage.js");
const token_refresh_js_1 = require("./token-refresh.js");
const logging_js_1 = require("../utils/logging.js");
const index_js_1 = require("../types/index.js");
/**
 * Retrieves and decrypts credentials for a service
 * Automatically refreshes expired OAuth tokens before returning
 * @param userId - User identifier
 * @param serviceName - Service to retrieve credentials for
 * @returns Decrypted credential data ready for agent use
 * @throws CredentialError if service is not connected or retrieval fails
 */
async function getCredentials(userId, serviceName) {
    (0, logging_js_1.logInfo)('Retrieving credentials', {
        user_id: userId,
        service_name: serviceName,
        action: 'retrieve'
    });
    // 1. Query DynamoDB for credential record
    const record = await (0, storage_js_1.getCredential)(userId, serviceName);
    if (!record) {
        (0, logging_js_1.logError)('Credential retrieval failed: not found', {
            user_id: userId,
            service_name: serviceName,
            action: 'retrieve'
        });
        throw new index_js_1.CredentialError(`No credentials found for service: ${serviceName}`, index_js_1.ERROR_CODES.NOT_FOUND, serviceName);
    }
    // 2. Decrypt credential data
    const kmsKeyId = process.env.KMS_KEY_ID;
    if (!kmsKeyId) {
        throw new Error('KMS_KEY_ID environment variable not configured');
    }
    let decryptedData;
    try {
        decryptedData = await (0, encryption_js_1.decryptCredential)(record.encrypted_data, kmsKeyId);
    }
    catch (error) {
        (0, logging_js_1.logError)('Failed to decrypt credentials', {
            user_id: userId,
            service_name: serviceName,
            action: 'retrieve',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw new index_js_1.CredentialError('Unable to retrieve credentials. Please reconnect the service.', index_js_1.ERROR_CODES.DECRYPTION_FAILED, serviceName);
    }
    // 3. For OAuth credentials, check if token needs refresh
    if (record.credential_type === 'oauth') {
        const oauthCred = decryptedData;
        if ((0, token_refresh_js_1.isTokenExpired)(oauthCred.token_expiry)) {
            (0, logging_js_1.logInfo)('OAuth token expired, refreshing', {
                user_id: userId,
                service_name: serviceName,
                action: 'refresh'
            });
            try {
                const refreshed = await (0, token_refresh_js_1.refreshAccessToken)(userId, serviceName);
                oauthCred.access_token = refreshed.access_token;
                oauthCred.token_expiry = refreshed.expires_at;
            }
            catch (error) {
                (0, logging_js_1.logError)('Token refresh failed during retrieval', {
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
    (0, logging_js_1.logInfo)('Credentials retrieved successfully', {
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
//# sourceMappingURL=credential-retrieval.js.map