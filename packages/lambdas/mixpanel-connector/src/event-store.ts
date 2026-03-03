/**
 * DynamoDB Event Store access layer for Behavioral Signal Events
 * Handles persistence, retrieval, and idempotency checks for Mixpanel behavioral signals
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
import {
  BehavioralSignalEvent,
  UsageBaseline,
  UsageEvent,
} from './types.js';

/**
 * Validates required environment variables
 */
function validateEnvironment(): void {
  if (!process.env.AWS_REGION) {
    throw new Error('AWS_REGION environment variable is required');
  }
  if (!process.env.DYNAMODB_SIGNALS_TABLE) {
    throw new Error('DYNAMODB_SIGNALS_TABLE environment variable is required');
  }
  if (!process.env.DYNAMODB_BASELINES_TABLE) {
    throw new Error('DYNAMODB_BASELINES_TABLE environment variable is required');
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
 * Get signals table name from environment
 */
function getSignalsTableName(): string {
  if (!process.env.DYNAMODB_SIGNALS_TABLE) {
    throw new Error('DYNAMODB_SIGNALS_TABLE environment variable is required');
  }
  return process.env.DYNAMODB_SIGNALS_TABLE;
}

/**
 * Get baselines table name from environment
 */
function getBaselinesTableName(): string {
  if (!process.env.DYNAMODB_BASELINES_TABLE) {
    throw new Error('DYNAMODB_BASELINES_TABLE environment variable is required');
  }
  return process.env.DYNAMODB_BASELINES_TABLE;
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
 * Stores a behavioral signal event in DynamoDB with retry logic
 * Implements exponential backoff for write failures
 * 
 * @param event - The behavioral signal event to store
 * @throws Error if all retry attempts fail
 */
export async function putEvent(event: BehavioralSignalEvent): Promise<void> {
  const params: PutCommandInput = {
    TableName: getSignalsTableName(),
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
 * @param eventId - The Mixpanel event ID to check
 * @returns True if event exists, false otherwise
 */
export async function eventExists(eventId: string): Promise<boolean> {
  const params: GetCommandInput = {
    TableName: getSignalsTableName(),
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
 * Queries events for a specific user within a date range
 * Uses GSI (userId-timestamp-index) for efficient queries
 * 
 * @param userId - The Mixpanel user ID (distinct_id)
 * @param startDate - Start of date range
 * @param endDate - End of date range
 * @returns Array of behavioral signal events ordered by timestamp
 */
export async function queryEventsByUser(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<BehavioralSignalEvent[]> {
  const params: QueryCommandInput = {
    TableName: getSignalsTableName(),
    IndexName: 'userId-timestamp-index',
    KeyConditionExpression: 'userId = :userId AND #ts BETWEEN :startDate AND :endDate',
    ExpressionAttributeNames: {
      '#ts': 'timestamp',
    },
    ExpressionAttributeValues: {
      ':userId': userId,
      ':startDate': Math.floor(startDate.getTime() / 1000),
      ':endDate': Math.floor(endDate.getTime() / 1000),
    },
    ScanIndexForward: true,
  };

  try {
    const result = await getDocClient().send(new QueryCommand(params));
    return (result.Items || []) as BehavioralSignalEvent[];
  } catch (error: any) {
    console.error(`Failed to query events for user ${userId}:`, error);
    throw new Error(`User event query failed: ${error.message}`);
  }
}

/**
 * Queries events by type within a date range
 * Scans table with filter expression (less efficient than GSI query)
 * 
 * @param eventType - The type of behavioral signal event
 * @param startDate - Start of date range
 * @param endDate - End of date range
 * @returns Array of behavioral signal events of the specified type
 */
export async function queryEventsByType(
  eventType: 'feature_adoption_drop' | 'power_user',
  startDate: Date,
  endDate: Date
): Promise<BehavioralSignalEvent[]> {
  const params: QueryCommandInput = {
    TableName: getSignalsTableName(),
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
    return (result.Items || []) as BehavioralSignalEvent[];
  } catch (error: any) {
    console.error(`Failed to query events by type ${eventType}:`, error);
    throw new Error(`Event type query failed: ${error.message}`);
  }
}

/**
 * Queries events by feature within a date range
 * Scans table with filter expression to match feature in details
 * 
 * @param feature - The feature name to filter by
 * @param startDate - Start of date range
 * @param endDate - End of date range
 * @returns Array of behavioral signal events for the specified feature
 */
export async function queryEventsByFeature(
  feature: string,
  startDate: Date,
  endDate: Date
): Promise<BehavioralSignalEvent[]> {
  const params: QueryCommandInput = {
    TableName: getSignalsTableName(),
    FilterExpression: 'details.feature = :feature AND #ts BETWEEN :startDate AND :endDate',
    ExpressionAttributeNames: {
      '#ts': 'timestamp',
    },
    ExpressionAttributeValues: {
      ':feature': feature,
      ':startDate': Math.floor(startDate.getTime() / 1000),
      ':endDate': Math.floor(endDate.getTime() / 1000),
    },
  };

  try {
    const result = await getDocClient().send(new QueryCommand(params));
    return (result.Items || []) as BehavioralSignalEvent[];
  } catch (error: any) {
    console.error(`Failed to query events by feature ${feature}:`, error);
    throw new Error(`Feature event query failed: ${error.message}`);
  }
}

/**
 * Stores a usage event in DynamoDB for baseline calculation
 * Sets TTL to 90 days from event timestamp
 * 
 * @param event - The usage event to store
 * @throws Error if write fails after retries
 */
export async function storeUsageEvent(event: UsageEvent): Promise<void> {
  const params: PutCommandInput = {
    TableName: getSignalsTableName(),
    Item: event,
    ConditionExpression: 'attribute_not_exists(eventId)',
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      await getDocClient().send(new PutCommand(params));
      console.log(`Usage event stored successfully: ${event.eventId}`);
      return;
    } catch (error: any) {
      lastError = error;

      // Don't retry on conditional check failures (duplicate event)
      if (error.name === 'ConditionalCheckFailedException') {
        console.log(`Usage event already exists: ${event.eventId}`);
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
      console.error(`DynamoDB storeUsageEvent failed (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}):`, error);
      
      if (attempt < RETRY_CONFIG.maxRetries) {
        const delayMs = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
        await delay(delayMs);
      }
    }
  }

  throw new Error(`Failed to store usage event after ${RETRY_CONFIG.maxRetries + 1} attempts: ${lastError?.message}`);
}

/**
 * Retrieves usage baseline for a user-feature combination
 * 
 * @param userId - The Mixpanel user ID
 * @param feature - The feature name
 * @returns Usage baseline or null if not found
 */
export async function getUsageBaseline(
  userId: string,
  feature: string
): Promise<UsageBaseline | null> {
  const userFeatureKey = `${userId}#${feature}`;
  
  const params: GetCommandInput = {
    TableName: getBaselinesTableName(),
    Key: {
      userFeatureKey,
    },
  };

  try {
    const result = await getDocClient().send(new GetCommand(params));
    return result.Item ? (result.Item as UsageBaseline) : null;
  } catch (error: any) {
    console.error(`Failed to get usage baseline for ${userFeatureKey}:`, error);
    throw new Error(`Usage baseline retrieval failed: ${error.message}`);
  }
}

/**
 * Stores usage baseline in DynamoDB with 90-day TTL
 * 
 * @param baseline - The usage baseline to store
 * @throws Error if write fails after retries
 */
export async function storeUsageBaseline(baseline: UsageBaseline): Promise<void> {
  const params: PutCommandInput = {
    TableName: getBaselinesTableName(),
    Item: baseline,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      await getDocClient().send(new PutCommand(params));
      console.log(`Usage baseline stored successfully: ${baseline.userFeatureKey}`);
      return;
    } catch (error: any) {
      lastError = error;

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
      console.error(`DynamoDB storeUsageBaseline failed (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}):`, error);
      
      if (attempt < RETRY_CONFIG.maxRetries) {
        const delayMs = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
        await delay(delayMs);
      }
    }
  }

  throw new Error(`Failed to store usage baseline after ${RETRY_CONFIG.maxRetries + 1} attempts: ${lastError?.message}`);
}

/**
 * Retrieves usage history for a user-feature combination
 * Queries usage events within the specified time window
 * 
 * @param userId - The Mixpanel user ID
 * @param feature - The feature name
 * @param days - Number of days to look back (7-30)
 * @returns Array of usage events ordered by timestamp
 */
export async function getUsageHistory(
  userId: string,
  feature: string,
  days: number
): Promise<UsageEvent[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const params: QueryCommandInput = {
    TableName: getSignalsTableName(),
    IndexName: 'userId-timestamp-index',
    KeyConditionExpression: 'userId = :userId AND #ts BETWEEN :startDate AND :endDate',
    FilterExpression: 'feature = :feature',
    ExpressionAttributeNames: {
      '#ts': 'timestamp',
    },
    ExpressionAttributeValues: {
      ':userId': userId,
      ':feature': feature,
      ':startDate': Math.floor(startDate.getTime() / 1000),
      ':endDate': Math.floor(endDate.getTime() / 1000),
    },
    ScanIndexForward: true,
  };

  try {
    const result = await getDocClient().send(new QueryCommand(params));
    return (result.Items || []) as UsageEvent[];
  } catch (error: any) {
    console.error(`Failed to get usage history for ${userId}#${feature}:`, error);
    throw new Error(`Usage history query failed: ${error.message}`);
  }
}
