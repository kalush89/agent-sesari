/**
 * Environment variable validation for Goal Decomposition Engine
 * Validates required environment variables at startup
 */

interface EnvironmentConfig {
  awsRegion: string;
  knowledgeBaseId: string;
  novaModelId: string;
  nodeEnv: string;
}

/**
 * Validates that all required environment variables are present
 * @throws Error if any required environment variable is missing or invalid
 */
export function validateEnvironment(): EnvironmentConfig {
  const required = {
    AWS_REGION: process.env.AWS_REGION,
    KNOWLEDGE_BASE_ID: process.env.KNOWLEDGE_BASE_ID,
    NOVA_MODEL_ID: process.env.NOVA_MODEL_ID,
    NODE_ENV: process.env.NODE_ENV,
  };

  const missing: string[] = [];

  for (const [key, value] of Object.entries(required)) {
    if (!value || value.trim().length === 0) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  return {
    awsRegion: required.AWS_REGION!,
    knowledgeBaseId: required.KNOWLEDGE_BASE_ID!,
    novaModelId: required.NOVA_MODEL_ID!,
    nodeEnv: required.NODE_ENV!,
  };
}

/**
 * Gets validated environment configuration
 * Caches the result after first validation
 */
let cachedConfig: EnvironmentConfig | null = null;

export function getEnvironmentConfig(): EnvironmentConfig {
  if (!cachedConfig) {
    cachedConfig = validateEnvironment();
  }
  return cachedConfig;
}
