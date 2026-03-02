/**
 * Analysis history storage for DynamoDB
 * Tracks ICP evolution over time with complete analysis records
 */

import { PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { createDynamoDBClient } from './clients.js';
import {
  ICPAnalysisRecord,
  ICPProfile,
  ScoreDistribution,
  ExecutionMetrics,
  ScoredCustomer,
} from './types.js';

/**
 * Stores analysis record in DynamoDB with retry logic
 */
export async function storeAnalysisRecord(
  record: ICPAnalysisRecord,
  tableName: string
): Promise<void> {
  const client = createDynamoDBClient();

  try {
    await putItemWithRetry(client, tableName, record);
    console.log(`Analysis record stored: ${record.analysisId}`);
  } catch (error) {
    console.error('Failed to store analysis record after retry:', error);
    // Non-critical: log error but continue execution
  }
}

/**
 * Attempts DynamoDB write with single retry on failure
 */
async function putItemWithRetry(
  client: ReturnType<typeof createDynamoDBClient>,
  tableName: string,
  record: ICPAnalysisRecord
): Promise<void> {
  try {
    await client.send(
      new PutItemCommand({
        TableName: tableName,
        Item: marshall(record, { removeUndefinedValues: true }),
      })
    );
  } catch (error) {
    console.warn('DynamoDB write failed, retrying once:', error);
    await client.send(
      new PutItemCommand({
        TableName: tableName,
        Item: marshall(record, { removeUndefinedValues: true }),
      })
    );
  }
}

/**
 * Builds complete analysis record from profile and metrics
 */
export function buildAnalysisRecord(
  profile: ICPProfile,
  topCustomerIds: string[],
  scoreDistribution: ScoreDistribution,
  executionMetrics: ExecutionMetrics
): ICPAnalysisRecord {
  return {
    analysisId: new Date().toISOString(),
    version: profile.version,
    profile,
    topCustomerIds,
    scoreDistribution,
    executionMetrics,
  };
}

/**
 * Calculates score distribution statistics from scored customers
 */
export function calculateScoreDistribution(
  customers: ScoredCustomer[]
): ScoreDistribution {
  if (customers.length === 0) {
    return { min: 0, max: 0, mean: 0, p90: 0 };
  }

  const scores = customers.map((c) => c.idealCustomerScore).sort((a, b) => a - b);

  const min = scores[0];
  const max = scores[scores.length - 1];
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const p90Index = Math.floor(scores.length * 0.9);
  const p90 = scores[p90Index];

  return { min, max, mean, p90 };
}
