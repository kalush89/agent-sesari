"use strict";
/**
 * Configuration for credential vault services
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getServiceConfig = getServiceConfig;
exports.getLambdaConfig = getLambdaConfig;
exports.getConfig = getConfig;
/**
 * Get service configuration from environment variables
 */
function getServiceConfig() {
    return {
        hubspot: {
            authorizationURL: 'https://app.hubspot.com/oauth/authorize',
            tokenURL: 'https://api.hubapi.com/oauth/v1/token',
            clientId: process.env.HUBSPOT_CLIENT_ID || '',
            clientSecret: process.env.HUBSPOT_CLIENT_SECRET || '',
            redirectURI: process.env.HUBSPOT_REDIRECT_URI || '',
            scopes: ['crm.objects.companies.read', 'crm.objects.deals.read']
        },
        stripe: {
            apiBaseURL: 'https://api.stripe.com/v1',
            keyPattern: /^sk_(test|live)_[a-zA-Z0-9]+$/,
            smokeTestEndpoint: '/account'
        },
        mixpanel: {
            apiBaseURL: 'https://mixpanel.com/api/2.0',
            smokeTestEndpoint: '/engage'
        }
    };
}
/**
 * Get Lambda configuration from environment variables
 */
function getLambdaConfig() {
    return {
        KMS_KEY_ID: process.env.KMS_KEY_ID || '',
        CREDENTIAL_TABLE_NAME: process.env.CREDENTIAL_TABLE_NAME || 'sesari-credentials',
        AWS_REGION: process.env.AWS_REGION || 'us-east-1',
        VALIDATION_TIMEOUT_MS: parseInt(process.env.VALIDATION_TIMEOUT_MS || '5000', 10)
    };
}
/**
 * Alias for getLambdaConfig for backward compatibility
 */
function getConfig() {
    return getLambdaConfig();
}
//# sourceMappingURL=index.js.map