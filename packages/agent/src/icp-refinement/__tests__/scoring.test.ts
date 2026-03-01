/**
 * Unit tests for customer scoring engine
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeLTV,
  normalizeEngagement,
  calculateRetentionScore,
  calculateIdealCustomerScore
} from '../scoring';
import { CorrelatedCustomer } from '../types';

describe('normalizeLTV', () => {
  it('should return 0 for empty array', () => {
    expect(normalizeLTV(1000, [])).toBe(0);
  });

  it('should return 100 for single positive value', () => {
    expect(normalizeLTV(1000, [1000])).toBe(100);
  });

  it('should return 0 for single zero value', () => {
    expect(normalizeLTV(0, [0])).toBe(0);
  });

  it('should calculate percentile correctly', () => {
    const revenues = [100, 200, 300, 400, 500];
    
    expect(normalizeLTV(100, revenues)).toBe(0);   // Lowest
    expect(normalizeLTV(300, revenues)).toBe(50);  // Middle
    expect(normalizeLTV(500, revenues)).toBe(100); // Highest
  });

  it('should handle negative values as 0', () => {
    const revenues = [100, 200, 300];
    expect(normalizeLTV(-100, revenues)).toBe(0);
  });

  it('should handle NaN as 0', () => {
    const revenues = [100, 200, 300];
    expect(normalizeLTV(NaN, revenues)).toBe(0);
  });

  it('should handle Infinity as 0', () => {
    const revenues = [100, 200, 300];
    expect(normalizeLTV(Infinity, revenues)).toBe(0);
  });

  it('should handle all zeros', () => {
    const revenues = [0, 0, 0];
    expect(normalizeLTV(0, revenues)).toBe(100);
  });
});

describe('normalizeEngagement', () => {
  it('should return 0 for empty array', () => {
    expect(normalizeEngagement(10, [])).toBe(0);
  });

  it('should return 100 for single positive value', () => {
    expect(normalizeEngagement(10, [10])).toBe(100);
  });

  it('should return 0 for single zero value', () => {
    expect(normalizeEngagement(0, [0])).toBe(0);
  });

  it('should calculate percentile correctly', () => {
    const eventCounts = [5, 10, 15, 20, 25];
    
    expect(normalizeEngagement(5, eventCounts)).toBe(0);    // Lowest
    expect(normalizeEngagement(15, eventCounts)).toBe(50);  // Middle
    expect(normalizeEngagement(25, eventCounts)).toBe(100); // Highest
  });

  it('should handle negative values as 0', () => {
    const eventCounts = [5, 10, 15];
    expect(normalizeEngagement(-5, eventCounts)).toBe(0);
  });

  it('should handle NaN as 0', () => {
    const eventCounts = [5, 10, 15];
    expect(normalizeEngagement(NaN, eventCounts)).toBe(0);
  });
});

describe('calculateRetentionScore', () => {
  it('should return retention rate when no churn signal', () => {
    expect(calculateRetentionScore(80, false)).toBe(80);
    expect(calculateRetentionScore(100, false)).toBe(100);
    expect(calculateRetentionScore(0, false)).toBe(0);
  });

  it('should apply 50% penalty with churn signal', () => {
    expect(calculateRetentionScore(80, true)).toBe(40);
    expect(calculateRetentionScore(100, true)).toBe(50);
    expect(calculateRetentionScore(60, true)).toBe(30);
  });

  it('should clamp retention rate to 0-100', () => {
    expect(calculateRetentionScore(150, false)).toBe(100);
    expect(calculateRetentionScore(-10, false)).toBe(0);
  });

  it('should handle NaN as 0', () => {
    expect(calculateRetentionScore(NaN, false)).toBe(0);
    expect(calculateRetentionScore(NaN, true)).toBe(0);
  });

  it('should handle Infinity as 0', () => {
    expect(calculateRetentionScore(Infinity, false)).toBe(0);
  });
});

describe('calculateIdealCustomerScore', () => {
  const createCustomer = (
    revenue: number,
    eventCount: number | null,
    retentionRate: number | null,
    hasChurn: boolean | null
  ): CorrelatedCustomer => ({
    companyId: 'test',
    hubspot: {
      companyId: 'test',
      name: 'Test Co',
      industry: 'Tech',
      employeeCount: 50,
      region: 'US',
      totalRevenue: revenue,
      createdAt: '2024-01-01',
      properties: {}
    },
    mixpanel: eventCount !== null ? {
      companyId: 'test',
      ahaEventCount: eventCount,
      retentionRate: retentionRate || 0,
      lastActiveDate: '2024-01-01',
      engagementScore: 0
    } : null,
    stripe: hasChurn !== null ? {
      customerId: 'cus_test',
      companyId: 'test',
      hasChurnSignal: hasChurn,
      mrr: 1000,
      subscriptionStatus: 'active'
    } : null
  });

  it('should calculate score with complete data', () => {
    const customers = [
      createCustomer(1000, 10, 80, false),
      createCustomer(2000, 20, 90, false),
      createCustomer(3000, 30, 95, false)
    ];

    const scored = calculateIdealCustomerScore(customers[1], customers);
    
    expect(scored.idealCustomerScore).toBeGreaterThan(0);
    expect(scored.idealCustomerScore).toBeLessThanOrEqual(100);
    expect(scored.scoreBreakdown.ltvScore).toBe(50);
    expect(scored.scoreBreakdown.engagementScore).toBe(50);
    expect(scored.scoreBreakdown.retentionScore).toBe(90);
  });

  it('should handle missing Mixpanel data', () => {
    const customers = [
      createCustomer(1000, null, null, false),
      createCustomer(2000, null, null, false),
      createCustomer(3000, null, null, false)
    ];

    const scored = calculateIdealCustomerScore(customers[0], customers);
    
    // With all customers having 0 events, lowest revenue gets lowest engagement score
    expect(scored.scoreBreakdown.engagementScore).toBe(0);
    expect(scored.scoreBreakdown.retentionScore).toBe(0);
    expect(scored.idealCustomerScore).toBeGreaterThanOrEqual(0);
  });

  it('should handle missing Stripe data', () => {
    const customers = [
      createCustomer(1000, 10, 80, null),
      createCustomer(2000, 20, 90, null)
    ];

    const scored = calculateIdealCustomerScore(customers[0], customers);
    
    expect(scored.scoreBreakdown.retentionScore).toBe(80);
    expect(scored.idealCustomerScore).toBeGreaterThanOrEqual(0);
  });

  it('should apply weighted average correctly', () => {
    const customers = [
      createCustomer(1000, 10, 100, false),
      createCustomer(2000, 20, 100, false)
    ];

    const scored = calculateIdealCustomerScore(customers[1], customers);
    
    // LTV: 100, Engagement: 100, Retention: 100
    // Score = 100 * 0.4 + 100 * 0.3 + 100 * 0.3 = 100
    expect(scored.scoreBreakdown.ltvScore).toBe(100);
    expect(scored.scoreBreakdown.engagementScore).toBe(100);
    expect(scored.scoreBreakdown.retentionScore).toBe(100);
    expect(scored.idealCustomerScore).toBe(100);
  });

  it('should penalize customers with churn signals', () => {
    const customers = [
      createCustomer(2000, 20, 80, false),
      createCustomer(2000, 20, 80, true)
    ];

    const noChurn = calculateIdealCustomerScore(customers[0], customers);
    const withChurn = calculateIdealCustomerScore(customers[1], customers);
    
    expect(withChurn.idealCustomerScore).toBeLessThan(noChurn.idealCustomerScore);
    expect(withChurn.scoreBreakdown.retentionScore).toBe(40); // 80 * 0.5
    expect(noChurn.scoreBreakdown.retentionScore).toBe(80);
  });

  it('should handle single customer', () => {
    const customers = [createCustomer(1000, 10, 80, false)];
    const scored = calculateIdealCustomerScore(customers[0], customers);
    
    expect(scored.idealCustomerScore).toBeGreaterThanOrEqual(0);
    expect(scored.idealCustomerScore).toBeLessThanOrEqual(100);
  });

  it('should handle extreme values', () => {
    const customers = [
      createCustomer(0, 0, 0, false),
      createCustomer(1000000, 1000, 100, false)
    ];

    const lowScored = calculateIdealCustomerScore(customers[0], customers);
    const highScored = calculateIdealCustomerScore(customers[1], customers);
    
    expect(lowScored.idealCustomerScore).toBeLessThan(highScored.idealCustomerScore);
  });
});
