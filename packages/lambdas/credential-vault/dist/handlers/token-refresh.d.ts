/**
 * Token refresh response from OAuth provider
 */
interface TokenRefreshResponse {
    access_token: string;
    expires_at: string;
}
/**
 * Refreshes expired OAuth access token using refresh token
 * @param userId - User identifier
 * @param serviceName - Service to refresh (currently only 'hubspot')
 * @returns New access token and expiry timestamp
 * @throws CredentialError if refresh fails
 */
export declare function refreshAccessToken(userId: string, serviceName: string): Promise<TokenRefreshResponse>;
/**
 * Checks if an OAuth access token is expired
 * @param tokenExpiry - ISO 8601 timestamp of token expiry
 * @returns True if token is expired or will expire within 5 minutes
 */
export declare function isTokenExpired(tokenExpiry?: string): boolean;
export {};
//# sourceMappingURL=token-refresh.d.ts.map