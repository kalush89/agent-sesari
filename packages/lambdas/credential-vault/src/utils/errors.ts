/**
 * Error handling and sanitization utilities for credential vault operations
 */

/**
 * Sanitizes error messages by removing sensitive data patterns
 * @param error - Error object to sanitize
 * @returns Sanitized error message safe for logging and display
 */
export function sanitizeErrorMessage(error: Error): string {
  let message = error.message;

  // Remove Stripe API keys (sk_test_*, sk_live_*) - must be done first
  message = message.replace(/sk_(test|live)_[a-zA-Z0-9]+/g, '[REDACTED]');

  // Remove long tokens (20+ alphanumeric/underscore/dash characters)
  message = message.replace(/[a-zA-Z0-9_-]{20,}/g, '[REDACTED]');

  // Remove email addresses
  message = message.replace(/[\w\.-]+@[\w\.-]+\.\w+/g, '[REDACTED]');

  // Remove potential passwords or secrets in key-value patterns
  message = message.replace(/(password|secret|token|key)[\s:=]+[^\s,}]+/gi, '$1=[REDACTED]');

  return message;
}

/**
 * Maps HTTP status codes to user-friendly error messages
 * @param statusCode - HTTP status code from external API
 * @returns Descriptive error message for the user
 */
export function getErrorMessageForStatus(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return 'Invalid request. Please check your credentials and try again.';
    case 401:
      return 'Invalid credentials. Please check your API key or credentials.';
    case 403:
      return 'Credentials lack required permissions.';
    case 404:
      return 'Service endpoint not found. Please contact support.';
    case 429:
      return 'Rate limit exceeded. Please try again in a few minutes.';
    case 500:
    case 502:
    case 503:
    case 504:
      return 'Service temporarily unavailable. Please try again later.';
    default:
      if (statusCode >= 400 && statusCode < 500) {
        return 'Invalid credentials or request. Please check your input.';
      } else if (statusCode >= 500) {
        return 'External service error. Please try again later.';
      }
      return 'An unexpected error occurred. Please try again.';
  }
}
