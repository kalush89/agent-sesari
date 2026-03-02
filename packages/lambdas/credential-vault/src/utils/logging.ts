/**
 * Structured logging utility for Lambda functions
 * Outputs JSON-formatted logs for CloudWatch with context
 */

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export interface LogContext {
  user_id?: string;
  service_name?: string;
  action?: string;
  [key: string]: any;
}

/**
 * Sanitizes context to remove sensitive data before logging
 * @param context - Log context that may contain sensitive data
 * @returns Sanitized context safe for logging
 */
function sanitizeContext(context: LogContext): LogContext {
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
export function log(level: LogLevel, message: string, context: LogContext = {}): void {
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
export function logInfo(message: string, context: LogContext = {}): void {
  log('INFO', message, context);
}

/**
 * Logs a warning-level message
 * @param message - Human-readable log message
 * @param context - Additional context
 */
export function logWarn(message: string, context: LogContext = {}): void {
  log('WARN', message, context);
}

/**
 * Logs an error-level message
 * @param message - Human-readable log message
 * @param context - Additional context
 */
export function logError(message: string, context: LogContext = {}): void {
  log('ERROR', message, context);
}

/**
 * Logs a debug-level message
 * @param message - Human-readable log message
 * @param context - Additional context
 */
export function logDebug(message: string, context: LogContext = {}): void {
  log('DEBUG', message, context);
}
