/**
 * Input validation utilities for the Goal Decomposition Engine
 */

import { z } from 'zod';
import { ValidationError, SchemaValidationError, DecompositionResponse } from './types';

/**
 * Validates the goal input string
 * Throws ValidationError if the goal is missing, empty, or contains only whitespace
 * 
 * @param goal - The goal string to validate
 * @throws {ValidationError} If the goal is invalid
 * 
 * Requirements: 1.2, 1.3, 8.2
 */
export function validateGoalInput(goal: string): void {
  // Check for missing goal (undefined or null)
  if (goal === undefined || goal === null) {
    throw new ValidationError(
      'Goal is required',
      'Goal parameter is missing or null'
    );
  }

  // Check for empty string
  if (goal.length === 0) {
    throw new ValidationError(
      'Goal is required',
      'Goal string is empty'
    );
  }

  // Check for whitespace-only string
  if (goal.trim().length === 0) {
    throw new ValidationError(
      'Goal is required',
      'Goal contains only whitespace characters'
    );
  }
}

/**
 * Zod schema for validating DecompositionResponse
 * Enforces exactly 3 objectives with all required fields
 * 
 * Requirements: 4.1, 4.3, 4.4, 4.5, 4.6
 */
const ObjectiveSchema = z.object({
  title: z.string().min(1, 'Objective title cannot be empty'),
  description: z.string().min(1, 'Objective description cannot be empty'),
  successThreshold: z.string().min(1, 'Success threshold cannot be empty'),
  requiredSignals: z.array(z.string()).min(1, 'At least one required signal must be specified'),
  strategicWhy: z.string().min(1, 'Strategic justification cannot be empty'),
});

const DecompositionResponseSchema = z.object({
  objectives: z.array(ObjectiveSchema)
    .length(3, 'Response must contain exactly 3 objectives'),
});

/**
 * Validates Nova response against strict JSON schema
 * Parses JSON string and validates structure matches DecompositionResponse
 * 
 * @param response - Raw JSON string from Nova
 * @returns Validated DecompositionResponse object
 * @throws {SchemaValidationError} If response is invalid JSON or fails schema validation
 * 
 * Requirements: 4.1, 4.2, 4.5, 4.6, 4.7
 */
export function validateDecompositionResponse(response: string): DecompositionResponse {
  // Parse JSON (throws if invalid)
  let parsed: unknown;
  try {
    parsed = JSON.parse(response);
  } catch (error) {
    throw new SchemaValidationError(
      'Invalid JSON response from Nova',
      `Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  // Validate against schema
  const result = DecompositionResponseSchema.safeParse(parsed);
  
  if (!result.success) {
    const errorDetails = result.error.errors
      .map(err => `${err.path.join('.')}: ${err.message}`)
      .join('; ');
    
    throw new SchemaValidationError(
      'Response validation failed',
      errorDetails
    );
  }

  return result.data;
}
