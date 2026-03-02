import { CredentialRecord } from '../types/index.js';
/**
 * Generates HubSpot authorization URL for OAuth flow
 * @param userId - User identifier
 * @returns Authorization URL to redirect user to
 */
export declare function generateAuthorizationURL(userId: string): string;
/**
 * Handles OAuth callback and exchanges authorization code for tokens
 * @param code - Authorization code from OAuth provider
 * @param state - CSRF token to validate
 * @returns Stored credential record
 * @throws CredentialError if OAuth exchange fails
 */
export declare function handleOAuthCallback(code: string, state: string): Promise<CredentialRecord>;
/**
 * Handles OAuth error parameters from callback
 * @param error - Error code from OAuth provider
 * @param errorDescription - Error description from OAuth provider
 * @returns User-friendly error message
 */
export declare function handleOAuthError(error: string, errorDescription?: string): string;
//# sourceMappingURL=hubspot-oauth.d.ts.map