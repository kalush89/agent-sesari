/**
 * Next.js API Route: Goal Decomposition
 * POST /api/decompose-goal
 * 
 * Transforms high-level growth goals into actionable SMART objectives
 * using Amazon Nova and Bedrock Knowledge Bases
 */

import {
  validateGoalInput,
  validateDecompositionResponse,
  retrieveCompanyContext,
  decomposeGoal,
  createErrorResponse,
  createSuccessResponse,
  logRequest,
  logContextRetrieval,
  logNovaInvocation,
  logValidation,
  logExecutionTime,
  ValidationError,
  NovaAPIError,
  SchemaValidationError,
  GoalDecompositionError,
} from '@/../../packages/agent/src/goal-decomposition';

/**
 * POST handler for goal decomposition
 * Orchestrates context retrieval, decomposition, and validation
 * 
 * Requirements: 8.1, 8.2, 1.2, 1.3, 2.1, 2.3, 3.1, 3.2, 4.1, 4.7, 7.3, 7.4, 7.5, 8.4, 8.5, 8.6, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */
export async function POST(request: Request): Promise<Response> {
  const startTime = Date.now();

  try {
    // Parse request body and extract goal field
    let body: any;
    try {
      body = await request.json();
    } catch (error) {
      return createErrorResponse(
        400,
        'Invalid request body',
        'Failed to parse JSON body'
      );
    }

    const goal = body?.goal;

    // Validate goal input
    try {
      validateGoalInput(goal);
      logRequest(goal);
    } catch (error) {
      if (error instanceof ValidationError) {
        return createErrorResponse(
          error.statusCode,
          error.message,
          error.details
        );
      }
      throw error;
    }

    // Retrieve company context (graceful degradation on failure)
    const context = await retrieveCompanyContext(goal);
    const contextSuccess = context.recentMetrics.length > 0 || 
                          context.historicalGoals.length > 0 || 
                          context.companyProfile.length > 0;
    const docCount = context.recentMetrics.length + 
                    context.historicalGoals.length + 
                    (context.companyProfile ? 1 : 0);
    logContextRetrieval(contextSuccess, docCount);

    // Decompose goal via Nova
    let rawResponse: string;
    try {
      rawResponse = await decomposeGoal(goal, context);
      
      // Estimate token count (rough approximation: 1 token ≈ 4 characters)
      const estimatedTokens = Math.ceil((goal.length + rawResponse.length) / 4);
      logNovaInvocation(process.env.NOVA_MODEL_ID || 'amazon.nova-lite-v1:0', estimatedTokens);
    } catch (error) {
      if (error instanceof NovaAPIError) {
        console.error('Nova API error:', error);
        return createErrorResponse(
          error.statusCode,
          error.message,
          error.details
        );
      }
      throw error;
    }

    // Validate response
    let validated;
    let isValidJson = false;
    let passedSchema = false;
    
    try {
      validated = validateDecompositionResponse(rawResponse);
      isValidJson = true;
      passedSchema = true;
      logValidation(isValidJson, passedSchema);
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        // Determine if it's a JSON parsing error or schema validation error
        try {
          JSON.parse(rawResponse);
          isValidJson = true;
          passedSchema = false;
        } catch {
          isValidJson = false;
          passedSchema = false;
        }
        
        logValidation(isValidJson, passedSchema);
        console.error('Response validation error:', error);
        return createErrorResponse(
          error.statusCode,
          error.message,
          error.details
        );
      }
      throw error;
    }

    // Log execution time and return success response
    logExecutionTime(startTime);
    return createSuccessResponse(200, validated);

  } catch (error) {
    // Top-level error handling for unexpected errors
    console.error('Unexpected error in goal decomposition:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      type: error instanceof Error ? error.constructor.name : typeof error,
    });

    logExecutionTime(startTime);

    // Return generic error response
    if (error instanceof GoalDecompositionError) {
      return createErrorResponse(
        error.statusCode,
        error.message,
        error.details
      );
    }

    return createErrorResponse(
      500,
      'An unexpected error occurred',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}
