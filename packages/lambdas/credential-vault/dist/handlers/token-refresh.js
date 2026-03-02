"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshAccessToken = refreshAccessToken;
exports.isTokenExpired = isTokenExpired;
const index_js_1 = require("../config/index.js");
const encryption_js_1 = require("../utils/encryption.js");
const storage_js_1 = require("../utils/storage.js");
const logging_js_1 = require("../utils/logging.js");
const metrics_js_1 = require("../utils/metrics.js");
const index_js_2 = require("../types/index.js");
/**
 * Refreshes expired OAuth access token using refresh token
 * @param userId - User identifier
 * @param serviceName - Service to refresh (currently only 'hubspot')
 * @returns New access token and expiry timestamp
 * @throws CredentialError if refresh fails
 */
async function refreshAccessToken(userId, serviceName) {
    (0, logging_js_1.logInfo)('Starting token refresh', {
        user_id: userId,
        service_name: serviceName,
        action: 'refresh'
    });
    // 1. Retrieve credential from DynamoDB
    const record = await (0, storage_js_1.getCredential)(userId, serviceName);
    if (!record) {
        (0, logging_js_1.logError)('Token refresh failed: credential not found', {
            user_id: userId,
            service_name: serviceName,
            action: 'refresh'
        });
        throw new index_js_2.CredentialError(`No credentials found for service: ${serviceName}`, index_js_2.ERROR_CODES.NOT_FOUND, 'hubspot');
    }
    if (record.credential_type !== 'oauth') {
        throw new index_js_2.CredentialError('Cannot refresh non-OAuth credentials', index_js_2.ERROR_CODES.REFRESH_FAILED, 'hubspot');
    }
    // 2. Decrypt to get refresh token
    const kmsKeyId = process.env.KMS_KEY_ID;
    if (!kmsKeyId) {
        throw new Error('KMS_KEY_ID environment variable not configured');
    }
    const credential = await (0, encryption_js_1.decryptCredential)(record.encrypted_data, kmsKeyId);
    if (!credential.refresh_token) {
        throw new index_js_2.CredentialError('No refresh token available', index_js_2.ERROR_CODES.REFRESH_FAILED, 'hubspot');
    }
    // 3. Request new access token
    const config = (0, index_js_1.getServiceConfig)();
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
        const errorData = await tokenResponse.json().catch(() => ({}));
        (0, logging_js_1.logError)('Token refresh failed', {
            user_id: userId,
            service_name: serviceName,
            action: 'refresh',
            status_code: tokenResponse.status,
            error: errorData.error || 'Unknown error'
        });
        throw new index_js_2.CredentialError('HubSpot credentials expired. User must reconnect.', index_js_2.ERROR_CODES.REFRESH_FAILED, 'hubspot');
    }
    const tokens = await tokenResponse.json();
    // 4. Update stored credential with new access token
    credential.access_token = tokens.access_token;
    credential.token_expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const encryptedData = await (0, encryption_js_1.encryptCredential)(credential, kmsKeyId);
    await (0, storage_js_1.updateCredential)(userId, serviceName, {
        encrypted_data: encryptedData,
        updated_at: new Date().toISOString()
    });
    (0, logging_js_1.logInfo)('Access token refreshed successfully', {
        user_id: userId,
        service_name: serviceName,
        action: 'refresh'
    });
    await (0, metrics_js_1.recordTokenRefresh)(serviceName);
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
function isTokenExpired(tokenExpiry) {
    if (!tokenExpiry) {
        return true;
    }
    const expiryDate = new Date(tokenExpiry);
    const now = new Date();
    // Consider token expired if it expires within 5 minutes (buffer for clock skew)
    const BUFFER_MS = 5 * 60 * 1000;
    return expiryDate.getTime() - now.getTime() < BUFFER_MS;
}
//# sourceMappingURL=token-refresh.js.map