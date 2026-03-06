/**
 * Validation utilities for Growth Plays system
 * 
 * Provides reusable validation functions for environment variables,
 * input data, and business logic constraints.
 */

import type { ParseError } from '../types.js';

/**
 * Validates required environment variables at Lambda startup
 * 
 * @throws Error if any required environment variable is missing
 */
export function validateEnvironment(requiredVars: string[]): void {
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Validates that a value is a non-empty string
 * 
 * @param value - Value to validate
 * @param fieldName - Field name for error messages
 * @returns Parse error if invalid, null if valid
 */
export function validateNonEmptyString(value: any, fieldName: string): ParseError | null {
  if (typeof value !== 'string') {
    return {
      field: fieldName,
      message: 'Must be a string',
      receivedValue: value
    };
  }
  
  if (value.trim().length === 0) {
    return {
      field: fieldName,
      message: 'Must not be empty',
      receivedValue: value
    };
  }
  
  return null;
}

/**
 * Validates that a value is a number within a specified range
 * 
 * @param value - Value to validate
 * @param fieldName - Field name for error messages
 * @param min - Minimum allowed value (inclusive)
 * @param max - Maximum allowed value (inclusive)
 * @returns Parse error if invalid, null if valid
 */
export function validateNumberInRange(
  value: any,
  fieldName: string,
  min: number,
  max: number
): ParseError | null {
  if (typeof value !== 'number') {
    return {
      field: fieldName,
      message: 'Must be a number',
      receivedValue: value
    };
  }
  
  if (isNaN(value)) {
    return {
      field: fieldName,
      message: 'Must not be NaN',
      receivedValue: value
    };
  }
  
  if (value < min || value > max) {
    return {
      field: fieldName,
      message: `Must be between ${min} and ${max}`,
      receivedValue: value
    };
  }
  
  return null;
}

/**
 * Validates that a value is one of the allowed enum values
 * 
 * @param value - Value to validate
 * @param fieldName - Field name for error messages
 * @param allowedValues - Array of allowed values
 * @returns Parse error if invalid, null if valid
 */
export function validateEnum<T>(
  value: any,
  fieldName: string,
  allowedValues: readonly T[]
): ParseError | null {
  if (!allowedValues.includes(value)) {
    return {
      field: fieldName,
      message: `Must be one of: ${allowedValues.join(', ')}`,
      receivedValue: value
    };
  }
  
  return null;
}

/**
 * Validates that a value is a valid ISO 8601 timestamp
 * 
 * @param value - Value to validate
 * @param fieldName - Field name for error messages
 * @returns Parse error if invalid, null if valid
 */
export function validateISOTimestamp(value: any, fieldName: string): ParseError | null {
  if (typeof value !== 'string') {
    return {
      field: fieldName,
      message: 'Must be a string',
      receivedValue: value
    };
  }
  
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return {
      field: fieldName,
      message: 'Must be a valid ISO 8601 timestamp',
      receivedValue: value
    };
  }
  
  return null;
}

/**
 * Validates that a value is an array
 * 
 * @param value - Value to validate
 * @param fieldName - Field name for error messages
 * @returns Parse error if invalid, null if valid
 */
export function validateArray(value: any, fieldName: string): ParseError | null {
  if (!Array.isArray(value)) {
    return {
      field: fieldName,
      message: 'Must be an array',
      receivedValue: value
    };
  }
  
  return null;
}

/**
 * Validates that a value is an object (not null or array)
 * 
 * @param value - Value to validate
 * @param fieldName - Field name for error messages
 * @returns Parse error if invalid, null if valid
 */
export function validateObject(value: any, fieldName: string): ParseError | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      field: fieldName,
      message: 'Must be an object',
      receivedValue: value
    };
  }
  
  return null;
}
