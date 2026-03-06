/**
 * Unit tests for Signal Orchestrator
 * 
 * Tests cache behavior, signal grouping, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { orchestrateSignalCollection } from '../signal-orchestrator.js';
import * as dataAccess from '../data-access.js';
import type { Universal_Signal, EntitySignalProfile } from '../types.js';

const dynamoMock = mockClient(DynamoDBClient);

// Set up environment variables
beforeEach(() => {
  process.env.AWS_REGION = 'us-east-1';
  process.env.UNIVERSAL_SIGNALS_TABLE = 'test-universal-signals';
  process.env.SIGNAL_CACHE_TABLE = 'test-signal-cache';
  process.env.GROWTH_PLAYS_TABLE = 'test-growth-plays';
  process.env.RISK_PROFILES_TABLE = 'test-risk-profiles';
  
  dynamoMock.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Signal Orchestrator', () => {
  describe('orchestrateSignalCollection', () => {
    it('should return cached profiles when cache hit', async () => {
      const cachedProfiles: EntitySignalProfile[] = [
        {
          entityId: 'entity-1',
          email: 'user@example.com',
          signals: {
            revenue: [],
            relationship: [],
            behavioral: [],
          },
          platformIds: {
            stripe: 'cus_123',
          },
        },
      ];

      // Mock cache hit
      vi.spyOn(dataAccess, 'getCachedEntityProfiles').mockResolvedValue(cachedProfiles);

      const result = await orchestrateSignalCollection({});

      expect(result.cacheHit).toBe(true);
      expect(result.entityProfiles).toEqual(cachedProfiles);
      expect(result.timestamp).toBeDefined();
    });

    it('should query UniversalSignals table on cache miss', async () => {
      // Mock cache miss
      vi.spyOn(dataAccess, 'getCachedEntityProfiles').mockResolvedValue(null);
      vi.spyOn(dataAccess, 'cacheEntityProfiles').mockResolvedValue();

      const revenueSignal: Universal_Signal = {
        signalId: 'sig-1',
        category: 'revenue',
        eventType: 'payment_succeeded',
        entity: {
          primaryKey: 'entity-1',
          alternateKeys: ['user@example.com'],
          platformIds: { stripe: 'cus_123' },
        },
        occurredAt: Date.now() / 1000,
        processedAt: Date.now() / 1000,
        source: {
          platform: 'stripe',
          originalEventType: 'invoice.payment_succeeded',
          originalEventId: 'evt_123',
        },
        impact: {
          severity: 'low',
          metrics: { amount: 5000 },
        },
        platformDetails: {},
        ttl: Math.floor(Date.now() / 1000) + 86400,
      };

      // Mock DynamoDB queries
      dynamoMock.on(QueryCommand).resolves({
        Items: [marshall(revenueSignal)],
      });

      const result = await orchestrateSignalCollection({});

      expect(result.cacheHit).toBe(false);
      expect(result.entityProfiles).toHaveLength(1);
      expect(result.entityProfiles[0].entityId).toBe('entity-1');
      expect(result.entityProfiles[0].email).toBe('user@example.com');
    });

    it('should bypass cache when forceRefresh is true', async () => {
      const getCacheSpy = vi.spyOn(dataAccess, 'getCachedEntityProfiles').mockResolvedValue([]);
      vi.spyOn(dataAccess, 'cacheEntityProfiles').mockResolvedValue();

      // Mock empty query results
      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      await orchestrateSignalCollection({ forceRefresh: true });

      // Cache should not be checked when forceRefresh is true
      expect(getCacheSpy).not.toHaveBeenCalled();
    });

    it('should group signals by entity.primaryKey', async () => {
      vi.spyOn(dataAccess, 'getCachedEntityProfiles').mockResolvedValue(null);
      vi.spyOn(dataAccess, 'cacheEntityProfiles').mockResolvedValue();

      const entity1Revenue: Universal_Signal = {
        signalId: 'sig-1',
        category: 'revenue',
        eventType: 'payment_succeeded',
        entity: {
          primaryKey: 'entity-1',
          alternateKeys: ['user1@example.com'],
          platformIds: { stripe: 'cus_123' },
        },
        occurredAt: Date.now() / 1000,
        processedAt: Date.now() / 1000,
        source: {
          platform: 'stripe',
          originalEventType: 'invoice.payment_succeeded',
          originalEventId: 'evt_123',
        },
        impact: {
          severity: 'low',
          metrics: {},
        },
        platformDetails: {},
        ttl: Math.floor(Date.now() / 1000) + 86400,
      };

      const entity1Behavioral: Universal_Signal = {
        ...entity1Revenue,
        signalId: 'sig-2',
        category: 'behavioral',
        eventType: 'user_inactive',
        source: {
          platform: 'mixpanel',
          originalEventType: 'inactivity_detected',
          originalEventId: 'evt_456',
        },
      };

      const entity2Revenue: Universal_Signal = {
        ...entity1Revenue,
        signalId: 'sig-3',
        entity: {
          primaryKey: 'entity-2',
          alternateKeys: ['user2@example.com'],
          platformIds: { stripe: 'cus_456' },
        },
      };

      // Mock queries to return different signals for different categories
      dynamoMock
        .on(QueryCommand, {
          IndexName: 'CategoryIndex',
          KeyConditionExpression: 'category = :category AND occurredAt > :cutoffTime',
          ExpressionAttributeValues: {
            ':category': { S: 'revenue' },
            ':cutoffTime': { N: expect.any(String) },
          },
        })
        .resolves({
          Items: [marshall(entity1Revenue), marshall(entity2Revenue)],
        })
        .on(QueryCommand, {
          IndexName: 'CategoryIndex',
          KeyConditionExpression: 'category = :category AND occurredAt > :cutoffTime',
          ExpressionAttributeValues: {
            ':category': { S: 'behavioral' },
            ':cutoffTime': { N: expect.any(String) },
          },
        })
        .resolves({
          Items: [marshall(entity1Behavioral)],
        })
        .on(QueryCommand, {
          IndexName: 'CategoryIndex',
          KeyConditionExpression: 'category = :category AND occurredAt > :cutoffTime',
          ExpressionAttributeValues: {
            ':category': { S: 'relationship' },
            ':cutoffTime': { N: expect.any(String) },
          },
        })
        .resolves({
          Items: [],
        });

      const result = await orchestrateSignalCollection({});

      expect(result.entityProfiles).toHaveLength(2);
      
      const profile1 = result.entityProfiles.find(p => p.entityId === 'entity-1');
      expect(profile1).toBeDefined();
      expect(profile1!.signals.revenue).toHaveLength(1);
      expect(profile1!.signals.behavioral).toHaveLength(1);
      expect(profile1!.signals.relationship).toHaveLength(0);

      const profile2 = result.entityProfiles.find(p => p.entityId === 'entity-2');
      expect(profile2).toBeDefined();
      expect(profile2!.signals.revenue).toHaveLength(1);
      expect(profile2!.signals.behavioral).toHaveLength(0);
    });

    it('should use custom time range when provided', async () => {
      vi.spyOn(dataAccess, 'getCachedEntityProfiles').mockResolvedValue(null);
      vi.spyOn(dataAccess, 'cacheEntityProfiles').mockResolvedValue();

      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      const customTimeRange = 168; // 7 days
      await orchestrateSignalCollection({ timeRangeHours: customTimeRange });

      // Verify that the cutoff time is calculated correctly
      const calls = dynamoMock.commandCalls(QueryCommand);
      expect(calls.length).toBeGreaterThan(0);
      
      const cutoffTime = parseInt(calls[0].args[0].input.ExpressionAttributeValues![':cutoffTime'].N!);
      const expectedCutoff = Math.floor(Date.now() / 1000) - (customTimeRange * 60 * 60);
      
      // Allow 5 second tolerance for test execution time
      expect(Math.abs(cutoffTime - expectedCutoff)).toBeLessThan(5);
    });

    it('should cache profiles after successful query', async () => {
      vi.spyOn(dataAccess, 'getCachedEntityProfiles').mockResolvedValue(null);
      const cacheSpy = vi.spyOn(dataAccess, 'cacheEntityProfiles').mockResolvedValue();

      const signal: Universal_Signal = {
        signalId: 'sig-1',
        category: 'revenue',
        eventType: 'payment_succeeded',
        entity: {
          primaryKey: 'entity-1',
          alternateKeys: ['user@example.com'],
          platformIds: { stripe: 'cus_123' },
        },
        occurredAt: Date.now() / 1000,
        processedAt: Date.now() / 1000,
        source: {
          platform: 'stripe',
          originalEventType: 'invoice.payment_succeeded',
          originalEventId: 'evt_123',
        },
        impact: {
          severity: 'low',
          metrics: {},
        },
        platformDetails: {},
        ttl: Math.floor(Date.now() / 1000) + 86400,
      };

      dynamoMock.on(QueryCommand).resolves({
        Items: [marshall(signal)],
      });

      await orchestrateSignalCollection({});

      expect(cacheSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            entityId: 'entity-1',
          }),
        ])
      );
    });

    it('should throw error when environment variables are missing', async () => {
      delete process.env.UNIVERSAL_SIGNALS_TABLE;

      await expect(orchestrateSignalCollection({})).rejects.toThrow(
        'Missing required environment variables'
      );
    });

    it('should handle DynamoDB query errors gracefully', async () => {
      vi.spyOn(dataAccess, 'getCachedEntityProfiles').mockResolvedValue(null);

      dynamoMock.on(QueryCommand).rejects(new Error('DynamoDB error'));

      await expect(orchestrateSignalCollection({})).rejects.toThrow(
        'Failed to query revenue signals'
      );
    });

    it('should handle cache errors and proceed with query', async () => {
      vi.spyOn(dataAccess, 'getCachedEntityProfiles').mockRejectedValue(
        new Error('Cache error')
      );
      vi.spyOn(dataAccess, 'cacheEntityProfiles').mockResolvedValue();

      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      const result = await orchestrateSignalCollection({});

      // Should proceed with query despite cache error
      expect(result.cacheHit).toBe(false);
      expect(result.entityProfiles).toBeDefined();
    });
  });
});
