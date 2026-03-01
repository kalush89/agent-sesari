/**
 * AWS SDK client configuration for ICP Refinement Engine
 */

import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { BedrockAgentRuntimeClient } from '@aws-sdk/client-bedrock-agent-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';

/**
 * Gets AWS region from environment or defaults to us-east-1
 */
function getAwsRegion(): string {
  return process.env.AWS_REGION || 'us-east-1';
}

/**
 * Creates configured Bedrock Runtime client for Nova Lite invocation
 */
export function createBedrockRuntimeClient(): BedrockRuntimeClient {
  return new BedrockRuntimeClient({
    region: getAwsRegion(),
  });
}

/**
 * Creates configured Bedrock Agent Runtime client for Knowledge Base operations
 */
export function createBedrockAgentRuntimeClient(): BedrockAgentRuntimeClient {
  return new BedrockAgentRuntimeClient({
    region: getAwsRegion(),
  });
}

/**
 * Creates configured DynamoDB client for analysis history storage
 */
export function createDynamoDBClient(): DynamoDBClient {
  return new DynamoDBClient({
    region: getAwsRegion(),
  });
}

/**
 * Creates configured EventBridge client for scheduling
 */
export function createEventBridgeClient(): EventBridgeClient {
  return new EventBridgeClient({
    region: getAwsRegion(),
  });
}
