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
 * Logs a structured message to CloudWatch
 * @param level - Log level (INFO, WARN, ERROR, DEBUG)
 * @param message - Human-readable log message
 * @param context - Additional context (user_id, service_name, action, etc.)
 */
export declare function log(level: LogLevel, message: string, context?: LogContext): void;
/**
 * Logs an info-level message
 * @param message - Human-readable log message
 * @param context - Additional context
 */
export declare function logInfo(message: string, context?: LogContext): void;
/**
 * Logs a warning-level message
 * @param message - Human-readable log message
 * @param context - Additional context
 */
export declare function logWarn(message: string, context?: LogContext): void;
/**
 * Logs an error-level message
 * @param message - Human-readable log message
 * @param context - Additional context
 */
export declare function logError(message: string, context?: LogContext): void;
/**
 * Logs a debug-level message
 * @param message - Human-readable log message
 * @param context - Additional context
 */
export declare function logDebug(message: string, context?: LogContext): void;
//# sourceMappingURL=logging.d.ts.map