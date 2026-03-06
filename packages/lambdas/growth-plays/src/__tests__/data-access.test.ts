/**
 * Unit tests for DynamoDB data access layer
 * 
 * Tests cover:
 * - Growth Play CRUD operations
 * - Risk Profile storage and retrieval
 * - Signal cache operations
 * - Error handling for network failures
 * - TTL attribute configuration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  QueryCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import {
  storeGrowthPlay,
  getGrowthPlayById,
  queryGrowthPlaysByStatus,
  updateGrowthPlayStatus,
  storeRiskProfile,
  getRiskProfile,
  cacheEntityProfiles as cacheProfiles,
  getCachedEntityProfiles as getCachedProfiles,
} from '../data-access';
import { GrowthPlay, RiskProfile, UnifiedCustomerProfile } from '../types';

const ddbMock = mockClient(DynamoDBClient);

// Set up environment variables
process.env.AWS_REGION = 'us-east-1';
process.env.GROWTH_PLAYS_TABLE = 'GrowthPlays-test';
process.env.RISK_PROFILES_TABLE = 'CustomerRiskProfiles-test';
process.env.SIGNAL_CACHE_TABLE = 'SignalCache-test';

describe('Data Access Layer', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  describe('storeGrowthPlay', () => {
    it('should store a Growth Play successfully', async () => {
      const growthPlay: GrowthPlay = {
        id: 'gp-123',
        customerId: 'cust-456',
        customerName: 'John Doe',
        companyName: 'Acme Corp',
        riskScore: 85,
        communicationType: 'email',
        subject: 'Checking in on your usage',
        draftContent: 'Hi John, I noticed...',
        thoughtTrace: {
          riskFactors: [],
          reasoning: 'Usage declined significantly',
          signalSources: ['Mixpanel', 'Stripe'],
        },
        status: 'pending',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        auditTrail: [],
      };

      ddbMock.on(PutItemCommand).resolves({});

      await storeGrowthPlay(growthPlay);

      expect(ddbMock.calls()).toHaveLength(1);
      const call = ddbMock.call(0);
      expect(call.args[0].input.TableName).toBe('GrowthPlays-test');
    });

    it('should handle network failures with descriptive error', async () => {
      const growthPlay: GrowthPlay = {
        id: 'gp-123',
        customerId: 'cust-456',
        customerName: 'John Doe',
        companyName: 'Acme Corp',
        riskScore: 85,
        communicationType: 'email',
        draftContent: 'Hi John...',
        thoughtTrace: {
          riskFactors: [],
          reasoning: 'Test',
          signalSources: ['Mixpanel'],
        },
        status: 'pending',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        auditTrail: [],
      };

      ddbMock.on(PutItemCommand).rejects(new Error('Network timeout'));

      await expect(storeGrowthPlay(growthPlay)).rejects.toThrow(
        'Failed to store Growth Play: Network timeout'
      );
    });
  });

  describe('getGrowthPlayById', () => {
    it('should retrieve a Growth Play by ID', async () => {
      const growthPlay: GrowthPlay = {
        id: 'gp-123',
        customerId: 'cust-456',
        customerName: 'John Doe',
        companyName: 'Acme Corp',
        riskScore: 85,
        communicationType: 'email',
        draftContent: 'Hi John...',
        thoughtTrace: {
          riskFactors: [],
          reasoning: 'Test',
          signalSources: ['Mixpanel'],
        },
        status: 'pending',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        auditTrail: [],
      };

      ddbMock.on(GetItemCommand).resolves({
        Item: marshall(growthPlay),
      });

      const result = await getGrowthPlayById('gp-123');

      expect(result).toBeDefined();
      expect(result?.id).toBe('gp-123');
      expect(result?.customerName).toBe('John Doe');
    });

    it('should return null when Growth Play not found', async () => {
      ddbMock.on(GetItemCommand).resolves({});

      const result = await getGrowthPlayById('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle DynamoDB errors', async () => {
      ddbMock.on(GetItemCommand).rejects(new Error('Table not found'));

      await expect(getGrowthPlayById('gp-123')).rejects.toThrow(
        'Failed to get Growth Play: Table not found'
      );
    });
  });

  describe('queryGrowthPlaysByStatus', () => {
    it('should query Growth Plays by status', async () => {
      const growthPlays: GrowthPlay[] = [
        {
          id: 'gp-1',
          customerId: 'cust-1',
          customerName: 'Alice',
          companyName: 'Company A',
          riskScore: 80,
          communicationType: 'email',
          draftContent: 'Draft 1',
          thoughtTrace: {
            riskFactors: [],
            reasoning: 'Test',
            signalSources: ['Mixpanel'],
          },
          status: 'pending',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          auditTrail: [],
        },
        {
          id: 'gp-2',
          customerId: 'cust-2',
          customerName: 'Bob',
          companyName: 'Company B',
          riskScore: 75,
          communicationType: 'slack',
          draftContent: 'Draft 2',
          thoughtTrace: {
            riskFactors: [],
            reasoning: 'Test',
            signalSources: ['Stripe'],
          },
          status: 'pending',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          auditTrail: [],
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: growthPlays.map(gp => marshall(gp)),
      });

      const result = await queryGrowthPlaysByStatus('pending');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('gp-1');
      expect(result[1].id).toBe('gp-2');
    });

    it('should return empty array when no matches found', async () => {
      ddbMock.on(QueryCommand).resolves({});

      const result = await queryGrowthPlaysByStatus('executed');

      expect(result).toEqual([]);
    });

    it('should handle query errors', async () => {
      ddbMock.on(QueryCommand).rejects(new Error('Index not found'));

      await expect(queryGrowthPlaysByStatus('pending')).rejects.toThrow(
        'Failed to query Growth Plays: Index not found'
      );
    });
  });

  describe('updateGrowthPlayStatus', () => {
    it('should update status and append audit trail', async () => {
      const auditEntry = {
        action: 'approved' as const,
        timestamp: '2024-01-01T12:00:00Z',
        userId: 'user-123',
      };

      ddbMock.on(UpdateItemCommand).resolves({});

      await updateGrowthPlayStatus('gp-123', 'approved', auditEntry);

      expect(ddbMock.calls()).toHaveLength(1);
      const call = ddbMock.call(0);
      expect(call.args[0].input.TableName).toBe('GrowthPlays-test');
    });

    it('should handle update errors', async () => {
      const auditEntry = {
        action: 'approved' as const,
        timestamp: '2024-01-01T12:00:00Z',
      };

      ddbMock.on(UpdateItemCommand).rejects(new Error('Conditional check failed'));

      await expect(
        updateGrowthPlayStatus('gp-123', 'approved', auditEntry)
      ).rejects.toThrow('Failed to update Growth Play status: Conditional check failed');
    });
  });

  describe('storeRiskProfile', () => {
    it('should store risk profile with TTL attribute', async () => {
      const riskProfile: RiskProfile = {
        customerId: 'cust-123',
        riskScore: 85,
        riskFactors: [
          {
            type: 'usage_decline',
            severity: 90,
            signalValues: { decline: 60 },
            weight: 0.4,
          },
        ],
        detectedAt: '2024-01-01T00:00:00Z',
      };

      ddbMock.on(PutItemCommand).resolves({});

      await storeRiskProfile(riskProfile);

      expect(ddbMock.calls()).toHaveLength(1);
      const call = ddbMock.call(0);
      expect(call.args[0].input.TableName).toBe('CustomerRiskProfiles-test');
      
      // Verify TTL is set (90 days = 7776000 seconds)
      const item = call.args[0].input.Item;
      expect(item?.expiresAt).toBeDefined();
    });

    it('should handle storage errors', async () => {
      const riskProfile: RiskProfile = {
        customerId: 'cust-123',
        riskScore: 85,
        riskFactors: [],
        detectedAt: '2024-01-01T00:00:00Z',
      };

      ddbMock.on(PutItemCommand).rejects(new Error('Item too large'));

      await expect(storeRiskProfile(riskProfile)).rejects.toThrow(
        'Failed to store risk profile: Item too large'
      );
    });
  });

  describe('getRiskProfile', () => {
    it('should retrieve most recent risk profile', async () => {
      const riskProfile: RiskProfile = {
        customerId: 'cust-123',
        riskScore: 85,
        riskFactors: [],
        detectedAt: '2024-01-01T00:00:00Z',
      };

      ddbMock.on(QueryCommand).resolves({
        Items: [marshall({ ...riskProfile, expiresAt: 1234567890 })],
      });

      const result = await getRiskProfile('cust-123');

      expect(result).toBeDefined();
      expect(result?.customerId).toBe('cust-123');
      expect(result?.riskScore).toBe(85);
    });

    it('should return null when no profile found', async () => {
      ddbMock.on(QueryCommand).resolves({});

      const result = await getRiskProfile('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('cacheProfiles', () => {
    it('should cache profiles with 1-hour TTL', async () => {
      const profiles: UnifiedCustomerProfile[] = [
        {
          customerId: 'cust-1',
          email: 'alice@example.com',
          companyName: 'Company A',
          mixpanelData: {
            eventCount30Days: 100,
            eventCount60Days: 250,
            lastActiveDate: '2024-01-01T00:00:00Z',
          },
          hubspotData: {
            openTickets: 2,
            lastContactDate: '2024-01-01T00:00:00Z',
          },
          stripeData: {
            subscriptionStatus: 'active',
            renewalDate: '2024-02-01T00:00:00Z',
            mrr: 10000,
          },
        },
      ];

      ddbMock.on(PutItemCommand).resolves({});

      await cacheProfiles(profiles);

      expect(ddbMock.calls()).toHaveLength(1);
      const call = ddbMock.call(0);
      expect(call.args[0].input.TableName).toBe('SignalCache-test');
      
      // Verify TTL is set (1 hour = 3600 seconds)
      const item = call.args[0].input.Item;
      expect(item?.expiresAt).toBeDefined();
    });

    it('should handle cache errors', async () => {
      ddbMock.on(PutItemCommand).rejects(new Error('Throttling exception'));

      await expect(cacheProfiles([])).rejects.toThrow(
        'Failed to cache profiles: Throttling exception'
      );
    });
  });

  describe('getCachedProfiles', () => {
    it('should retrieve cached profiles', async () => {
      const profiles: UnifiedCustomerProfile[] = [
        {
          customerId: 'cust-1',
          email: 'alice@example.com',
          companyName: 'Company A',
          mixpanelData: {
            eventCount30Days: 100,
            eventCount60Days: 250,
            lastActiveDate: '2024-01-01T00:00:00Z',
          },
          hubspotData: {
            openTickets: 2,
            lastContactDate: '2024-01-01T00:00:00Z',
          },
          stripeData: {
            subscriptionStatus: 'active',
            renewalDate: '2024-02-01T00:00:00Z',
            mrr: 10000,
          },
        },
      ];

      ddbMock.on(GetItemCommand).resolves({
        Item: marshall({
          cacheKey: 'unified-profiles',
          profiles,
          cachedAt: '2024-01-01T00:00:00Z',
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        }),
      });

      const result = await getCachedProfiles();

      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result?.[0].customerId).toBe('cust-1');
    });

    it('should return null when cache is empty', async () => {
      ddbMock.on(GetItemCommand).resolves({});

      const result = await getCachedProfiles();

      expect(result).toBeNull();
    });

    it('should handle retrieval errors', async () => {
      ddbMock.on(GetItemCommand).rejects(new Error('Connection timeout'));

      await expect(getCachedProfiles()).rejects.toThrow(
        'Failed to get cached profiles: Connection timeout'
      );
    });
  });
});
