/**
 * Signal Store for DynamoDB operations
 * 
 * Stores and retrieves Universal_Signals with efficient access patterns
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { Signal_Store } from './interfaces';
import { Universal_Signal, QueryOptions, UniversalEventType, SignalCategory } from './types';

/**
 * DynamoDB-backed signal store
 */
export class DynamoDBSignalStore implements Signal_Store {
  private readonly client: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(tableName?: string) {
    const dynamoClient = new DynamoDBClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
    
    this.client = DynamoDBDocumentClient.from(dynamoClient);
    this.tableName = tableName || process.env.UNIVERSAL_SIGNALS_TABLE || 'UniversalSignals';
  }

  /**
   * Store a Universal_Signal
   */
  async store(signal: Universal_Signal): Promise<void> {
    try {
      const item = this.serializeSignal(signal);
      
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
        })
      );
    } catch (error) {
      console.error('Failed to store signal:', error);
      throw new Error(`Failed to store signal: ${(error as Error).message}`);
    }
  }

  /**
   * Retrieve signals for an entity
   */
  async getByEntity(
    primaryKey: string,
    options?: QueryOptions
  ): Promise<Universal_Signal[]> {
    try {
      const params: any = {
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `entity#${primaryKey}`,
        },
        ScanIndexForward: options?.sortOrder === 'asc',
      };

      if (options?.startTime || options?.endTime) {
        params.KeyConditionExpression += ' AND SK BETWEEN :start AND :end';
        params.ExpressionAttributeValues[':start'] = this.buildSK(options.startTime || 0);
        params.ExpressionAttributeValues[':end'] = this.buildSK(options.endTime || Date.now());
      }

      if (options?.limit) {
        params.Limit = options.limit;
      }

      const response = await this.client.send(new QueryCommand(params));
      
      return (response.Items || []).map(item => this.deserializeSignal(item));
    } catch (error) {
      console.error('Failed to get signals by entity:', error);
      throw new Error(`Failed to retrieve signals: ${(error as Error).message}`);
    }
  }

  /**
   * Retrieve signals by type
   */
  async getByType(
    eventType: UniversalEventType,
    options?: QueryOptions
  ): Promise<Universal_Signal[]> {
    try {
      const params: any = {
        TableName: this.tableName,
        IndexName: 'SignalTypeIndex',
        KeyConditionExpression: 'GSI1PK = :type',
        ExpressionAttributeValues: {
          ':type': `type#${eventType}`,
        },
        ScanIndexForward: options?.sortOrder === 'asc',
      };

      if (options?.startTime || options?.endTime) {
        params.KeyConditionExpression += ' AND GSI1SK BETWEEN :start AND :end';
        params.ExpressionAttributeValues[':start'] = this.buildGSISK(options.startTime || 0);
        params.ExpressionAttributeValues[':end'] = this.buildGSISK(options.endTime || Date.now());
      }

      if (options?.limit) {
        params.Limit = options.limit;
      }

      const response = await this.client.send(new QueryCommand(params));
      
      return (response.Items || []).map(item => this.deserializeSignal(item));
    } catch (error) {
      console.error('Failed to get signals by type:', error);
      throw new Error(`Failed to retrieve signals: ${(error as Error).message}`);
    }
  }

  /**
   * Retrieve signals by category
   */
  async getByCategory(
    category: SignalCategory,
    options?: QueryOptions
  ): Promise<Universal_Signal[]> {
    try {
      const params: any = {
        TableName: this.tableName,
        IndexName: 'CategoryIndex',
        KeyConditionExpression: 'GSI2PK = :category',
        ExpressionAttributeValues: {
          ':category': `category#${category}`,
        },
        ScanIndexForward: options?.sortOrder === 'asc',
      };

      if (options?.startTime || options?.endTime) {
        params.KeyConditionExpression += ' AND GSI2SK BETWEEN :start AND :end';
        params.ExpressionAttributeValues[':start'] = this.buildGSISK(options.startTime || 0);
        params.ExpressionAttributeValues[':end'] = this.buildGSISK(options.endTime || Date.now());
      }

      if (options?.limit) {
        params.Limit = options.limit;
      }

      const response = await this.client.send(new QueryCommand(params));
      
      return (response.Items || []).map(item => this.deserializeSignal(item));
    } catch (error) {
      console.error('Failed to get signals by category:', error);
      throw new Error(`Failed to retrieve signals: ${(error as Error).message}`);
    }
  }

  /**
   * Build sort key for entity queries
   */
  private buildSK(timestamp: number, signalId?: string): string {
    const ts = timestamp.toString().padStart(13, '0');
    return signalId ? `signal#${ts}#${signalId}` : `signal#${ts}`;
  }

  /**
   * Build GSI sort key for type/category queries
   */
  private buildGSISK(timestamp: number, signalId?: string): string {
    const ts = timestamp.toString().padStart(13, '0');
    return signalId ? `${ts}#${signalId}` : ts;
  }

  /**
   * Serialize signal for DynamoDB storage
   */
  private serializeSignal(signal: Universal_Signal): Record<string, any> {
    return {
      // Primary key
      PK: `entity#${signal.entity.primaryKey}`,
      SK: this.buildSK(signal.occurredAt, signal.signalId),
      
      // GSI1 (SignalTypeIndex)
      GSI1PK: `type#${signal.eventType}`,
      GSI1SK: this.buildGSISK(signal.occurredAt, signal.signalId),
      
      // GSI2 (CategoryIndex)
      GSI2PK: `category#${signal.category}`,
      GSI2SK: this.buildGSISK(signal.occurredAt, signal.signalId),
      
      // Signal data
      signalId: signal.signalId,
      category: signal.category,
      eventType: signal.eventType,
      entity: signal.entity,
      occurredAt: signal.occurredAt,
      processedAt: signal.processedAt,
      source: signal.source,
      impact: signal.impact,
      platformDetails: signal.platformDetails,
      ttl: signal.ttl,
    };
  }

  /**
   * Deserialize signal from DynamoDB item
   */
  private deserializeSignal(item: Record<string, any>): Universal_Signal {
    return {
      signalId: item.signalId,
      category: item.category,
      eventType: item.eventType,
      entity: item.entity,
      occurredAt: item.occurredAt,
      processedAt: item.processedAt,
      source: item.source,
      impact: item.impact,
      platformDetails: item.platformDetails,
      ttl: item.ttl,
    };
  }
}
