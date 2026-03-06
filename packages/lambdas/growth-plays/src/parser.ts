/**
 * Growth Play parser with comprehensive schema validation
 * 
 * Provides functions to parse, validate, and serialize Growth Play objects
 * with descriptive error messages for invalid data.
 */

import type {
  GrowthPlay,
  ParseError,
  Result,
  CommunicationType,
  GrowthPlayStatus,
  RiskFactorType,
  AuditAction
} from './types.js';
import {
  validateNonEmptyString,
  validateNumberInRange,
  validateEnum,
  validateISOTimestamp,
  validateArray,
  validateObject
} from './utils/validation.js';

/**
 * Valid communication types
 */
const COMMUNICATION_TYPES: readonly CommunicationType[] = ['email', 'slack'];

/**
 * Valid Growth Play statuses
 */
const GROWTH_PLAY_STATUSES: readonly GrowthPlayStatus[] = [
  'pending',
  'approved',
  'dismissed',
  'executed',
  'failed',
  'resolved'
];

/**
 * Valid risk factor types
 */
const RISK_FACTOR_TYPES: readonly RiskFactorType[] = [
  'usage_decline',
  'renewal_approaching',
  'support_tickets',
  'payment_issues'
];

/**
 * Valid audit actions
 */
const AUDIT_ACTIONS: readonly AuditAction[] = [
  'created',
  'approved',
  'dismissed',
  'edited',
  'executed',
  'failed',
  'resolved'
];

/**
 * Validates a Risk Factor object
 * 
 * @param value - Value to validate
 * @param fieldName - Field name for error messages
 * @returns Parse error if invalid, null if valid
 */
function validateRiskFactor(value: any, fieldName: string): ParseError | null {
  const objError = validateObject(value, fieldName);
  if (objError) return objError;

  const typeError = validateEnum(value.type, `${fieldName}.type`, RISK_FACTOR_TYPES);
  if (typeError) return typeError;

  const severityError = validateNumberInRange(value.severity, `${fieldName}.severity`, 0, 100);
  if (severityError) return severityError;

  const weightError = validateNumberInRange(value.weight, `${fieldName}.weight`, 0, 1);
  if (weightError) return weightError;

  const signalValuesError = validateObject(value.signalValues, `${fieldName}.signalValues`);
  if (signalValuesError) return signalValuesError;

  return null;
}

/**
 * Validates a Thought Trace object
 * 
 * @param value - Value to validate
 * @param fieldName - Field name for error messages
 * @returns Parse error if invalid, null if valid
 */
function validateThoughtTrace(value: any, fieldName: string): ParseError | null {
  const objError = validateObject(value, fieldName);
  if (objError) return objError;

  const riskFactorsError = validateArray(value.riskFactors, `${fieldName}.riskFactors`);
  if (riskFactorsError) return riskFactorsError;

  // Validate each risk factor
  for (let i = 0; i < value.riskFactors.length; i++) {
    const factorError = validateRiskFactor(
      value.riskFactors[i],
      `${fieldName}.riskFactors[${i}]`
    );
    if (factorError) return factorError;
  }

  const reasoningError = validateNonEmptyString(value.reasoning, `${fieldName}.reasoning`);
  if (reasoningError) return reasoningError;

  const signalSourcesError = validateArray(value.signalSources, `${fieldName}.signalSources`);
  if (signalSourcesError) return signalSourcesError;

  // Validate each signal source is a string
  for (let i = 0; i < value.signalSources.length; i++) {
    if (typeof value.signalSources[i] !== 'string') {
      return {
        field: `${fieldName}.signalSources[${i}]`,
        message: 'Must be a string',
        receivedValue: value.signalSources[i]
      };
    }
  }

  return null;
}

/**
 * Validates an Audit Entry object
 * 
 * @param value - Value to validate
 * @param fieldName - Field name for error messages
 * @returns Parse error if invalid, null if valid
 */
