/**
 * Unit tests for data masking layer
 * Requirements: 5.1, 5.2, 5.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { maskCustomerData, validateNoPII } from '../masking';
import { ScoredCustomer, MaskedCustomer } from '../types';

describe('Data Masking Layer', () => {
  let consoleLogSpy: any;
  let consoleWarnSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  function createScoredCustomer(overrides: Partial<ScoredCustomer> = {}): ScoredCustomer {
    return {
      companyId: 'test-company-1',
      hubspot: {
        companyId: 'test-company-1',
        name: 'Test Company Inc',
        industry: 'Technology',
        employeeCount: 50,
        region: 'North America',
        totalRevenue: 75000,
        createdAt: '2024-01-01',
        properties: {},
      },
      mixpanel: {
        companyId: 'test-company-1',
        ahaEventCount: 100,
        retentionRate: 85,
        lastActiveDate: '2024-03-01',
        engagementScore: 75,
      },
      stripe: {
        customerId: 'cus_123',
        companyId: 'test-company-1',
        hasChurnSignal: false,
        mrr: 5000,
        subscriptionStatus: 'active',
      },
      idealCustomerScore: 80,
      scoreBreakdown: {
        ltvScore: 75,
        engagementScore: 80,
        retentionScore: 85,
      },
      ...overrides,
    };
  }

  describe('maskCustomerData', () => {
    it('should remove email addresses from company names', () => {
      const customer = createScoredCustomer({
        hubspot: {
          companyId: 'test-1',
          name: 'Contact us at info@example.com',
          industry: 'Technology',
          employeeCount: 50,
          region: 'North America',
          totalRevenue: 75000,
          createdAt: '2024-01-01',
          properties: {},
        },
      });

      const masked = maskCustomerData([customer]);

      expect(masked[0].industry).toBe('Technology');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Masking] Audit trail:',
        expect.objectContaining({
          emailsRemoved: 1,
          namesRemoved: 1,
          recordsMasked: 1,
        })
      );
    });

    it('should bucket revenue correctly', () => {
      const customers = [
        createScoredCustomer({
          hubspot: {
            companyId: 'test-1',
            name: 'Small',
            industry: 'Tech',
            employeeCount: 5,
            region: 'US',
            totalRevenue: 5000,
            createdAt: '2024-01-01',
            properties: {},
          },
        }),
        createScoredCustomer({
          hubspot: {
            companyId: 'test-2',
            name: 'Medium',
            industry: 'Tech',
            employeeCount: 15,
            region: 'US',
            totalRevenue: 30000,
            createdAt: '2024-01-01',
            properties: {},
          },
        }),
        createScoredCustomer({
          hubspot: {
            companyId: 'test-3',
            name: 'Large',
            industry: 'Tech',
            employeeCount: 50,
            region: 'US',
            totalRevenue: 75000,
            createdAt: '2024-01-01',
            properties: {},
          },
        }),
        createScoredCustomer({
          hubspot: {
            companyId: 'test-4',
            name: 'Enterprise',
            industry: 'Tech',
            employeeCount: 200,
            region: 'US',
            totalRevenue: 250000,
            createdAt: '2024-01-01',
            properties: {},
          },
        }),
      ];

      const masked = maskCustomerData(customers);

      expect(masked[0].ltvBucket).toBe('<\');
      expect(masked[1].ltvBucket).toBe('\-\');
      expect(masked[2].ltvBucket).toBe('\-\');
      expect(masked[3].ltvBucket).toBe('>\');
    });

    it('should preserve required fields', () => {
      const customer = createScoredCustomer();
      const masked = maskCustomerData([customer]);

      expect(masked[0]).toHaveProperty('companyId');
      expect(masked[0]).toHaveProperty('industry');
      expect(masked[0]).toHaveProperty('employeeCount');
      expect(masked[0]).toHaveProperty('region');
      expect(masked[0]).toHaveProperty('ltvBucket');
      expect(masked[0]).toHaveProperty('engagementBucket');
      expect(masked[0]).toHaveProperty('retentionBucket');
      expect(masked[0]).toHaveProperty('idealCustomerScore');
    });

    it('should log audit metrics', () => {
      const customers = [createScoredCustomer(), createScoredCustomer()];
      maskCustomerData(customers);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Masking] Audit trail:',
        expect.objectContaining({
          namesRemoved: 2,
          recordsMasked: 2,
        })
      );
    });
  });

  describe('validateNoPII', () => {
    it('should pass validation when no PII is present', () => {
      const maskedCustomers: MaskedCustomer[] = [
        {
          companyId: 'test-1',
          industry: 'Technology',
          employeeCount: 50,
          region: 'North America',
          ltvBucket: '\-\',
          engagementBucket: 'High',
          retentionBucket: 'High',
          idealCustomerScore: 85,
        },
      ];

      expect(() => validateNoPII(maskedCustomers)).not.toThrow();
      expect(validateNoPII(maskedCustomers)).toBe(true);
    });

    it('should detect email addresses in masked data', () => {
      const maskedCustomers: MaskedCustomer[] = [
        {
          companyId: 'test-1',
          industry: 'contact@example.com',
          employeeCount: 50,
          region: 'North America',
          ltvBucket: '\-\',
          engagementBucket: 'High',
          retentionBucket: 'High',
          idealCustomerScore: 85,
        },
      ];

      expect(() => validateNoPII(maskedCustomers)).toThrow(
        'PII validation failed: Potential PII detected in masked data'
      );
    });

    it('should detect phone numbers in masked data', () => {
      const maskedCustomers: MaskedCustomer[] = [
        {
          companyId: 'test-1',
          industry: 'Technology',
          employeeCount: 50,
          region: 'Call 555-123-4567',
          ltvBucket: '\-\',
          engagementBucket: 'High',
          retentionBucket: 'High',
          idealCustomerScore: 85,
        },
      ];

      expect(() => validateNoPII(maskedCustomers)).toThrow();
    });
  });
});
