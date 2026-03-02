/**
 * Configuration for credential vault services
 */
/**
 * Service-specific configuration
 */
export interface ServiceConfig {
    hubspot: {
        authorizationURL: string;
        tokenURL: string;
        clientId: string;
        clientSecret: string;
        redirectURI: string;
        scopes: string[];
    };
    stripe: {
        apiBaseURL: string;
        keyPattern: RegExp;
        smokeTestEndpoint: string;
    };
    mixpanel: {
        apiBaseURL: string;
        smokeTestEndpoint: string;
    };
}
/**
 * Get service configuration from environment variables
 */
export declare function getServiceConfig(): ServiceConfig;
/**
 * Environment configuration for Lambda functions
 */
export interface LambdaConfig {
    KMS_KEY_ID: string;
    CREDENTIAL_TABLE_NAME: string;
    AWS_REGION: string;
    VALIDATION_TIMEOUT_MS: number;
}
/**
 * Get Lambda configuration from environment variables
 */
export declare function getLambdaConfig(): LambdaConfig;
/**
 * Alias for getLambdaConfig for backward compatibility
 */
export declare function getConfig(): LambdaConfig;
//# sourceMappingURL=index.d.ts.map