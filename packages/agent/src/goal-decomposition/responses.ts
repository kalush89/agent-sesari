/**
 * Response helper functions for the Goal Decomposition Engine
 * Handles error and success response formatting with environment-aware detail inclusion
 */

import { DecompositionResponse, ErrorResponse } from './types';

/**
 * Creates an error response with appropriate status code and message
 * Includes technical details only in development mode
 * 
 * @param statusCode - HTTP status code (400 for client errors, 500 for server errors)
 * @param message - User-friendly error message
 * @param details - Technical error details (only included in development mode)
 * @returns Response object with JSON body and appropriate headers
 */
export function createErrorResponse(
  statusCode: number,
  message: string,
  details?: string
): Response {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  const errorBody: ErrorResponse = {
    error: message,
    ...(isDevelopment && details ? { details } : {})
  };

  return new Response(JSON.stringify(errorBody), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

/**
 * Creates a success response with the decomposition result
 * 
 * @param statusCode - HTTP status code (typically 200 for success)
 * @param data - Validated decomposition response containing SMART objectives
 * @returns Response object with JSON body and appropriate headers
 */
export function createSuccessResponse(
  statusCode: number,
  data: DecompositionResponse
): Response {
  return new Response(JSON.stringify(data), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}
