/**
 * State token structure for CSRF protection
 */
export interface StateToken {
    userId: string;
    timestamp: number;
    nonce: string;
}
/**
 * Generates a secure state token for OAuth CSRF protection
 * @param userId - User identifier
 * @returns Base64 encoded state token with HMAC signature
 */
export declare function generateStateToken(userId: string): string;
/**
 * Validates a state token and returns the decoded state
 * @param token - State token to validate
 * @returns Decoded state token
 * @throws Error if token is invalid or expired
 */
export declare function validateStateToken(token: string): StateToken;
//# sourceMappingURL=state-manager.d.ts.map