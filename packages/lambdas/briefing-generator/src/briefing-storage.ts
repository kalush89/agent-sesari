/**
 * Briefing Storage Module
 * 
 * Handles storage and retrieval of briefings in DynamoDB.
 * Implements compression, TTL management, and error handling.
 */

import { DynamoDBClient, PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { compressContent, decompressContent } from './compression.js';
import type { Briefing } from './types.js';

/**
 * TTL duration in days
 */
const TTL_DAYS = 90;

/**
 * Store briefing in DynamoDB
 * 
 * Stores a generated briefing with:
 * - Compressed content to minimize storage costs
 * - 90-day TTL for automatic cleanup
 * - Metadata for quick queries
 * 
 * Key format: PK=briefing#{userId}, SK=date#{YYYY-MM-DD}
 * 
 * @param userId - User identifier
 * @param briefing - Complete briefing document
 */
export async function storeBriefing(
  userId: string,
  briefing: Briefing
): Promise<void> {
  const tableName = process.env.BRIEFING_STORE_TABLE;
  if (!tableName) {
    throw new Error('BRIEFING_STORE_TABLE environment variable is not set');
  }
  
  const region = process.env.AWS_REGION || 'us-east-1';
  const client = new DynamoDBClient({ region });
  
  try {
    // Compress briefing content
    const content = JSON.stringify(briefing.insights);
    const compressed = compressContent(content);
    
    // Calculate TTL (90 days from now)
    const ttl = calculateTTL(briefing.generatedAt);
    
    const command = new PutItemCommand({
      TableName: tableName,
      Item: marshall({
        PK: `briefing#${userId}`,
        SK: `date#${briefing.date}`,
        generatedAt: briefing.generatedAt,
        signalCount: briefing.metadata.signalCount,
        insightCount: briefing.insights.length,
        priorityLevel: briefing.metadata.priorityLevel,
        content: compressed,
        ttl
      })
    });
    
    await client.send(command);
    
    console.log('Briefing stored successfully', {
      userId,
      date: briefing.date,
      insightCount: briefing.insights.length,
      signalCount: briefing.metadata.signalCount
    });
  } catch (error) {
    console.error('Failed to store briefing:', error);
    throw new Error(`Failed to store briefing: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Retrieve briefing from DynamoDB
 * 
 * Fetches and decompresses a briefing for a specific date.
 * 
 * @param userId - User identifier
 * @param date - Date in YYYY-MM-DD format
 * @returns Briefing document, or null if not found
 */
export async function retrieveBriefing(
  userId: string,
  date: string
): Promise<Briefing | null> {
  const tableName = process.env.BRIEFING_STORE_TABLE;
  if (!tableName) {
    throw new Error('BRIEFING_STORE_TABLE environment variable is not set');
  }
  
  const region = process.env.AWS_REGION || 'us-east-1';
  const client = new DynamoDBClient({ region });
  
  try {
    const command = new GetItemCommand({
      TableName: tableName,
      Key: marshall({
        PK: `briefing#${userId}`,
        SK: `date#${date}`
      })
    });
    
    const response = await client.send(command);
    
    if (!response.Item) {
      return null;
    }
    
    const item = unmarshall(response.Item);
    
    // Decompress content
    const content = decompressContent(item.content);
    const insights = JSON.parse(content);
    
    return {
      date: item.SK.replace('date#', ''),
      generatedAt: item.generatedAt,
      insights,
      metadata: {
        signalCount: item.signalCount,
        priorityLevel: item.priorityLevel,
        categories: {
          revenue: 0,
          relationship: 0,
          behavioral: 0
        }
      }
    };
  } catch (error) {
    console.error('Failed to retrieve briefing:', error);
    throw new Error(`Failed to retrieve briefing: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Calculate TTL timestamp
 * 
 * Calculates Unix timestamp for TTL expiration (90 days from generation)
 * 
 * @param generatedAt - Generation timestamp in milliseconds
 * @returns TTL timestamp in seconds (DynamoDB format)
 */
export function calculateTTL(generatedAt: number): number {
  const ttlMs = generatedAt + (TTL_DAYS * 24 * 60 * 60 * 1000);
  return Math.floor(ttlMs / 1000);
}
