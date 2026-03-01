/**
 * Unit tests for top customer selection logic
 */

import { describe, it, expect } from 'vitest';
import { selectTopCustomers, validateSampleSize } from '../selection';
import { ScoredCustomer } from '../types';

/**
 * Helper to create a mock scored customer
 */
function createMockScoredCustomer(
  companyId: string,
  score: number
): ScoredCustomer {
  return {
    companyId,
    idealCustomerScore: score,
    scoreBreakdown: {
      ltvScore: score,
      engagementScore: score,
      retentionScore: score
    },
    hubspot: {
      companyId,
      name: `Company ${companyId}`,
      industry: 'Technology',
      employeeCount: 50,
      region: 'US',
      totalRevenue: 100000,
      createdAt: '2024-01-01',
      properties: {}
    },
    mixpanel: null,
    stripe: null
  };
}

describe('selectTopCustomers', () => {
  it('should select top 10% of customers by score', () => {
    const customers = [
      createMockScoredCustomer('1', 90),
      createMockScoredCustomer('2', 80),
      createMockScoredCustomer('3', 70),
      createMockScoredCustomer('4', 60),
      createMockScoredCustomer('5', 50),
      createMockScoredCustomer('6', 40),
      createMockScoredCustomer('7', 30),
      createMockScoredCustomer('8', 20),
      createMockScoredCustomer('9', 10),
      createMockScoredCustomer('10', 5)
    ];

    const top = selectTopCustomers(customers, 10);

    // Top 10% of 10 customers = ceil(10 * 0.1) = 1 customer
    expect(top).toHaveLength(1);
    expect(top[0].companyId).toBe('1');
    expect(top[0].idealCustomerScore).toBe(90);
  });

  it('should select top 20% of customers', () => {
    const customers = [
      createMockScoredCustomer('1', 100),
      createMockScoredCustomer('2', 90),
      createMockScoredCustomer('3', 80),
      createMockScoredCustomer('4', 70),
      createMockScoredCustomer('5', 60)
    ];

    const top = selectTopCustomers(customers, 20);

    // Top 20% of 5 customers = ceil(5 * 0.2) = 1 customer
    expect(top).toHaveLength(1);
    expect(top[0].companyId).toBe('1');
  });

  it('should handle exactly 10 customers', () => {
    const customers = Array.from({ length: 10 }, (_, i) =>
      createMockScoredCustomer(`${i + 1}`, 100 - i * 10)
    );

    const top = selectTopCustomers(customers, 10);

    expect(top).toHaveLength(1);
    expect(top[0].idealCustomerScore).toBe(100);
  });

  it('should handle 1 customer', () => {
    const customers = [createMockScoredCustomer('1', 75)];

    const top = selectTopCustomers(customers, 10);

    // ceil(1 * 0.1) = 1
    expect(top).toHaveLength(1);
    expect(top[0].companyId).toBe('1');
  });

  it('should handle 1000 customers', () => {
    const customers = Array.from({ length: 1000 }, (_, i) =>
      createMockScoredCustomer(`${i + 1}`, 1000 - i)
    );

    const top = selectTopCustomers(customers, 10);

    // Top 10% of 1000 = ceil(1000 * 0.1) = 100 customers
    expect(top).toHaveLength(100);
    expect(top[0].idealCustomerScore).toBe(1000);
    expect(top[99].idealCustomerScore).toBe(901);
  });

  it('should sort customers by score descending', () => {
    const customers = [
      createMockScoredCustomer('1', 30),
      createMockScoredCustomer('2', 90),
      createMockScoredCustomer('3', 60),
      createMockScoredCustomer('4', 10),
      createMockScoredCustomer('5', 80)
    ];

    const top = selectTopCustomers(customers, 40);

    // Top 40% of 5 = ceil(5 * 0.4) = 2 customers
    expect(top).toHaveLength(2);
    expect(top[0].idealCustomerScore).toBe(90);
    expect(top[1].idealCustomerScore).toBe(80);
  });

  it('should not mutate original array', () => {
    const customers = [
      createMockScoredCustomer('1', 30),
      createMockScoredCustomer('2', 90),
      createMockScoredCustomer('3', 60)
    ];

    const originalOrder = customers.map(c => c.companyId);
    selectTopCustomers(customers, 10);

    expect(customers.map(c => c.companyId)).toEqual(originalOrder);
  });
});

describe('validateSampleSize', () => {
  it('should pass validation with sufficient sample size', () => {
    const customers = Array.from({ length: 50 }, (_, i) =>
      createMockScoredCustomer(`${i + 1}`, 100 - i)
    );

    expect(() => validateSampleSize(customers, 20)).not.toThrow();
  });

  it('should throw error if total dataset is below minimum', () => {
    const customers = Array.from({ length: 15 }, (_, i) =>
      createMockScoredCustomer(`${i + 1}`, 100 - i)
    );

    expect(() => validateSampleSize(customers, 20)).toThrow(
      'Insufficient sample size: 15 customers (minimum: 20)'
    );
  });

  it('should throw error if top 10% is less than 5 customers', () => {
    const customers = Array.from({ length: 40 }, (_, i) =>
      createMockScoredCustomer(`${i + 1}`, 100 - i)
    );

    // Top 10% of 40 = ceil(40 * 0.1) = 4 customers (less than 5)
    expect(() => validateSampleSize(customers, 20)).toThrow(
      'Top 10% sample too small: 4 customers (minimum: 5)'
    );
  });

  it('should pass with exactly 50 customers', () => {
    const customers = Array.from({ length: 50 }, (_, i) =>
      createMockScoredCustomer(`${i + 1}`, 100 - i)
    );

    // Top 10% of 50 = ceil(50 * 0.1) = 5 customers (exactly minimum)
    expect(() => validateSampleSize(customers, 20)).not.toThrow();
  });

  it('should pass with 100 customers', () => {
    const customers = Array.from({ length: 100 }, (_, i) =>
      createMockScoredCustomer(`${i + 1}`, 100 - i)
    );

    // Top 10% of 100 = 10 customers (well above minimum)
    expect(() => validateSampleSize(customers, 20)).not.toThrow();
  });

  it('should include diagnostic information in error message', () => {
    const customers = Array.from({ length: 10 }, (_, i) =>
      createMockScoredCustomer(`${i + 1}`, 100 - i)
    );

    expect(() => validateSampleSize(customers, 20)).toThrow(
      /Insufficient sample size.*10 customers.*minimum: 20/
    );
  });

  it('should suggest minimum total customers needed', () => {
    const customers = Array.from({ length: 30 }, (_, i) =>
      createMockScoredCustomer(`${i + 1}`, 100 - i)
    );

    // Top 10% of 30 = 3 customers (less than 5)
    expect(() => validateSampleSize(customers, 20)).toThrow(
      /Need at least 50 total customers/
    );
  });
});
