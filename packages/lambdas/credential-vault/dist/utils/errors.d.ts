/**
 * Error handling and sanitization utilities for credential vault operations
 */
/**
 * Sanitizes error messages by removing sensitive data patterns
 * @param error - Error object to sanitize
 * @returns Sanitized error message safe for logging and display
 */
export declare function sanitizeErrorMessage(error: Error): string;
/**
 * Maps HTTP status codes to user-friendly error messages
 * @param statusCode - HTTP status code from external API
 * @returns Descriptive error message for the user
 */
export declare function getErrorMessageForStatus(statusCode: number): string;
//# sourceMappingURL=errors.d.ts.map