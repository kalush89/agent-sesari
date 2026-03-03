/**
 * Structured logging utility for ICP Refinement Engine
 * Provides correlation ID tracking and PII-safe logging
 */

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface LogContext {
  correlation_id: string;
  phase?: string;
  user_id?: string;
  [key: string]: any;
}

/**
 * Sanitizes context to remove PII before logging
 * @param context - Log context that may contain PII
 * @returns Sanitized context safe for logging
 */
function sanitizeContext(context: LogContext): LogContext {
  const sanitized = { ...context };
  
  // Remove PII fields
  const piiFields = [
    'email',
    'name',
    'company_name',
    'phone',
    'address',
    'api_key',
    'secret',
    'token',
    'access_token',
    'refresh_token',
    'password',
    'credential',
  ];
  
  for (const field of piiFields) {
    if (field in sanitized) {
      delete sanitized[field];
    }
  }
  
  return sanitized;
}

/**
 * Logs a structured message to CloudWatch
 * @param level - Log level (INFO, WARN, ERROR)
 * @param message - Human-readable log message
 * @param context - Additional context (correlation_id, phase, etc.)
 */
export function log(level: LogLevel, message: string, context: LogContext): void {
  const sanitizedContext = sanitizeContext(context);
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...sanitizedContext,
  };
  
  console.log(JSON.stringify(logEntry));
}

/**
 * Logs an info-level message
 * @param message - Human-readable log message
 * @param context - Additional context (must include correlation_id)
 */
export function logInfo(message: string, context: LogContext): void {
  log('INFO', message, context);
}

/**
 * Logs a warning-level message
 * @param message - Human-readable log message
 * @param context - Additional context (must include correlation_id)
 */
export function logWarn(message: string, context: LogContext): void {
  log('WARN', message, context);
}

/**
 * Logs an error-level message
 * @param message - Human-readable log message
 * @param context - Additional context (must include correlation_id)
 */
export function logError(message: string, context: LogContext): void {
  log('ERROR', message, context);
}

/**
 * Generates a unique correlation ID for tracing
 * @returns Correlation ID in format: icp-{timestamp}-{random}
 */
export function generateCorrelationId(): string {
  return `icp-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}