function validateAuditEntry(value: any, fieldName: string): ParseError | null {
  const objError = validateObject(value, fieldName);
  if (objError) return objError;

  const actionError = validateEnum(value.action, `${fieldName}.action`, AUDIT_ACTIONS);
  if (actionError) return actionError;

  const timestampError = validateISOTimestamp(value.timestamp, `${fieldName}.timestamp`);
  if (timestampError) return timestampError;

  // userId and metadata are optional, but if present must be valid
  if (value.userId !== undefined) {
    const userIdError = validateNonEmptyString(value.userId, `${fieldName}.userId`);
    if (userIdError) return userIdError;
  }

  if (value.metadata !== undefined) {
    const metadataError = validateObject(value.metadata, `${fieldName}.metadata`);
    if (metadataError) return metadataError;
  }

  return null;
}

/**
 * Parses and validates a Growth Play from JSON string or object
 * 
 * @param input - JSON string or object to parse
 * @returns Result with parsed Growth Play or parse error
 */
export function parseGrowthPlay(input: string | any): Result<GrowthPlay, ParseError> {
  let data: any;

  // Parse JSON if string input
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch (error) {
      return {
        success: false,
        error: {
          field: 'root',
          message: 'Invalid JSON format',
          receivedValue: input
        }
      };
    }
  } else {
    data = input;
  }

  // Validate root is an object
  const rootError = validateObject(data, 'root');
  if (rootError) {
    return { success: false, error: rootError };
  }

  // Validate required fields
  const validations: Array<ParseError | null> = [
    validateNonEmptyString(data.id, 'id'),
    validateNonEmptyString(data.customerId, 'customerId'),
    validateNonEmptyString(data.customerName, 'customerName'),
    validateNonEmptyString(data.companyName, 'companyName'),
    validateNumberInRange(data.riskScore, 'riskScore', 0, 100),
    validateEnum(data.communicationType, 'communicationType', COMMUNICATION_TYPES),
    validateNonEmptyString(data.draftContent, 'draftContent'),
    validateThoughtTrace(data.thoughtTrace, 'thoughtTrace'),
    validateEnum(data.status, 'status', GROWTH_PLAY_STATUSES),
    validateISOTimestamp(data.createdAt, 'createdAt'),
    validateISOTimestamp(data.updatedAt, 'updatedAt'),
    validateArray(data.auditTrail, 'auditTrail')
  ];

  // Check for first validation error
  for (const error of validations) {
    if (error) {
      return { success: false, error };
    }
  }

  // Validate email-specific field
  if (data.communicationType === 'email') {
    const subjectError = validateNonEmptyString(data.subject, 'subject');
    if (subjectError) {
      return { success: false, error: subjectError };
    }
  }

  // Validate optional editedContent if present
  if (data.editedContent !== undefined) {
    const editedContentError = validateNonEmptyString(data.editedContent, 'editedContent');
    if (editedContentError) {
      return { success: false, error: editedContentError };
    }
  }

  // Validate optional executionMetadata if present
  if (data.executionMetadata !== undefined) {
    const metadataError = validateObject(data.executionMetadata, 'executionMetadata');
    if (metadataError) {
      return { success: false, error: metadataError };
    }
  }

  // Validate each audit entry
  for (let i = 0; i < data.auditTrail.length; i++) {
    const entryError = validateAuditEntry(data.auditTrail[i], `auditTrail[${i}]`);
    if (entryError) {
      return { success: false, error: entryError };
    }
  }

  // All validations passed, return typed object
  return {
    success: true,
    value: data as GrowthPlay
  };
}

/**
 * Serializes a Growth Play object to JSON string
 * 
 * @param growthPlay - Growth Play object to serialize
 * @returns JSON string representation
 */
export function serializeGrowthPlay(growthPlay: GrowthPlay): string {
  return JSON.stringify(growthPlay);
}

/**
 * Pretty-prints a Growth Play object to human-readable JSON
 * 
 * @param growthPlay - Growth Play object to format
 * @returns Formatted JSON string with 2-space indentation
 */
export function prettyPrintGrowthPlay(growthPlay: GrowthPlay): string {
  return JSON.stringify(growthPlay, null, 2);
}
