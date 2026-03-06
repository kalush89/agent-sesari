/**
 * Data access layer for DynamoDB operations
 * 
 * This module provides functions for storing and retrieving Growth Plays,
 * Risk Profiles, and cached customer profiles from DynamoDB.
 */

import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  QueryCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { GrowthPlay, RiskProfile, UnifiedCustomerProfile, AuditEntry, EntitySignalProfile } from './types';

/**
 * Validates required environment variables at startup
 */
function validateEnvironment(): void {
  const required = ['AWS_REGION', 'GROWTH_PLAYS_TABLE', 'RISK_PROFILES_TABLE', 'SIGNAL_CACHE_TABLE'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Creates a DynamoDB client with proper configuration
 */
function createClient(): DynamoDBClient {
  validateEnvironment();
  
  return new DynamoDBClient({
    region: process.env.AWS_REGION,
    maxAttempts: 3,
  });
}

/**
 * Stores a Growth Play in DynamoDB
 */
export async function storeGrowthPlay(growthPlay: GrowthPlay): Promise<void> {
  const client = createClient();
  
  try {
    await client.send(new PutItemCommand({
      TableName: process.env.GROWTH_PLAYS_TABLE,
      Item: marshall(growthPlay, { removeUndefinedValues: true }),
    }));
  } catch (error: any) {
    console.error('Failed to store Growth Play:', {
      growthPlayId: growthPlay.id,
      error: error.message,
    });
    throw new Error(`Failed to store Growth Play: ${error.message}`);
  }
}

/**
 * Retrieves a Growth Play by ID
 */
export async function getGrowthPlayById(id: string): Promise<GrowthPlay | null> {
  const client = createClient();
  
  try {
    const response = await client.send(new GetItemCommand({
      TableName: process.env.GROWTH_PLAYS_TABLE,
      Key: marshall({ id }),
    }));
    
    return response.Item ? unmarshall(response.Item) as GrowthPlay : null;
  } catch (error: any) {
    console.error('Failed to get Growth Play:', {
      id,
      error: error.message,
    });
    throw new Error(`Failed to get Growth Play: ${error.message}`);
  }
}

/**
 * Queries Growth Plays by status using GSI
 */
export async function queryGrowthPlaysByStatus(status: string): Promise<GrowthPlay[]> {
  const client = createClient();
  
  try {
    const response = await client.send(new QueryCommand({
      TableName: process.env.GROWTH_PLAYS_TABLE,
      IndexName: 'status-createdAt-index',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: marshall({
        ':status': status,
      }),
      ScanIndexForward: false, // Sort by createdAt descending
    }));
    
    return response.Items?.map(item => unmarshall(item) as GrowthPlay) || [];
  } catch (error: any) {
    console.error('Failed to query Growth Plays by status:', {
      status,
      error: error.message,
    });
    throw new Error(`Failed to query Growth Plays: ${error.message}`);
  }
}
/**
 * Queries pending Growth Plays for a specific customer
 *
 * @param customerId - Customer identifier
 * @returns Array of pending Growth Plays for the customer
 */
export async function queryPendingGrowthPlaysByCustomer(customerId: string): Promise<GrowthPlay[]> {
  const client = createClient();

  try {
    const response = await client.send(new QueryCommand({
      TableName: process.env.GROWTH_PLAYS_TABLE,
      IndexName: 'customerId-createdAt-index',
      KeyConditionExpression: 'customerId = :customerId',
      FilterExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: marshall({
        ':customerId': customerId,
        ':status': 'pending',
      }),
      ScanIndexForward: false,
    }));

    return response.Items?.map(item => unmarshall(item) as GrowthPlay) || [];
  } catch (error: any) {
    console.error('Failed to query pending Growth Plays by customer:', {
      customerId,
      error: error.message,
    });
    throw new Error(`Failed to query pending Growth Plays: ${error.message}`);
  }
}


/**
 * Queries pending Growth Plays for a specific customer
 * 
 * @param customerId - Customer identifier
 * @returns Array of pending Growth Plays for the customer
 */
export async function queryPendingGrowthPlaysByCustomer(customerId: string): Promise<GrowthPlay[]> {
  const client = createClient();
  
  try {
    const response = await client.send(new QueryCommand({
      TableName: process.env.GROWTH_PLAYS_TABLE,
      IndexName: 'customerId-createdAt-index',
      KeyConditionExpression: 'customerId = :customerId',
      FilterExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: marshall({
        ':customerId': customerId,
        ':status': 'pending',
      }),
      ScanIndexForward: false,
    }));
    
    return response.Items?.map(item => unmarshall(item) as GrowthPlay) || [];
  } catch (error: any) {
    console.error('Failed to query pending Growth Plays by customer:', {
      customerId,
      error: error.message,
    });
    throw new Error(`Failed to query pending Growth Plays: ${error.message}`);
  }
}

/**
 * Updates Growth Play status and appends audit trail entry
 */
export async function updateGrowthPlayStatus(
  id: string,
  newStatus: string,
  auditEntry: AuditEntry
): Promise<void> {
  const client = createClient();
  
  try {
    await client.send(new UpdateItemCommand({
      TableName: process.env.GROWTH_PLAYS_TABLE,
      Key: marshall({ id }),
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt, auditTrail = list_append(auditTrail, :auditEntry)',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: marshall({
        ':status': newStatus,
        ':updatedAt': new Date().toISOString(),
        ':auditEntry': [auditEntry],
      }),
    }));
  } catch (error: any) {
    console.error('Failed to update Growth Play status:', {
      id,
      newStatus,
      error: error.message,
    });
    throw new Error(`Failed to update Growth Play status: ${error.message}`);
  }
}

