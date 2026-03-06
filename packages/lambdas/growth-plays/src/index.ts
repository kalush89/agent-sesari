/**
 * Growth Plays Lambda Package
 * 
 * Main entry point exporting all types, utilities, and functions
 * for the Automated Growth Plays system.
 */

// Export all types
export type {
  CommunicationType,
  GrowthPlayStatus,
  RiskFactorType,
  AuditAction,
  SubscriptionStatus,
  RiskFactor,
  ThoughtTrace,
  AuditEntry,
  GrowthPlay,
  RiskProfile,
  MixpanelSignals,
  HubSpotSignals,
  StripeSignals,
  UnifiedCustomerProfile,
  SignalOrchestratorInput,
  SignalOrchestratorOutput,
  SignalCorrelatorInput,
  SignalCorrelatorOutput,
  DraftGeneratorInput,
  DraftGeneratorOutput,
  ExecutionEngineInput,
  ExecutionEngineOutput,
  ParseError,
  Result
} from './types.js';

// Export validation utilities
export {
  validateEnvironment,
  validateNonEmptyString,
  validateNumberInRange,
  validateEnum,
  validateISOTimestamp,
  validateArray,
  validateObject
} from './utils/validation.js';

// Export error handling utilities
export {
  logStructured,
  withErrorHandling,
  sleep,
  retryWithBackoff,
  formatErrorResponse
} from './utils/error-handling.js';

// Export parser functions
export {
  parseGrowthPlay,
  serializeGrowthPlay,
  prettyPrintGrowthPlay
} from './parser.js';
