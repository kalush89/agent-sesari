/**
 * Shared TypeScript types for credential vault operations
 */
/**
 * Supported credential types
 */
export type CredentialType = "oauth" | "api_key" | "service_account";
/**
 * Supported service names
 */
export type ServiceName = "hubspot" | "stripe" | "mixpanel";
/**
 * OAuth credential payload (HubSpot)
 */
export interface OAuthCredential {
    refresh_token: string;
    access_token?: string;
    token_expiry?: string;
    scope?: string;
}
/**
 * API Key credential payload (Stripe)
 */
export interface APIKeyCredential {
    api_key: string;
}
/**
 * Service Account credential payload (Mixpanel)
 */
export interface ServiceAccountCredential {
    username: string;
    secret: string;
}
/**
 * Union type for all credential payloads
 */
export type CredentialPayload = OAuthCredential | APIKeyCredential | ServiceAccountCredential;
/**
 * DynamoDB credential record structure
 */
export interface CredentialRecord {
    user_id: string;
    service_name: ServiceName;
    credential_type: CredentialType;
    created_at: string;
    updated_at: string;
    encrypted_data: string;
    display_name: string;
    masked_value: string;
}
/**
 * Decrypted credential for agent use
 */
export interface DecryptedCredential {
    service_name: ServiceName;
    credential_type: CredentialType;
    data: CredentialPayload;
}
/**
 * Validation result from credential validation
 */
export interface ValidationResult {
    success: boolean;
    service_name: ServiceName;
    error_message?: string;
    credential_record?: CredentialRecord;
}
/**
 * Error codes for credential operations
 */
export declare const ERROR_CODES: {
    readonly INVALID_FORMAT: "INVALID_FORMAT";
    readonly VALIDATION_FAILED: "VALIDATION_FAILED";
    readonly ENCRYPTION_FAILED: "ENCRYPTION_FAILED";
    readonly DECRYPTION_FAILED: "DECRYPTION_FAILED";
    readonly NOT_FOUND: "NOT_FOUND";
    readonly OAUTH_EXCHANGE_FAILED: "OAUTH_EXCHANGE_FAILED";
    readonly REFRESH_FAILED: "REFRESH_FAILED";
    readonly TIMEOUT: "TIMEOUT";
    readonly STORAGE_FAILED: "STORAGE_FAILED";
};
/**
 * Custom error class for credential operations
 */
export declare class CredentialError extends Error {
    code: string;
    serviceName?: ServiceName | undefined;
    constructor(message: string, code: string, serviceName?: ServiceName | undefined);
}
//# sourceMappingURL=index.d.ts.map