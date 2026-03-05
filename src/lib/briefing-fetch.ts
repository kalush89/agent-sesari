/**
 * Briefing Fetch Utility
 * 
 * Handles fetching and decompressing daily briefings from DynamoDB.
 * Extracted from API route for reusability and better code organization.
 */

import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { gunzipSync } from 'zlib';

/**
 * Briefing interface matching the backend structure
 */
export interface Briefing {
  date: string;
  generatedAt: number;
  insights: Array<{
    id: string;
    narrative: string;
    severity: string;
    category: string;
    thoughtTrace: {
      signals: Array<{
        source: string;
        eventType: string;
        timestamp: number;
        severity: string;
      }>;
    };
    growthPlay: {
      label: string;
      action: string;
      target: string;
    };
  }>;
  metadata: {
    signalCount: number;
    priorityLevel: string;
    categories: {
      revenue: number;
      relationship: number;
      behavioral: number;
    };
  };
}

/**
 * Fetch briefing from DynamoDB
 * 
 * Retrieves and decompresses briefing content for the specified date.
 * 
 * @param date - Date in YYYY-MM-DD format
 * @returns Briefing object or null if not found
 * @throws Error if DynamoDB query fails or environment is misconfigured
 */
export async function fetchBriefing(date: string): Promise<Briefing | null> {
  const tableName = process.env.BRIEFING_STORE_TABLE;
  const region = process.env.AWS_REGION || 'us-east-1';
  
  if (!tableName) {
    throw new Error('BRIEFING_STORE_TABLE environment variable is not set');
  }
  
  const client = new DynamoDBClient({ region });
  const userId = 'default'; // TODO: Multi-tenant support
  
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
    console.error('DynamoDB GetItem failed:', error);
    throw new Error(`Failed to retrieve briefing: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decompress gzip content
 * 
 * Decompresses gzip buffer back to JSON string.
 * Falls back to uncompressed content if decompression fails.
 * 
 * @param compressed - Compressed buffer from DynamoDB
 * @returns Decompressed JSON string
 * @throws Error if both decompression and fallback fail
 */
function decompressContent(compressed: Buffer): string {
  try {
    const decompressed = gunzipSync(compressed);
    return decompressed.toString('utf-8');
  } catch (error) {
    console.warn('Decompression failed, attempting to read as uncompressed:', error);
    // Attempt to read as uncompressed content (fallback)
    try {
      return compressed.toString('utf-8');
    } catch (fallbackError) {
      console.error('Failed to read content:', fallbackError);
      throw new Error('Unable to decompress or read briefing content');
    }
  }
}
