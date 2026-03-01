/**
 * Configuration and defaults for the ICP Refinement Engine
 */

import { EngineConfig, ScoringWeights } from './types.js';

/**
 * Default scoring weights (must sum to 1.0)
 */
export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  ltv: 0.4,
  engagement: 0.3,
  retention: 0.3,
};

/**
 * Default engine configuration
 */
export const DEFAULT_ENGINE_CONFIG: Omit<EngineConfig, 'knowledgeBaseId' | 'analysisTableName'> = {
  topPercentile: 10,
  minSampleSize: 20,
  scoringWeights: DEFAULT_SCORING_WEIGHTS,
};

/**
 * Creates engine configuration from environment variables
 */
export function createEngineConfig(): EngineConfig {
  const knowledgeBaseId = process.env.KNOWLEDGE_BASE_ID;
  const analysisTableName = process.env.ANALYSIS_TABLE_NAME;

  if (!knowledgeBaseId) {
    throw new Error('KNOWLEDGE_BASE_ID environment variable is required');
  }

  if (!analysisTableName) {
    throw new Error('ANALYSIS_TABLE_NAME environment variable is required');
  }

  return {
    ...DEFAULT_ENGINE_CONFIG,
    knowledgeBaseId,
    analysisTableName,
  };
}

/**
 * Validates environment variables at startup
 */
export function validateEnvironment(): void {
  const required = [
    'AWS_REGION',
    'KNOWLEDGE_BASE_ID',
    'NOVA_MODEL_ID',
    'HUBSPOT_API_KEY',
    'MIXPANEL_API_KEY',
    'STRIPE_API_KEY',
    'ANALYSIS_TABLE_NAME',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
