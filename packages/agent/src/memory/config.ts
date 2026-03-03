/**
 * Configuration for the Recursive Memory (Agentic RAG) system
 */

/**
 * Bedrock Knowledge Base configuration
 */
export interface BedrockKBConfig {
  knowledgeBaseId: string;
  dataSourceId: string;
  s3BucketName: string;
  embeddingModel: 'amazon.nova-lite-v1:0';
  vectorDimensions: 1024;
  chunkingStrategy: {
    type: 'FIXED_SIZE';
    maxTokens: 512;
    overlapPercentage: 20;
  };
}

/**
 * Memory system configuration loaded from environment variables
 */
export interface MemoryConfig {
  s3BucketName: string;
  bedrockKnowledgeBaseId: string;
  bedrockDataSourceId: string;
  awsRegion: string;
  embeddingModel: string;
}

/**
 * Load and validate memory configuration from environment variables
 * @returns Validated memory configuration
 * @throws Error if required environment variables are missing
 */
export function loadMemoryConfig(): MemoryConfig {
  const s3BucketName = process.env.MEMORY_S3_BUCKET_NAME;
  const bedrockKnowledgeBaseId = process.env.MEMORY_BEDROCK_KB_ID;
  const bedrockDataSourceId = process.env.MEMORY_BEDROCK_DATA_SOURCE_ID;
  const awsRegion = process.env.AWS_REGION || 'us-east-1';
  const embeddingModel = process.env.MEMORY_EMBEDDING_MODEL || 'amazon.nova-lite-v1:0';

  if (!s3BucketName) {
    throw new Error('MEMORY_S3_BUCKET_NAME environment variable is required');
  }

  if (!bedrockKnowledgeBaseId) {
    throw new Error('MEMORY_BEDROCK_KB_ID environment variable is required');
  }

  if (!bedrockDataSourceId) {
    throw new Error('MEMORY_BEDROCK_DATA_SOURCE_ID environment variable is required');
  }

  return {
    s3BucketName,
    bedrockKnowledgeBaseId,
    bedrockDataSourceId,
    awsRegion,
    embeddingModel,
  };
}
