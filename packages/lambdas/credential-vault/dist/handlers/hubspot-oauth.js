"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAuthorizationURL = generateAuthorizationURL;
exports.handleOAuthCallback = handleOAuthCallback;
exports.handleOAuthError = handleOAuthError;
const index_js_1 = require("../config/index.js");
const encryption_js_1 = require("../utils/encryption.js");
const storage_js_1 = require("../utils/storage.js");
const state_manager_js_1 = require("../utils/state-manager.js");
const logging_js_1 = require("../utils/logging.js");
const metrics_js_1 = require("../utils/metrics.js");
const index_js_2 = require("../types/index.js");
/**
 * Generates HubSpot authorization URL for OAuth flow
 * @param userId - User identifier
 * @returns Authorization URL to redirect user to
 */
function generateAuthorizationURL(userId) {
    const config = (0, index_js_1.getServiceConfig)();
    const state = (0, state_manager_js_1.generateStateToken)(userId);
    (0, logging_js_1.logInfo)('Generating HubSpot authorization URL', {
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
async function handleOAuthCallback(code, state) {
    (0, logging_js_1.logInfo)('Handling HubSpot OAuth callback', {
        service_name: 'hubspot',
        action: 'callback'
    });
    // 1. Validate state token (CSRF protection)
    let userId;
    try {
        const stateToken = (0, state_manager_js_1.validateStateToken)(state);
        userId = stateToken.userId;
    }
    catch (error) {
        (0, logging_js_1.logError)('HubSpot OAuth state validation failed', {
            service_name: 'hubspot',
            action: 'callback',
            error: error instanceof Error ? error.message : String(error)
        });
        throw new index_js_2.CredentialError('Invalid or expired state token', index_js_2.ERROR_CODES.OAUTH_EXCHANGE_FAILED, 'hubspot');
    }
    // 2. Exchange authorization code for tokens
    const config = (0, index_js_1.getServiceConfig)();
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
        const errorData = await tokenResponse.json().catch(() => ({}));
        (0, logging_js_1.logError)('HubSpot token exchange failed', {
            user_id: userId,
            service_name: 'hubspot',
            action: 'token_exchange',
            status_code: tokenResponse.status,
            error: errorData.error || 'Unknown error'
        });
        throw new index_js_2.CredentialError('Failed to connect to HubSpot. Please try again.', index_js_2.ERROR_CODES.OAUTH_EXCHANGE_FAILED, 'hubspot');
    }
    const tokens = await tokenResponse.json();
    // 3. Encrypt refresh token and access token
    const credential = {
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        scope: tokens.scope
    };
    const kmsKeyId = process.env.KMS_KEY_ID;
    if (!kmsKeyId) {
        throw new Error('KMS_KEY_ID environment variable not configured');
    }
    const encryptedData = await (0, encryption_js_1.encryptCredential)(credential, kmsKeyId);
    // 4. Store in DynamoDB
    const record = {
        user_id: userId,
        service_name: 'hubspot',
        credential_type: 'oauth',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        encrypted_data: encryptedData,
        display_name: 'HubSpot',
        masked_value: 'Connected'
    };
    await (0, storage_js_1.storeCredential)(record);
    (0, logging_js_1.logInfo)('HubSpot OAuth credential stored successfully', {
        user_id: userId,
        service_name: 'hubspot',
        action: 'store',
        credential_type: 'oauth'
    });
    await (0, metrics_js_1.recordCredentialStored)('hubspot', 'oauth');
    return record;
}
/**
 * Handles OAuth error parameters from callback
 * @param error - Error code from OAuth provider
 * @param errorDescription - Error description from OAuth provider
 * @returns User-friendly error message
 */
function handleOAuthError(error, errorDescription) {
    if (error === 'access_denied') {
        return 'Authorization cancelled. No credentials were stored.';
    }
    if (errorDescription) {
        return `Authorization failed: ${errorDescription}`;
    }
    return `Authorization failed: ${error}`;
}
//# sourceMappingURL=hubspot-oauth.js.map