/**
 * Entity Resolver for cross-platform entity matching
 * 
 * Matches entities across Stripe, HubSpot, and Mixpanel using correlation keys
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { Entity_Resolver } from './interfaces';
import { EntityMapping, Platform, Confidence } from './types';

/**
 * DynamoDB-backed entity resolver
 */
export class DynamoDBEntityResolver implements Entity_Resolver {
  private readonly client: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(tableName?: string) {
    const dynamoClient = new DynamoDBClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
    
    this.client = DynamoDBDocumentClient.from(dynamoClient);
    this.tableName = tableName || process.env.ENTITY_MAPPINGS_TABLE || 'EntityMappings';
  }

  /**
   * Resolve entity mapping from correlation keys
   */
  async resolve(
    correlationKeys: string[],
    platform: Platform,
    platformId: string
  ): Promise<EntityMapping> {
    if (correlationKeys.length === 0) {
      return this.createNewMapping(platformId, platform, platformId, 'low');
    }

    // Try to find existing mapping by email (primary key)
    const emailKey = this.findEmailKey(correlationKeys);
    if (emailKey) {
      const existing = await this.getByPrimaryKey(emailKey);
      if (existing) {
        return this.enrichMapping(existing, platform, platformId);
      }
      return this.createNewMapping(emailKey, platform, platformId, 'high');
    }

    // Try to find by platform ID
    const existing = await this.findByPlatformId(platform, platformId);
    if (existing) {
      return existing;
    }

    // Try to find by any correlation key
    for (const key of correlationKeys) {
      const mapping = await this.findByAlternateKey(key);
      if (mapping) {
        return this.enrichMapping(mapping, platform, platformId);
      }
    }

    // Create new mapping with first correlation key as primary
    const primaryKey = correlationKeys[0];
    const confidence = this.determineConfidence(correlationKeys);
    return this.createNewMapping(primaryKey, platform, platformId, confidence);
  }

  /**
   * Get entity mapping by primary key
   */
  async getByPrimaryKey(primaryKey: string): Promise<EntityMapping | null> {
    try {
      const response = await this.client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            PK: `entity#${primaryKey}`,
            SK: 'mapping',
          },
        })
      );

      if (!response.Item) {
        return null;
      }

      return this.deserializeMapping(response.Item);
    } catch (error) {
      console.error('Failed to get entity mapping:', error);
      throw new Error(`Failed to retrieve entity mapping: ${(error as Error).message}`);
    }
  }

  /**
   * Update entity mapping with new platform ID
   */
  async updateMapping(
    primaryKey: string,
    platform: Platform,
    platformId: string
  ): Promise<void> {
    const existing = await this.getByPrimaryKey(primaryKey);
    
    if (!existing) {
      throw new Error(`Entity mapping not found for primary key: ${primaryKey}`);
    }

    existing.platformIds[platform] = platformId;
    existing.lastUpdated = Date.now();

    await this.storeMapping(existing);
  }

  /**
   * Find email key from correlation keys
   */
  private findEmailKey(keys: string[]): string | null {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return keys.find(key => emailRegex.test(key)) || null;
  }

  /**
   * Find mapping by platform ID
   */
  private async findByPlatformId(
    platform: Platform,
    platformId: string
  ): Promise<EntityMapping | null> {
    try {
      const response = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'PlatformIdIndex',
          KeyConditionExpression: 'GSI1PK = :pk',
          ExpressionAttributeValues: {
            ':pk': `platform#${platform}#${platformId}`,
          },
          Limit: 1,
        })
      );

      if (!response.Items || response.Items.length === 0) {
        return null;
      }

      return this.deserializeMapping(response.Items[0]);
    } catch (error) {
      console.error('Failed to find by platform ID:', error);
      return null;
    }
  }

  /**
   * Find mapping by alternate key
   */
  private async findByAlternateKey(key: string): Promise<EntityMapping | null> {
    // For simplicity, we'll use the primary key lookup
    // In production, you might want a separate GSI for alternate keys
    return this.getByPrimaryKey(key);
  }

  /**
   * Enrich existing mapping with new platform ID
   */
  private async enrichMapping(
    mapping: EntityMapping,
    platform: Platform,
    platformId: string
  ): Promise<EntityMapping> {
    if (mapping.platformIds[platform] !== platformId) {
      mapping.platformIds[platform] = platformId;
      mapping.lastUpdated = Date.now();
      await this.storeMapping(mapping);
    }
    return mapping;
  }

  /**
   * Create new entity mapping
   */
  private async createNewMapping(
    primaryKey: string,
    platform: Platform,
    platformId: string,
    confidence: Confidence
  ): Promise<EntityMapping> {
    const mapping: EntityMapping = {
      primaryKey,
      alternateKeys: [],
      platformIds: {
        [platform]: platformId,
      },
      lastUpdated: Date.now(),
      confidence,
    };

    await this.storeMapping(mapping);
    return mapping;
  }

  /**
   * Store entity mapping in DynamoDB
   */
  private async storeMapping(mapping: EntityMapping): Promise<void> {
    try {
      const item = this.serializeMapping(mapping);
      
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
        })
      );
    } catch (error) {
      console.error('Failed to store entity mapping:', error);
      throw new Error(`Failed to store entity mapping: ${(error as Error).message}`);
    }
  }

  /**
   * Serialize mapping for DynamoDB storage
   */
  private serializeMapping(mapping: EntityMapping): Record<string, any> {
    const item: Record<string, any> = {
      PK: `entity#${mapping.primaryKey}`,
      SK: 'mapping',
      primaryKey: mapping.primaryKey,
      alternateKeys: mapping.alternateKeys,
      platformIds: mapping.platformIds,
      lastUpdated: mapping.lastUpdated,
      confidence: mapping.confidence,
    };

    // Add GSI1 keys for each platform
    if (mapping.platformIds.stripe) {
      item.GSI1PK = `platform#stripe#${mapping.platformIds.stripe}`;
      item.GSI1SK = `entity#${mapping.primaryKey}`;
    }
    if (mapping.platformIds.hubspot) {
      item.GSI1PK_hubspot = `platform#hubspot#${mapping.platformIds.hubspot}`;
    }
    if (mapping.platformIds.mixpanel) {
      item.GSI1PK_mixpanel = `platform#mixpanel#${mapping.platformIds.mixpanel}`;
    }

    return item;
  }

  /**
   * Deserialize mapping from DynamoDB item
   */
  private deserializeMapping(item: Record<string, any>): EntityMapping {
    return {
      primaryKey: item.primaryKey,
      alternateKeys: item.alternateKeys || [],
      platformIds: item.platformIds || {},
      lastUpdated: item.lastUpdated,
      confidence: item.confidence,
    };
  }

  /**
   * Determine confidence level based on correlation keys
   */
  private determineConfidence(keys: string[]): Confidence {
    if (this.findEmailKey(keys)) {
      return 'high';
    }
    if (keys.length > 1) {
      return 'medium';
    }
    return 'low';
  }
}
