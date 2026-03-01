/**
 * Structured logging utilities for the Goal Decomposition Engine
 * Provides consistent logging format for observability and debugging
 */

const MAX_GOAL_LOG_LENGTH = 200;

/**
 * Logs incoming goal request with truncation for long inputs
 * @param goal - The user's goal string
 */
export function logRequest(goal: string): void {
  const truncated = goal.length > MAX_GOAL_LOG_LENGTH 
    ? `${goal.substring(0, MAX_GOAL_LOG_LENGTH)}...` 
    : goal;
  
  console.log('[Goal Decomposition] Request received:', {
    goal: truncated,
    originalLength: goal.length,
    truncated: goal.length > MAX_GOAL_LOG_LENGTH
  });
}

/**
 * Logs context retrieval results from Bedrock Knowledge Base
 * @param success - Whether the retrieval operation succeeded
 * @param docCount - Number of documents retrieved
 */
export function logContextRetrieval(success: boolean, docCount: number): void {
  console.log('[Goal Decomposition] Context retrieval:', {
    success,
    documentsRetrieved: docCount,
    status: success ? 'completed' : 'failed'
  });
}

/**
 * Logs Nova model invocation details
 * @param modelId - The Nova model identifier used
 * @param tokenCount - Approximate token count for the request
 */
export function logNovaInvocation(modelId: string, tokenCount: number): void {
  console.log('[Goal Decomposition] Nova invocation:', {
    modelId,
    approximateTokens: tokenCount,
    timestamp: new Date().toISOString()
  });
}

/**
 * Logs validation results for Nova response
 * @param isValidJson - Whether the response was valid JSON
 * @param passedSchema - Whether the response passed schema validation
 */
export function logValidation(isValidJson: boolean, passedSchema: boolean): void {
  console.log('[Goal Decomposition] Response validation:', {
    validJson: isValidJson,
    passedSchema,
    status: isValidJson && passedSchema ? 'valid' : 'invalid'
  });
}

/**
 * Logs total execution time for the request
 * @param startTime - Request start timestamp in milliseconds
 */
export function logExecutionTime(startTime: number): void {
  const executionTime = Date.now() - startTime;
  console.log('[Goal Decomposition] Request completed:', {
    executionTimeMs: executionTime,
    executionTimeSec: (executionTime / 1000).toFixed(2)
  });
}
