/**
 * Error handling utilities for Growth Plays system
 * 
 * Provides standardized error handling patterns for AWS SDK calls,
 * Lambda handlers, and business logic operations.
 */

/**
 * Structured log entry for CloudWatch Insights
 */
interface LogEntry {
  level: 'info' | 'warn' | 'error';
  component: string;
  action: string;
  message: string;
  timestamp: string;
  [key: string]: any;
}

/**
 * Logs a structured message to CloudWatch
 * 
 * @param entry - Log entry with level, component, action, and additional fields
 */
export function logStructured(entry: Omit<LogEntry, 'timestamp'>): void {
  const logEntry = {
    ...entry,
    timestamp: new Date().toISOString()
  };
  
  console.log(JSON.stringify(logEntry));
}

/**
 * Wraps an async operation with error handling and logging
 * 
 * @param operation - Async function to execute
 * @param component - Component name for logging
 * @param action - Action name for logging
 * @returns Result of the operation
 * @throws Error with descriptive message if operation fails
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  component: string,
  action: string
): Promise<T> {
  try {
    logStructured({
      level: 'info',
      component,
      action,
      message: `Starting ${action}`
    });
    
    const result = await operation();
    
    logStructured({
      level: 'info',
      component,
      action,
      message: `Completed ${action}`
    });
    
    return result;
  } catch (error) {
    logStructured({
      level: 'error',
      component,
      action,
      message: `Failed ${action}`,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    throw error;
  }
}

/**
 * Sleeps for the specified duration
 * 
 * @param ms - Duration in milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retries an operation with exponential backoff
 * 
 * @param operation - Async function to retry
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param delays - Array of delay durations in ms (default: [1000, 2000, 4000])
 * @returns Result of the operation
 * @throws Error if all retries are exhausted
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delays: number[] = [1000, 2000, 4000]
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries - 1) {
        const delay = delays[attempt] || delays[delays.length - 1];
        logStructured({
          level: 'warn',
          component: 'ErrorHandling',
          action: 'retryWithBackoff',
          message: `Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`,
          error: lastError.message
        });
        await sleep(delay);
      }
    }
  }
  
  throw new Error(`Operation failed after ${maxRetries} retries: ${lastError?.message}`);
}

/**
 * Formats an error for API responses
 * 
 * @param error - Error to format
 * @param requestId - Optional request ID for tracking
 * @returns Formatted error object
 */
export function formatErrorResponse(error: unknown, requestId?: string): {
  error: string;
  requestId?: string;
} {
  const message = error instanceof Error ? error.message : 'Internal server error';
  
  return {
    error: message,
    ...(requestId && { requestId })
  };
}
