/**
 * Unit tests for analysis history storage
 * Tests DynamoDB writes, retry logic, and record building
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PutItemCommand } from '@aws-sdk/client-dynamodb';
import {
  storeAnalysisRecord,
  buildAnalysisRecord,
  calculateScoreDistribution,
} from '../history-store.js';
import {
  ICPAnalysisRecord,
  ICPProfile,
  ScoredCustomer,
  ScoreDistribution,
  ExecutionMetrics,
} from '../types.js';

// Mock AWS SDK clients
vi.mock('../clients', () => ({
  createDynamoDBClient: vi.fn(() => ({
    send: vi.fn(),
  })),
}));

describe('History Store', () => {
  let mockSend: any;

  beforeEach(async () => {
    const { createDynamoDBClient } = await import('../clients');
    mockSend = vi.fn();
    (createDynamoDBClient as any).mockReturnValue({
      send: mockSend,
    });
    process.env.AWS_REGION = 'us-east-1';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('storeAnalysisRecord', () => {
    it('should store analysis record successfully', async () => {
      mockSend.mockResolvedValue({});

      const record: ICPAnalysisRecord = {
        analysisId: '2024-01-15T10:00:00.000Z',
        version: 1,
        profile: createMockProfile(),
        topCustomerIds: ['comp-1', 'comp-2'],
        scoreDistribution: { min: 50, max: 95, mean: 75, p90: 90 },
        executionMetrics: { durationMs: 120000, customersAnalyzed: 100, apiCallCount: 15 },
      };

      await storeAnalysisRecord(record, 'test-table');

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith(expect.any(PutItemCommand));
    });

    it('should retry once on DynamoDB failure', async () => {
      mockSend
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({});

      const record: ICPAnalysisRecord = {
        analysisId: '2024-01-15T10:00:00.000Z',
        version: 1,
        profile: createMockProfile(),
        topCustomerIds: ['comp-1'],
        scoreDistribution: { min: 50, max: 95, mean: 75, p90: 90 },
        executionMetrics: { durationMs: 120000, customersAnalyzed: 100, apiCallCount: 15 },
      };

      await storeAnalysisRecord(record, 'test-table');

      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should log error but not throw if retry fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockSend.mockRejectedValue(new Error('Persistent failure'));

      const record: ICPAnalysisRecord = {
        analysisId: '2024-01-15T10:00:00.000Z',
        version: 1,
        profile: createMockProfile(),
        topCustomerIds: ['comp-1'],
        scoreDistribution: { min: 50, max: 95, mean: 75, p90: 90 },
        executionMetrics: { durationMs: 120000, customersAnalyzed: 100, apiCallCount: 15 },
      };

      await expect(storeAnalysisRecord(record, 'test-table')).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to store analysis record'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('buildAnalysisRecord', () => {
    it('should build complete analysis record', () => {
      const profile = createMockProfile();
      const topCustomerIds = ['comp-1', 'comp-2', 'comp-3'];
      const scoreDistribution: ScoreDistribution = {
        min: 45,
        max: 98,
        mean: 72,
        p90: 92,
      };
      const executionMetrics: ExecutionMetrics = {
        durationMs: 180000,
        customersAnalyzed: 150,
        apiCallCount: 20,
      };

      const record = buildAnalysisRecord(
        profile,
        topCustomerIds,
        scoreDistribution,
        executionMetrics
      );

      expect(record).toMatchObject({
        version: profile.version,
        profile,
        topCustomerIds,
        scoreDistribution,
        executionMetrics,
      });
      expect(record.analysisId).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should generate unique analysis ID from timestamp', async () => {
      const profile = createMockProfile();
      const topCustomerIds = ['comp-1'];
      const scoreDistribution: ScoreDistribution = { min: 50, max: 95, mean: 75, p90: 90 };
      const executionMetrics: ExecutionMetrics = {
        durationMs: 120000,
        customersAnalyzed: 100,
        apiCallCount: 15,
      };

      const record1 = buildAnalysisRecord(
        profile,
        topCustomerIds,
        scoreDistribution,
        executionMetrics
      );
      
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const record2 = buildAnalysisRecord(
        profile,
        topCustomerIds,
        scoreDistribution,
        executionMetrics
      );

      expect(record1.analysisId).not.toBe(record2.analysisId);
    });

    it('should include all execution metrics', () => {
      const profile = createMockProfile();
      const executionMetrics: ExecutionMetrics = {
        durationMs: 240000,
        customersAnalyzed: 500,
        apiCallCount: 35,
      };

      const record = buildAnalysisRecord(
        profile,
        [],
        { min: 0, max: 100, mean: 50, p90: 80 },
        executionMetrics
      );

      expect(record.executionMetrics).toEqual(executionMetrics);
    });
  });

  describe('calculateScoreDistribution', () => {
    it('should calculate statistics for scored customers', () => {
      const customers: ScoredCustomer[] = [
        createMockScoredCustomer('comp-1', 50),
        createMockScoredCustomer('comp-2', 75),
        createMockScoredCustomer('comp-3', 85),
        createMockScoredCustomer('comp-4', 90),
        createMockScoredCustomer('comp-5', 95),
      ];

      const distribution = calculateScoreDistribution(customers);

      expect(distribution.min).toBe(50);
      expect(distribution.max).toBe(95);
      expect(distribution.mean).toBe(79);
      // With 5 customers, p90 index = floor(5 * 0.9) = 4, which is the last element (95)
      expect(distribution.p90).toBe(95);
    });

    it('should handle single customer', () => {
      const customers: ScoredCustomer[] = [createMockScoredCustomer('comp-1', 80)];

      const distribution = calculateScoreDistribution(customers);

      expect(distribution.min).toBe(80);
      expect(distribution.max).toBe(80);
      expect(distribution.mean).toBe(80);
      expect(distribution.p90).toBe(80);
    });

    it('should handle empty customer list', () => {
      const distribution = calculateScoreDistribution([]);

      expect(distribution).toEqual({ min: 0, max: 0, mean: 0, p90: 0 });
    });

    it('should calculate correct p90 for large dataset', () => {
      const customers: ScoredCustomer[] = Array.from({ length: 100 }, (_, i) =>
        createMockScoredCustomer(`comp-${i}`, i)
      );

      const distribution = calculateScoreDistribution(customers);

      expect(distribution.min).toBe(0);
      expect(distribution.max).toBe(99);
      expect(distribution.mean).toBe(49.5);
      expect(distribution.p90).toBe(90);
    });

    it('should handle customers with identical scores', () => {
      const customers: ScoredCustomer[] = [
        createMockScoredCustomer('comp-1', 75),
        createMockScoredCustomer('comp-2', 75),
        createMockScoredCustomer('comp-3', 75),
      ];

      const distribution = calculateScoreDistribution(customers);

      expect(distribution.min).toBe(75);
      expect(distribution.max).toBe(75);
      expect(distribution.mean).toBe(75);
      expect(distribution.p90).toBe(75);
    });

    it('should calculate mean correctly with decimal values', () => {
      const customers: ScoredCustomer[] = [
        createMockScoredCustomer('comp-1', 33.33),
        createMockScoredCustomer('comp-2', 66.67),
        createMockScoredCustomer('comp-3', 100),
      ];

      const distribution = calculateScoreDistribution(customers);

      expect(distribution.mean).toBeCloseTo(66.67, 1);
    });
  });
});

// Helper functions

function createMockProfile(): ICPProfile {
  return {
    version: 1,
    generatedAt: '2024-01-15T10:00:00.000Z',
    traits: {
      industries: ['SaaS', 'FinTech'],
      sizeRange: '11-50',
      regions: ['North America'],
      usagePatterns: ['Daily active users', 'High API usage'],
    },
    reasoning: 'Top customers show strong engagement patterns',
    confidenceScore: 85,
    sampleSize: 25,
  };
}

function createMockScoredCustomer(companyId: string, score: number): ScoredCustomer {
  return {
    companyId,
    hubspot: {
      companyId,
      name: `Company ${companyId}`,
      industry: 'SaaS',
      employeeCount: 50,
      region: 'North America',
      totalRevenue: 100000,
      createdAt: '2023-01-01T00:00:00.000Z',
      properties: {},
    },
    mixpanel: {
      companyId,
      ahaEventCount: 100,
      retentionRate: 0.8,
      lastActiveDate: '2024-01-15T00:00:00.000Z',
      engagementScore: 75,
    },
    stripe: {
      customerId: `cus_${companyId}`,
      companyId,
      hasChurnSignal: false,
      mrr: 5000,
      subscriptionStatus: 'active',
    },
    idealCustomerScore: score,
    scoreBreakdown: {
      ltvScore: score,
      engagementScore: score,
      retentionScore: score,
    },
  };
}
