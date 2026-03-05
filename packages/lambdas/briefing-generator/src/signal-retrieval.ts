/**
 * Signal Retrieval Module
 * 
 * Retrieves Universal_Signals from DynamoDB for the past 24 hours
 * across all three categories (revenue, relationship, behavioral).
 */

import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { Universal_Signal, SignalCategory } from './types.js';

/**
 * Retrieve all signals from the past 24 hours
 * Queries UniversalSignals table by category and time range
 * 
 * @param startTime - Unix timestamp for start of range (default: 24 hours ago)
 * @param endTime - Unix timestamp for end of range (default: now)
 * @returns Array of Universal_Signals
 */
export async function retrieveSignals(
  startTime?: number,
  endTime?: number
): Promise<Universal_Signal[]> {
  const now = Date.now();
  const yesterday = now - (24 * 60 * 60 * 1000);
  
  const start = startTime ?? yesterday;
  const end = endTime ?? now;
  
  const tableName = process.env.UNIVERSAL_SIGNALS_TABLE;
  if (!tableName) {
    throw new Error('UNIVERSAL_SIGNALS_TABLE environment variable is not set');
  }
  
  const region = process.env.AWS_REGION || 'us-east-1';
  const client = new DynamoDBClient({ region });
  
  // Query all three categories
  const categories: SignalCategory[] = ['revenue', 'relationship', 'behavioral'];
  const allSignals: Universal_Signal[] = [];
  
  for (const category of categories) {
    try {
      const signals = await querySignalsByCategory(client, tableName, category, start, end);
      allSignals.push(...signals);
    } catch (error) {
      console.error(`Failed to query ${category} signals:`, error);
      // Continue with other categories even if one fails
    }
  }
  
  return allSignals;
}

/**
 * Query signals for a specific category and time range
 * Uses CategoryIndex (GSI2) for efficient querying
 * 
 * @param client - DynamoDB client
 * @param tableName - Table name
 * @param category - Signal category
 * @param startTime - Start of time range
 * @param endTime - End of time range
 * @returns Array of Universal_Signals
 */
async function querySignalsByCategory(
  client: DynamoDBClient,
  tableName: string,
  category: SignalCategory,
  startTime: number,
  endTime: number
): Promise<Universal_Signal[]> {
  const command = new QueryCommand({
    TableName: tableName,
    IndexName: 'CategoryIndex',
    KeyConditionExpression: 'GSI2PK = :category AND GSI2SK BETWEEN :start AND :end',
    ExpressionAttributeValues: {
      ':category': { S: `category#${category}` },
      ':start': { S: `${startTime}#` },
      ':end': { S: `${endTime}#zzz` }
    }
  });
  
  const response = await client.send(command);
  
  if (!response.Items || response.Items.length === 0) {
    return [];
  }
  
  return response.Items.map(unmarshallSignal);
}

/**
 * Unmarshall DynamoDB item to Universal_Signal
 * 
 * @param item - DynamoDB item
 * @returns Universal_Signal
 */
function unmarshallSignal(item: Record<string, any>): Universal_Signal {
  const unmarshalled = unmarshall(item);
  
  return {
    signalId: unmarshalled.signalId,
    category: unmarshalled.category,
    eventType: unmarshalled.eventType,
    entity: unmarshalled.entity,
    occurredAt: unmarshalled.occurredAt,
    processedAt: unmarshalled.processedAt,
    source: unmarshalled.source,
    impact: unmarshalled.impact,
    platformDetails: unmarshalled.platformDetails,
    ttl: unmarshalled.ttl
  };
}
