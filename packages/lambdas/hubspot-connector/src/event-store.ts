/**
 * DynamoDB Event Store access layer for Relationship Signal Events
 */

import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  QueryCommand,
  DynamoDBServiceException,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { RelationshipSignalEvent } from './types';

// Initialize DynamoDB client with region from environment
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'relationship-signals';

/**
 * Exponential backoff configuration
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 100,
};

/**
 * Sleep utility for retry delays
 */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Stores a RelationshipSignalEvent in DynamoDB with exponential backoff retry logic
 */
export async function putEvent(event: RelationshipSignalEvent): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const command = new PutItemCommand({
        TableName: TABLE_NAME,
        Item: marshall(event, { removeUndefinedValues: true }),
      });

      await client.send(command);
      
      console.log(JSON.stringify({
        level: 'info',
        message: 'Event stored successfully',
        eventId: event.eventId,
        eventType: event.eventType,
        attempt: attempt + 1,
      }));
      
      return;
    } catch (error) {
      lastError = error as Error;

      // Check if error is retryable
      if (
        error instanceof DynamoDBServiceException &&
        (error.name === 'ProvisionedThroughputExceededException' ||
          error.name === 'ThrottlingException' ||
          error.name === 'ServiceUnavailable')
      ) {
        if (attempt < RETRY_CONFIG.maxRetries) {
          const delayMs = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
          
          console.log(JSON.stringify({
            level: 'warn',
            message: 'DynamoDB write failed, retrying with exponential backoff',
            eventId: event.eventId,
            attempt: attempt + 1,
            delayMs,
            errorName: error.name,
          }));
          
          await sleep(delayMs);
          continue;
        }
      }

      // Non-retryable error or max retries exceeded
      console.error(JSON.stringify({
        level: 'error',
        message: 'Failed to store event in DynamoDB',
        eventId: event.eventId,
        attempt: attempt + 1,
        error: error instanceof Error ? error.message : String(error),
        errorName: error instanceof DynamoDBServiceException ? error.name : 'Unknown',
      }));
      
      throw new Error(`Failed to store event after ${attempt + 1} attempts: ${lastError?.message}`);
    }
  }

  throw new Error(`Failed to store event after ${RETRY_CONFIG.maxRetries + 1} attempts: ${lastError?.message}`);
}

/**
 * Checks if an event ID already exists in DynamoDB
 */
export async function eventExists(eventId: string): Promise<boolean> {
  try {
    const command = new GetItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ eventId }),
      ProjectionExpression: 'eventId',
    });

    const response = await client.send(command);
    return !!response.Item;
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      message: 'Failed to check event existence',
      eventId,
      error: error instanceof Error ? error.message : String(error),
    }));
    
    throw new Error(`Failed to check event existence: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Queries events by company ID and date range using GSI
 */
export async function queryEventsByCompany(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<RelationshipSignalEvent[]> {
  try {
    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);

    const command = new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'companyId-timestamp-index',
      KeyConditionExpression: 'companyId = :companyId AND #ts BETWEEN :start AND :end',
      ExpressionAttributeNames: {
        '#ts': 'timestamp',
      },
      ExpressionAttributeValues: marshall({
        ':companyId': companyId,
        ':start': startTimestamp,
        ':end': endTimestamp,
      }),
    });

    const response = await client.send(command);
    
    if (!response.Items || response.Items.length === 0) {
      return [];
    }

    return response.Items.map((item) => unmarshall(item) as RelationshipSignalEvent);
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      message: 'Failed to query events by company',
      companyId,
      error: error instanceof Error ? error.message : String(error),
    }));
    
    throw new Error(`Failed to query events by company: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Queries events by type and date range
 */
export async function queryEventsByType(
  eventType: 'deal_progression' | 'communication_gap' | 'sentiment',
  startDate: Date,
  endDate: Date
): Promise<RelationshipSignalEvent[]> {
  try {
    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);

    const command = new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'companyId-timestamp-index',
      FilterExpression: 'eventType = :eventType AND #ts BETWEEN :start AND :end',
      ExpressionAttributeNames: {
        '#ts': 'timestamp',
      },
      ExpressionAttributeValues: marshall({
        ':eventType': eventType,
        ':start': startTimestamp,
        ':end': endTimestamp,
      }),
    });

    const response = await client.send(command);
    
    if (!response.Items || response.Items.length === 0) {
      return [];
    }

    return response.Items.map((item) => unmarshall(item) as RelationshipSignalEvent);
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      message: 'Failed to query events by type',
      eventType,
      error: error instanceof Error ? error.message : String(error),
    }));
    
    throw new Error(`Failed to query events by type: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Queries events by contact ID and date range with optional type filtering
 */
export async function queryEventsByContact(
  contactId: string,
  startDate: Date,
  endDate: Date,
  eventType?: 'deal_progression' | 'communication_gap' | 'sentiment'
): Promise<RelationshipSignalEvent[]> {
  try {
    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);

    const filterExpressions: string[] = [
      'contactId = :contactId',
      '#ts BETWEEN :start AND :end',
    ];
    
    const expressionAttributeValues: Record<string, any> = {
      ':contactId': contactId,
      ':start': startTimestamp,
      ':end': endTimestamp,
    };

    if (eventType) {
      filterExpressions.push('eventType = :eventType');
      expressionAttributeValues[':eventType'] = eventType;
    }

    const command = new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'companyId-timestamp-index',
      FilterExpression: filterExpressions.join(' AND '),
      ExpressionAttributeNames: {
        '#ts': 'timestamp',
      },
      ExpressionAttributeValues: marshall(expressionAttributeValues),
    });

    const response = await client.send(command);
    
    if (!response.Items || response.Items.length === 0) {
      return [];
    }

    return response.Items.map((item) => unmarshall(item) as RelationshipSignalEvent);
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      message: 'Failed to query events by contact',
      contactId,
      eventType,
      error: error instanceof Error ? error.message : String(error),
    }));
    
    throw new Error(`Failed to query events by contact: ${error instanceof Error ? error.message : String(error)}`);
  }
}
