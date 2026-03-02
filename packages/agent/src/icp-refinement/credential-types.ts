/**
 * Credential vault types for data fetching
 * Duplicated from credential-vault package to maintain TypeScript compilation boundaries
 */

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
 * Decrypted credential for agent use
 */
export interface DecryptedCredential {
  service_name: ServiceName;
  credential_type: string;
  data: CredentialPayload;
}

/**
 * Error codes for credential operations
 */
export const ERROR_CODES = {
  NOT_FOUND: 'NOT_FOUND',
} as const;

/**
 * Custom error class for credential operations
 */
export class CredentialError extends Error {
  constructor(
    message: string,
    public code: string,
    public serviceName?: ServiceName
  ) {
    super(message);
    this.name = 'CredentialError';
  }
}
