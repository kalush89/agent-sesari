/**
 * AWS SDK client configuration for Bedrock services
 */

import { BedrockAgentRuntimeClient } from '@aws-sdk/client-bedrock-agent-runtime';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

/**
 * Validates required environment variables at startup
 * @throws Error if required environment variables are missing
 */
function validateEnvironment(): void {
  const required = ['AWS_REGION', 'KNOWLEDGE_BASE_ID', 'NOVA_MODEL_ID'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

// Validate environment on module load
validateEnvironment();

/**
 * Bedrock Agent Runtime client for Knowledge Base retrieval
 */
export const bedrockKBClient = new BedrockAgentRuntimeClient({
  region: process.env.AWS_REGION,
});

/**
 * Bedrock Runtime client for Nova model invocation
 */
export const bedrockRuntimeClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION,
});

/**
 * Environment configuration
 */
export const config = {
  awsRegion: process.env.AWS_REGION!,
  knowledgeBaseId: process.env.KNOWLEDGE_BASE_ID!,
  novaModelId: process.env.NOVA_MODEL_ID!,
  nodeEnv: process.env.NODE_ENV || 'development',
} as const;