/**
 * Stores a customer risk profile in DynamoDB
 */
export async function storeRiskProfile(riskProfile: RiskProfile): Promise<void> {
  const client = createClient();
  
  // Calculate TTL: 90 days from now
  const expiresAt = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);
  
  const item = {
    ...riskProfile,
    expiresAt,
  };
  
  try {
    await client.send(new PutItemCommand({
      TableName: process.env.RISK_PROFILES_TABLE,
      Item: marshall(item, { removeUndefinedValues: true }),
    }));
  } catch (error: any) {
    console.error('Failed to store risk profile:', {
      customerId: riskProfile.customerId,
      error: error.message,
    });
    throw new Error(`Failed to store risk profile: ${error.message}`);
  }
}

/**
 * Retrieves the most recent risk profile for a customer
 */
export async function getRiskProfile(customerId: string): Promise<RiskProfile | null> {
  const client = createClient();
  
  try {
    const response = await client.send(new QueryCommand({
      TableName: process.env.RISK_PROFILES_TABLE,
      KeyConditionExpression: 'customerId = :customerId',
      ExpressionAttributeValues: marshall({
        ':customerId': customerId,
      }),
      ScanIndexForward: false, // Sort by detectedAt descending
      Limit: 1,
    }));
    
    return response.Items?.[0] ? unmarshall(response.Items[0]) as RiskProfile : null;
  } catch (error: any) {
    console.error('Failed to get risk profile:', {
      customerId,
      error: error.message,
    });
    throw new Error(`Failed to get risk profile: ${error.message}`);
  }
}

/**
 * Caches entity signal profiles with 1-hour TTL
 */
export async function cacheEntityProfiles(profiles: EntitySignalProfile[]): Promise<void> {
  const client = createClient();
  
  // Calculate TTL: 1 hour from now
  const expiresAt = Math.floor(Date.now() / 1000) + (60 * 60);
  
  const item = {
    cacheKey: 'entity-profiles',
    profiles,
    cachedAt: new Date().toISOString(),
    expiresAt,
  };
  
  try {
    await client.send(new PutItemCommand({
      TableName: process.env.SIGNAL_CACHE_TABLE,
      Item: marshall(item, { removeUndefinedValues: true }),
    }));
  } catch (error: any) {
    console.error('Failed to cache entity profiles:', {
      profileCount: profiles.length,
      error: error.message,
    });
    throw new Error(`Failed to cache profiles: ${error.message}`);
  }
}

/**
 * Retrieves cached entity signal profiles if available
 */
export async function getCachedEntityProfiles(): Promise<EntitySignalProfile[] | null> {
  const client = createClient();
  
  try {
    const response = await client.send(new GetItemCommand({
      TableName: process.env.SIGNAL_CACHE_TABLE,
      Key: marshall({ cacheKey: 'entity-profiles' }),
    }));
    
    if (!response.Item) {
      return null;
    }
    
    const item = unmarshall(response.Item);
    return item.profiles as EntitySignalProfile[];
  } catch (error: any) {
    console.error('Failed to get cached entity profiles:', {
      error: error.message,
    });
    throw new Error(`Failed to get cached profiles: ${error.message}`);
  }
}
