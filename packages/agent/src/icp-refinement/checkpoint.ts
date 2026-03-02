/**
 * Checkpoint management for resumable batch processing
 * Enables Lambda to resume from last checkpoint if processing > 500 companies
 */

import { DynamoDBClient, PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { createDynamoDBClient } from './clients.js';

/**
 * Checkpoint data structure
 */
export interface Checkpoint {
  userId: string;
  timestamp: string;
  lastProcessedIndex: number;
  totalCompanies: number;
  status: 'in_progress' | 'completed';
}

/**
 * Stores checkpoint in DynamoDB
 */
export async function saveCheckpoint(
  checkpoint: Checkpoint,
  tableName: string
): Promise<void> {
  const client = createDynamoDBClient();

  try {
    await client.send(
      new PutItemCommand({
        TableName: tableName,
        Item: marshall({
          checkpointId: `checkpoint-${checkpoint.userId}`,
          ...checkpoint,
        }),
      })
    );
    console.log(`[Checkpoint] Saved: ${checkpoint.lastProcessedIndex}/${checkpoint.totalCompanies}`);
  } catch (error) {
    console.error('[Checkpoint] Failed to save:', error);
    throw new Error(`Failed to save checkpoint: ${(error as Error).message}`);
  }
}

/**
 * Retrieves checkpoint from DynamoDB
 */
export async function loadCheckpoint(
  userId: string,
  tableName: string
): Promise<Checkpoint | null> {
  const client = createDynamoDBClient();

  try {
    const response = await client.send(
      new GetItemCommand({
        TableName: tableName,
        Key: marshall({ checkpointId: `checkpoint-${userId}` }),
      })
    );

    if (!response.Item) {
      return null;
    }

    const checkpoint = unmarshall(response.Item) as Checkpoint;
    console.log(`[Checkpoint] Loaded: ${checkpoint.lastProcessedIndex}/${checkpoint.totalCompanies}`);
    return checkpoint;
  } catch (error) {
    console.error('[Checkpoint] Failed to load:', error);
    return null;
  }
}

/**
 * Clears checkpoint after successful completion
 */
export async function clearCheckpoint(
  userId: string,
  tableName: string
): Promise<void> {
  const client = createDynamoDBClient();

  try {
    await client.send(
      new PutItemCommand({
        TableName: tableName,
        Item: marshall({
          checkpointId: `checkpoint-${userId}`,
          userId,
          timestamp: new Date().toISOString(),
          lastProcessedIndex: 0,
          totalCompanies: 0,
          status: 'completed',
        }),
      })
    );
    console.log('[Checkpoint] Cleared');
  } catch (error) {
    console.error('[Checkpoint] Failed to clear:', error);
  }
}
