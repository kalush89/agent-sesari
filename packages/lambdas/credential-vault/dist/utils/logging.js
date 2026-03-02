"use strict";
/**
 * Structured logging utility for Lambda functions
 * Outputs JSON-formatted logs for CloudWatch with context
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.log = log;
exports.logInfo = logInfo;
exports.logWarn = logWarn;
exports.logError = logError;
exports.logDebug = logDebug;
/**
 * Sanitizes context to remove sensitive data before logging
 * @param context - Log context that may contain sensitive data
 * @returns Sanitized context safe for logging
 */
function sanitizeContext(context) {
    const sanitized = { ...context };
    // Remove sensitive fields
    const sensitiveFields = [
        'api_key',
        'secret',
        'refresh_token',
        'access_token',
        'password',
        'token',
        'credential',
        'encrypted_data',
        'plaintext'
    ];
    for (const field of sensitiveFields) {
        if (field in sanitized) {
            delete sanitized[field];
        }
    }
    return sanitized;
}
/**
 * Logs a structured message to CloudWatch
 * @param level - Log level (INFO, WARN, ERROR, DEBUG)
 * @param message - Human-readable log message
 * @param context - Additional context (user_id, service_name, action, etc.)
 */
function log(level, message, context = {}) {
    const sanitizedContext = sanitizeContext(context);
    const logEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...sanitizedContext
    };
    console.log(JSON.stringify(logEntry));
}
/**
 * Logs an info-level message
 * @param message - Human-readable log message
 * @param context - Additional context
 */
function logInfo(message, context = {}) {
    log('INFO', message, context);
}
/**
 * Logs a warning-level message
 * @param message - Human-readable log message
 * @param context - Additional context
 */
function logWarn(message, context = {}) {
    log('WARN', message, context);
}
/**
 * Logs an error-level message
 * @param message - Human-readable log message
 * @param context - Additional context
 */
function logError(message, context = {}) {
    log('ERROR', message, context);
}
/**
 * Logs a debug-level message
 * @param message - Human-readable log message
 * @param context - Additional context
 */
function logDebug(message, context = {}) {
    log('DEBUG', message, context);
}
//# sourceMappingURL=logging.js.map