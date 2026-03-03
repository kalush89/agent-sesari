/**
 * Document serialization module for Recursive Memory (Agentic RAG)
 * Handles JSON serialization, parsing, and validation of memory documents
 */

import type { MemoryDocument } from './types';

/**
 * Validation error with field-specific details
 */
export class DocumentValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string
  ) {
    super(message);
    this.name = 'DocumentValidationError';
  }
}

/**
 * Serialization error with context
 */
export class DocumentSerializationError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'DocumentSerializationError';
  }
}

/**
 * Validates that a document has all required fields
 * @param document - Document to validate
 * @throws DocumentValidationError if validation fails
 */
export function validateDocument(document: unknown): asserts document is MemoryDocument {
  if (!document || typeof document !== 'object') {
    throw new DocumentValidationError('Document must be an object');
  }

  const doc = document as Record<string, unknown>;

  // Check required fields
  if (!doc.id || typeof doc.id !== 'string') {
    throw new DocumentValidationError('Missing or invalid required field: id', 'id');
  }

  if (!doc.type || typeof doc.type !== 'string') {
    throw new DocumentValidationError('Missing or invalid required field: type', 'type');
  }

  if (!['strategy', 'performance', 'action', 'technical'].includes(doc.type)) {
    throw new DocumentValidationError(
      `Invalid document type: ${doc.type}. Must be one of: strategy, performance, action, technical`,
      'type'
    );
  }

  if (!doc.timestamp || typeof doc.timestamp !== 'string') {
    throw new DocumentValidationError('Missing or invalid required field: timestamp', 'timestamp');
  }

  if (doc.version === undefined || typeof doc.version !== 'number') {
    throw new DocumentValidationError('Missing or invalid required field: version', 'version');
  }
}

/**
 * Serializes a memory document to JSON string
 * @param document - Memory document to serialize
 * @returns JSON string representation
 * @throws DocumentSerializationError if serialization fails
 */
export function serializeDocument(document: MemoryDocument): string {
  try {
    validateDocument(document);
    return JSON.stringify(document);
  } catch (error) {
    if (error instanceof DocumentValidationError) {
      throw error;
    }
    throw new DocumentSerializationError(
      `Failed to serialize document: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error
    );
  }
}

/**
 * Parses a JSON string to a typed memory document
 * @param json - JSON string to parse
 * @returns Typed memory document
 * @throws DocumentSerializationError if parsing fails
 */
export function parseDocument(json: string): MemoryDocument {
  try {
    const parsed = JSON.parse(json);
    validateDocument(parsed);
    return parsed;
  } catch (error) {
    if (error instanceof DocumentValidationError) {
      throw error;
    }
    if (error instanceof SyntaxError) {
      throw new DocumentSerializationError('Invalid JSON string', error);
    }
    throw new DocumentSerializationError(
      `Failed to parse document: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error
    );
  }
}
