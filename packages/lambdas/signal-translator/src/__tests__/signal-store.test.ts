/**
 * Unit tests for DynamoDB Signal Store
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DynamoDBSignalStore } from '../signal-store';
import { Universal_Signal } from '../types';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('DynamoDBSignalStore', () => {
  let store: DynamoDBSignalStore;

  beforeEach(() => {
    ddbMock.reset();
    store = new DynamoDBSignalStore('TestUniversalSignals');
    process.env.AWS_REGION = 'us-east-1';
  });

  const createTestSignal = (overrides?: Partial<Universal_Signal>): Universal_Signal => ({
    signalId: 'sig_123',
    category: 'revenue',
    eventType: 'revenue.expansion',
    entity: {
      primaryKey: 'user@example.com',
      alternateKeys: [],
      platformIds: { stripe: 'cus_123' },
    },
    occurredAt: 1700000000000,
    processedAt: 1700000100000,
    source: {
      platform: 'stripe',
      originalEventType: 'expansion',
      originalEventId: 'evt_123',
    },
    impact: {
      severity: 'high',
      metrics: {
        revenue: {
          amount: 100,
          currency: 'usd',
          mrr: 200,
          mrrChange: 100,
        },
      },
    },
    platformDetails: {
      subscriptionId: 'sub_123',
    },
    ttl: 1707776100,
    ...overrides,
  });

  describe('store', () => {
    it('should store signal with correct keys', async () => {
      const signal = createTestSignal();
      ddbMock.on(PutCommand).resolves({});

      await store.store(signal);

      expect(ddbMock.commandCalls(PutCommand).length).toBe(1);
      const putCall = ddbMock.commandCalls(PutCommand)[0];
      const item = putCall.args[0].input.Item;

      expect(item?.PK).toBe('entity#user@example.com');
      expect(item?.SK).toContain('signal#');
      expect(item?.GSI1PK).toBe('type#revenue.expansion');
      expect(item?.GSI2PK).toBe('category#revenue');
      expect(item?.signalId).toBe('sig_123');
    });

    it('should throw error on DynamoDB failure', async () => {
      const signal = createTestSignal();
      ddbMock.on(PutCommand).rejects(new Error('DynamoDB error'));

      await expect(store.store(signal)).rejects.toThrow('Failed to store signal');
    });
  });

  describe('getByEntity', () => {
    it('should retrieve signals for entity', async () => {
      const signal = createTestSignal();
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            PK: 'entity#user@example.com',
            SK: 'signal#1700000000000#sig_123',
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
          },
        ],
      });

      const results = await store.getByEntity('user@example.com');

      expect(results).toHaveLength(1);
      expect(results[0].signalId).toBe('sig_123');
      expect(results[0].entity.primaryKey).toBe('user@example.com');
    });

    it('should filter by time range', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      await store.getByEntity('user@example.com', {
        startTime: 1700000000000,
        endTime: 1700086400000,
      });

      const queryCall = ddbMock.commandCalls(QueryCommand)[0];
      expect(queryCall.args[0].input.KeyConditionExpression).toContain('BETWEEN');
    });

    it('should apply limit', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      await store.getByEntity('user@example.com', { limit: 10 });

      const queryCall = ddbMock.commandCalls(QueryCommand)[0];
      expect(queryCall.args[0].input.Limit).toBe(10);
    });

    it('should sort ascending when specified', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      await store.getByEntity('user@example.com', { sortOrder: 'asc' });

      const queryCall = ddbMock.commandCalls(QueryCommand)[0];
      expect(queryCall.args[0].input.ScanIndexForward).toBe(true);
    });

    it('should throw error on query failure', async () => {
      ddbMock.on(QueryCommand).rejects(new Error('Query error'));

      await expect(
        store.getByEntity('user@example.com')
      ).rejects.toThrow('Failed to retrieve signals');
    });
  });

  describe('getByType', () => {
    it('should retrieve signals by event type', async () => {
      const signal = createTestSignal();
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
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
          },
        ],
      });

      const results = await store.getByType('revenue.expansion');

      expect(results).toHaveLength(1);
      expect(results[0].eventType).toBe('revenue.expansion');
    });

    it('should use SignalTypeIndex', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      await store.getByType('revenue.expansion');

      const queryCall = ddbMock.commandCalls(QueryCommand)[0];
      expect(queryCall.args[0].input.IndexName).toBe('SignalTypeIndex');
      expect(queryCall.args[0].input.ExpressionAttributeValues?.[':type']).toBe(
        'type#revenue.expansion'
      );
    });

    it('should filter by time range', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      await store.getByType('revenue.expansion', {
        startTime: 1700000000000,
        endTime: 1700086400000,
      });

      const queryCall = ddbMock.commandCalls(QueryCommand)[0];
      expect(queryCall.args[0].input.KeyConditionExpression).toContain('BETWEEN');
    });
  });

  describe('getByCategory', () => {
    it('should retrieve signals by category', async () => {
      const signal = createTestSignal();
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
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
          },
        ],
      });

      const results = await store.getByCategory('revenue');

      expect(results).toHaveLength(1);
      expect(results[0].category).toBe('revenue');
    });

    it('should use CategoryIndex', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      await store.getByCategory('revenue');

      const queryCall = ddbMock.commandCalls(QueryCommand)[0];
      expect(queryCall.args[0].input.IndexName).toBe('CategoryIndex');
      expect(queryCall.args[0].input.ExpressionAttributeValues?.[':category']).toBe(
        'category#revenue'
      );
    });

    it('should filter by time range', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      await store.getByCategory('revenue', {
        startTime: 1700000000000,
        endTime: 1700086400000,
      });

      const queryCall = ddbMock.commandCalls(QueryCommand)[0];
      expect(queryCall.args[0].input.KeyConditionExpression).toContain('BETWEEN');
    });
  });

  describe('TTL calculation', () => {
    it('should include TTL in stored signal', async () => {
      const signal = createTestSignal({ ttl: 1707776100 });
      ddbMock.on(PutCommand).resolves({});

      await store.store(signal);

      const putCall = ddbMock.commandCalls(PutCommand)[0];
      expect(putCall.args[0].input.Item?.ttl).toBe(1707776100);
    });
  });
});
