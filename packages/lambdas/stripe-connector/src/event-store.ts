/**
 * DynamoDB Event Store access layer for Revenue Signal Events
 * Handles persistence, retrieval, and idempotency checks
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  PutCommandInput,
  GetCommandInput,
  QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { RevenueSignalEvent } from './types.js';

/**
 * Validates required environment variables
 */
function validateEnvironment(): void {
  if (!process.env.AWS_REGION) {
    throw new Error('AWS_REGION environment variable is required');
  }
  if (!process.env.DYNAMODB_TABLE_NAME) {
    throw new Error('DYNAMODB_TABLE_NAME environment variable is required');
  }
}

/**
 * Lazy initialization of DynamoDB client
 */
let client: DynamoDBClient | null = null;
let docClient: DynamoDBDocumentClient | null = null;

function getDocClient(): DynamoDBDocumentClient {
  if (!docClient) {
    validateEnvironment();
    client = new DynamoDBClient({
      region: process.env.AWS_REGION,
    });
    docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    });
  }
  return docClient;
}

/**
 * Get table name from environment
 */
function getTableName(): string {
  if (!process.env.DYNAMODB_TABLE_NAME) {
    throw new Error('DYNAMODB_TABLE_NAME environment variable is required');
  }
  return process.env.DYNAMODB_TABLE_NAME;
}

/**
 * Retry configuration for exponential backoff
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 100,
};

/**
 * Delays execution for exponential backoff
 */
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Stores a revenue signal event in DynamoDB with retry logic
 * Implements exponential backoff for write failures
 * 
 * @param event - The revenue signal event to store
 * @throws Error if all retry attempts fail
 */
export async function putEvent(event: RevenueSignalEvent): Promise<void> {
  const params: PutCommandInput = {
    TableName: getTableName(),
    Item: event,
    ConditionExpression: 'attribute_not_exists(eventId)',
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      await getDocClient().send(new PutCommand(params));
      console.log(`Event stored successfully: ${event.eventId}`);
      return;
    } catch (error: any) {
      lastError = error;

      // Don't retry on conditional check failures (duplicate event)
      if (error.name === 'ConditionalCheckFailedException') {
        console.log(`Event already exists: ${event.eventId}`);
        return;
      }

      // Log throttling and retry
      if (error.name === 'ProvisionedThroughputExceededException' || error.name === 'ThrottlingException') {
        const delayMs = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
        console.warn(`DynamoDB throttled, retrying in ${delayMs}ms (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1})`);
        
        if (attempt < RETRY_CONFIG.maxRetries) {
          await delay(delayMs);
          continue;
        }
      }

      // Log other errors and retry
      console.error(`DynamoDB putEvent failed (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}):`, error);
      
      if (attempt < RETRY_CONFIG.maxRetries) {
        const delayMs = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
        await delay(delayMs);
      }
    }
  }

  throw new Error(`Failed to store event after ${RETRY_CONFIG.maxRetries + 1} attempts: ${lastError?.message}`);
}

/**
 * Checks if an event ID already exists in DynamoDB
 * Uses GetItem for fast primary key lookup
 * 
 * @param eventId - The Stripe event ID to check
 * @returns True if event exists, false otherwise
 */
export async function eventExists(eventId: string): Promise<boolean> {
  const params: GetCommandInput = {
    TableName: getTableName(),
    Key: {
      eventId,
    },
    ProjectionExpression: 'eventId',
  };

  try {
    const result = await getDocClient().send(new GetCommand(params));
    return !!result.Item;
  } catch (error: any) {
    console.error(`Failed to check event existence for ${eventId}:`, error);
    throw new Error(`Event existence check failed: ${error.message}`);
  }
}

/**
 * Queries events for a specific customer within a date range
 * Uses GSI (customerId-timestamp-index) for efficient queries
 * 
 * @param customerId - The Stripe customer ID
 * @param startDate - Start of date range
 * @param endDate - End of date range
 * @returns Array of revenue signal events ordered by timestamp
 */
export async function queryEventsByCustomer(
  customerId: string,
  startDate: Date,
  endDate: Date
): Promise<RevenueSignalEvent[]> {
  const params: QueryCommandInput = {
    TableName: getTableName(),
    IndexName: 'customerId-timestamp-index',
    KeyConditionExpression: 'customerId = :customerId AND #ts BETWEEN :startDate AND :endDate',
    ExpressionAttributeNames: {
      '#ts': 'timestamp',
    },
    ExpressionAttributeValues: {
      ':customerId': customerId,
      ':startDate': Math.floor(startDate.getTime() / 1000),
      ':endDate': Math.floor(endDate.getTime() / 1000),
    },
    ScanIndexForward: true,
  };

  try {
    const result = await getDocClient().send(new QueryCommand(params));
    return (result.Items || []) as RevenueSignalEvent[];
  } catch (error: any) {
    console.error(`Failed to query events for customer ${customerId}:`, error);
    throw new Error(`Customer event query failed: ${error.message}`);
  }
}

/**
 * Queries events by type within a date range
 * Filters results by eventType field
 * 
 * @param eventType - The type of revenue signal event
 * @param startDate - Start of date range
 * @param endDate - End of date range
 * @returns Array of revenue signal events of the specified type
 */
export async function queryEventsByType(
  eventType: 'expansion' | 'churn' | 'failed_payment',
  startDate: Date,
  endDate: Date
): Promise<RevenueSignalEvent[]> {
  const params: QueryCommandInput = {
    TableName: getTableName(),
    FilterExpression: 'eventType = :eventType AND #ts BETWEEN :startDate AND :endDate',
    ExpressionAttributeNames: {
      '#ts': 'timestamp',
    },
    ExpressionAttributeValues: {
      ':eventType': eventType,
      ':startDate': Math.floor(startDate.getTime() / 1000),
      ':endDate': Math.floor(endDate.getTime() / 1000),
    },
  };

  try {
    const result = await getDocClient().send(new QueryCommand(params));
    return (result.Items || []) as RevenueSignalEvent[];
  } catch (error: any) {
    console.error(`Failed to query events by type ${eventType}:`, error);
    throw new Error(`Event type query failed: ${error.message}`);
  }
}
