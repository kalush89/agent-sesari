/**
 * Structured logging utility for Mixpanel webhook processing
 * Provides JSON-formatted logs with consistent event ID tracking
 */

/**
 * Log levels supported by the logger
 */
export type LogLevel = 'info' | 'warn' | 'error';

/**
 * Base log entry structure
 */
interface BaseLogEntry {
  timestamp: string;
  level: LogLevel;
  eventId?: string;
  message: string;
  [key: string]: any;
}

/**
 * Gets the configured log level from environment
 * Defaults to 'info' if not set
 */
function getLogLevel(): LogLevel {
  const level = process.env.LOG_LEVEL?.toLowerCase();
  if (level === 'warn' || level === 'error' || level === 'info') {
    return level;
  }
  return 'info';
}

/**
 * Log level priority for filtering
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  info: 0,
  warn: 1,
  error: 2,
};

/**
 * Checks if a log should be emitted based on configured level
 */
function shouldLog(level: LogLevel): boolean {
  const configuredLevel = getLogLevel();
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[configuredLevel];
}

/**
 * Creates a structured log entry
 */
function createLogEntry(
  level: LogLevel,
  message: string,
  eventId?: string,
  context?: Record<string, any>
): BaseLogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    eventId,
    message,
    ...context,
  };
}

/**
 * Logs an info-level message with optional context
 */
export function logInfo(message: string, eventId?: string, context?: Record<string, any>): void {
  if (!shouldLog('info')) return;
  
  const entry = createLogEntry('info', message, eventId, context);
  console.log(JSON.stringify(entry));
}

/**
 * Logs a warning-level message with optional context
 */
export function logWarn(message: string, eventId?: string, context?: Record<string, any>): void {
  if (!shouldLog('warn')) return;
  
  const entry = createLogEntry('warn', message, eventId, context);
  console.warn(JSON.stringify(entry));
}

/**
 * Logs an error-level message with optional context
 */
export function logError(message: string, eventId?: string, context?: Record<string, any>): void {
  if (!shouldLog('error')) return;
  
  const entry = createLogEntry('error', message, eventId, context);
  console.error(JSON.stringify(entry));
}
