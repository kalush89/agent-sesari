/**
 * Core type definitions for the Goal Decomposition Engine
 */

/**
 * A single SMART objective derived from a high-level goal
 */
export interface Objective {
  /** Short objective name */
  title: string;
  /** Detailed description of what needs to be accomplished */
  description: string;
  /** Measurable success criteria */
  successThreshold: string;
  /** Stripe/HubSpot/Mixpanel signals needed to track progress */
  requiredSignals: string[];
  /** Justification for why this objective matters */
  strategicWhy: string;
}

/**
 * The structured response containing exactly 3 SMART objectives
 */
export interface DecompositionResponse {
  objectives: Objective[];
}

/**
 * Historical company data retrieved from Bedrock Knowledge Bases
 */
export interface CompanyContext {
  /** Recent Stripe/HubSpot/Mixpanel metrics */
  recentMetrics: string[];
  /** Past goals and outcomes */
  historicalGoals: string[];
  /** Company size, industry, stage */
  companyProfile: string;
}

/**
 * Error response format for API responses
 */
export interface ErrorResponse {
  /** User-friendly error message */
  error: string;
  /** Technical details (only in dev mode) */
  details?: string;
}

/**
 * Custom error types for the Goal Decomposition Engine
 */
export class GoalDecompositionError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details?: string
  ) {
    super(message);
    this.name = 'GoalDecompositionError';
  }
}

export class ValidationError extends GoalDecompositionError {
  constructor(message: string, details?: string) {
    super(message, 400, details);
    this.name = 'ValidationError';
  }
}

export class NovaAPIError extends GoalDecompositionError {
  constructor(message: string, details?: string) {
    super(message, 500, details);
    this.name = 'NovaAPIError';
  }
}

export class SchemaValidationError extends GoalDecompositionError {
  constructor(message: string, details?: string) {
    super(message, 500, details);
    this.name = 'SchemaValidationError';
  }
}
