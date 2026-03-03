/**
 * Unit tests for DynamoDB Entity Resolver
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DynamoDBEntityResolver } from '../entity-resolver';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('DynamoDBEntityResolver', () => {
  let resolver: DynamoDBEntityResolver;

  beforeEach(() => {
    ddbMock.reset();
    resolver = new DynamoDBEntityResolver('TestEntityMappings');
    process.env.AWS_REGION = 'us-east-1';
  });

  describe('resolve', () => {
    it('should create new mapping with email as primary key', async () => {
      const email = 'user@example.com';
      const correlationKeys = [email, 'cus_123'];

      ddbMock.on(GetCommand).resolves({ Item: undefined });
      ddbMock.on(PutCommand).resolves({});

      const result = await resolver.resolve(correlationKeys, 'stripe', 'cus_123');

      expect(result.primaryKey).toBe(email);
      expect(result.platformIds.stripe).toBe('cus_123');
      expect(result.confidence).toBe('high');
    });

    it('should use existing mapping when found by email', async () => {
      const email = 'user@example.com';
      const existingMapping = {
        PK: `entity#${email}`,
        SK: 'mapping',
        primaryKey: email,
        alternateKeys: [],
        platformIds: { hubspot: 'hs_123' },
        lastUpdated: Date.now(),
        confidence: 'high',
      };

      ddbMock.on(GetCommand).resolves({ Item: existingMapping });
      ddbMock.on(PutCommand).resolves({});

      const result = await resolver.resolve([email], 'stripe', 'cus_123');

      expect(result.primaryKey).toBe(email);
      expect(result.platformIds.hubspot).toBe('hs_123');
      expect(result.platformIds.stripe).toBe('cus_123');
    });

    it('should find mapping by platform ID', async () => {
      const existingMapping = {
        PK: 'entity#user@example.com',
        SK: 'mapping',
        primaryKey: 'user@example.com',
        alternateKeys: [],
        platformIds: { stripe: 'cus_123' },
        lastUpdated: Date.now(),
        confidence: 'high',
      };

      ddbMock.on(GetCommand).resolves({ Item: undefined });
      ddbMock.on(QueryCommand).resolves({ Items: [existingMapping] });

      const result = await resolver.resolve(['cus_123'], 'stripe', 'cus_123');

      expect(result.primaryKey).toBe('user@example.com');
      expect(result.platformIds.stripe).toBe('cus_123');
    });

    it('should create mapping with low confidence when no email', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      ddbMock.on(PutCommand).resolves({});

      const result = await resolver.resolve(['cus_123'], 'stripe', 'cus_123');

      expect(result.primaryKey).toBe('cus_123');
      expect(result.confidence).toBe('low');
    });

    it('should handle empty correlation keys', async () => {
      ddbMock.on(PutCommand).resolves({});

      const result = await resolver.resolve([], 'stripe', 'cus_123');

      expect(result.primaryKey).toBe('cus_123');
      expect(result.confidence).toBe('low');
    });
  });

  describe('getByPrimaryKey', () => {
    it('should return mapping when found', async () => {
      const mapping = {
        PK: 'entity#user@example.com',
        SK: 'mapping',
        primaryKey: 'user@example.com',
        alternateKeys: ['alt_123'],
        platformIds: { stripe: 'cus_123', hubspot: 'hs_123' },
        lastUpdated: Date.now(),
        confidence: 'high',
      };

      ddbMock.on(GetCommand).resolves({ Item: mapping });

      const result = await resolver.getByPrimaryKey('user@example.com');

      expect(result).not.toBeNull();
      expect(result?.primaryKey).toBe('user@example.com');
      expect(result?.platformIds.stripe).toBe('cus_123');
      expect(result?.platformIds.hubspot).toBe('hs_123');
    });

    it('should return null when not found', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const result = await resolver.getByPrimaryKey('nonexistent@example.com');

      expect(result).toBeNull();
    });

    it('should throw error on DynamoDB failure', async () => {
      ddbMock.on(GetCommand).rejects(new Error('DynamoDB error'));

      await expect(
        resolver.getByPrimaryKey('user@example.com')
      ).rejects.toThrow('Failed to retrieve entity mapping');
    });
  });

  describe('updateMapping', () => {
    it('should update existing mapping with new platform ID', async () => {
      const existingMapping = {
        PK: 'entity#user@example.com',
        SK: 'mapping',
        primaryKey: 'user@example.com',
        alternateKeys: [],
        platformIds: { stripe: 'cus_123' },
        lastUpdated: Date.now() - 1000,
        confidence: 'high',
      };

      ddbMock.on(GetCommand).resolves({ Item: existingMapping });
      ddbMock.on(PutCommand).resolves({});

      await resolver.updateMapping('user@example.com', 'hubspot', 'hs_123');

      expect(ddbMock.commandCalls(PutCommand).length).toBe(1);
      const putCall = ddbMock.commandCalls(PutCommand)[0];
      expect(putCall.args[0].input.Item?.platformIds.hubspot).toBe('hs_123');
    });

    it('should throw error when mapping not found', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      await expect(
        resolver.updateMapping('nonexistent@example.com', 'stripe', 'cus_123')
      ).rejects.toThrow('Entity mapping not found');
    });
  });

  describe('partial platform coverage', () => {
    it('should handle mapping with only one platform', async () => {
      const mapping = {
        PK: 'entity#user@example.com',
        SK: 'mapping',
        primaryKey: 'user@example.com',
        alternateKeys: [],
        platformIds: { stripe: 'cus_123' },
        lastUpdated: Date.now(),
        confidence: 'high',
      };

      ddbMock.on(GetCommand).resolves({ Item: mapping });

      const result = await resolver.getByPrimaryKey('user@example.com');

      expect(result).not.toBeNull();
      expect(result?.platformIds.stripe).toBe('cus_123');
      expect(result?.platformIds.hubspot).toBeUndefined();
      expect(result?.platformIds.mixpanel).toBeUndefined();
    });

    it('should handle mapping with two platforms', async () => {
      const mapping = {
        PK: 'entity#user@example.com',
        SK: 'mapping',
        primaryKey: 'user@example.com',
        alternateKeys: [],
        platformIds: { stripe: 'cus_123', hubspot: 'hs_456' },
        lastUpdated: Date.now(),
        confidence: 'high',
      };

      ddbMock.on(GetCommand).resolves({ Item: mapping });

      const result = await resolver.getByPrimaryKey('user@example.com');

      expect(result).not.toBeNull();
      expect(result?.platformIds.stripe).toBe('cus_123');
      expect(result?.platformIds.hubspot).toBe('hs_456');
      expect(result?.platformIds.mixpanel).toBeUndefined();
    });
  });

  describe('multiple correlation keys', () => {
    it('should resolve to same entity with different keys', async () => {
      const email = 'user@example.com';
      const mapping = {
        PK: `entity#${email}`,
        SK: 'mapping',
        primaryKey: email,
        alternateKeys: ['cus_123', 'hs_456'],
        platformIds: { stripe: 'cus_123', hubspot: 'hs_456' },
        lastUpdated: Date.now(),
        confidence: 'high',
      };

      ddbMock.on(GetCommand).resolves({ Item: mapping });

      const result1 = await resolver.getByPrimaryKey(email);
      const result2 = await resolver.getByPrimaryKey(email);

      expect(result1?.primaryKey).toBe(result2?.primaryKey);
      expect(result1?.platformIds).toEqual(result2?.platformIds);
    });
  });
});
