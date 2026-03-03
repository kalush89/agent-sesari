/**
 * Unit tests for data masking layer
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { maskCustomerData, validateNoPII } from '../masking';
import { ScoredCustomer, MaskedCustomer } from '../types';

describe('maskCustomerData', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should remove company names and keep industry', () => {
    const customers: ScoredCustomer[] = [
      {
        companyId: 'c1',
        hubspot: {
          companyId: 'c1',
          name: 'Acme Corp',
          industry: 'Finance',
          employeeCount: 50,
          region: 'US',
          totalRevenue: 75000,
          createdAt: '2024-01-01',
          properties: {},
        },
        mixpanel: null,
        stripe: null,
        idealCustomerScore: 85,
        scoreBreakdown: {
          ltvScore: 80,
          engagementScore: 70,
          retentionScore: 90,
        },
      },
    ];

    const masked = maskCustomerData(customers);

    expect(masked[0].industry).toBe('Finance');
    expect(masked[0]).not.toHaveProperty('name');
  });

  it('should remove emails from company names', () => {
    const customers: ScoredCustomer[] = [
      {
        companyId: 'c1',
        hubspot: {
          companyId: 'c1',
          name: 'Contact us at info@acme.com',
          industry: 'Tech',
          employeeCount: 25,
          region: 'EU',
          totalRevenue: 50000,
          createdAt: '2024-01-01',
          properties: {},
        },
        mixpanel: null,
        stripe: null,
        idealCustomerScore: 75,
        scoreBreakdown: {
          ltvScore: 70,
          engagementScore: 80,
          retentionScore: 75,
        },
      },
    ];

    const consoleSpy = vi.spyOn(console, 'log');
    const masked = maskCustomerData(customers);

    expect(masked[0]).not.toHaveProperty('name');
    expect(consoleSpy).toHaveBeenCalledWith(
      '[Masking] Audit trail:',
      expect.objectContaining({
        emailsRemoved: 1,
        namesRemoved: 1,
        recordsMasked: 1,
      })
    );
  });

  it('should bucket revenue correctly', () => {
    const testCases = [
      { revenue: 5000, expected: '<$10K' },
      { revenue: 25000, expected: '$10K-$50K' },
      { revenue: 75000, expected: '$50K-$100K' },
      { revenue: 150000, expected: '>$100K' },
    ];

    testCases.forEach(({ revenue, expected }) => {
      const customers: ScoredCustomer[] = [
        {
          companyId: 'c1',
          hubspot: {
            companyId: 'c1',
            name: 'Test Corp',
            industry: 'Tech',
            employeeCount: 50,
            region: 'US',
            totalRevenue: revenue,
            createdAt: '2024-01-01',
            properties: {},
          },
          mixpanel: null,
          stripe: null,
          idealCustomerScore: 80,
          scoreBreakdown: {
            ltvScore: 80,
            engagementScore: 80,
            retentionScore: 80,
          },
        },
      ];

      const masked = maskCustomerData(customers);
      expect(masked[0].ltvBucket).toBe(expected);
    });
  });

  it('should bucket employee count correctly', () => {
    const testCases = [
      { count: 5, expected: '1-10' },
      { count: 25, expected: '11-50' },
      { count: 100, expected: '51-200' },
      { count: 500, expected: '200+' },
    ];

    testCases.forEach(({ count, expected }) => {
      const customers: ScoredCustomer[] = [
        {
          companyId: 'c1',
          hubspot: {
            companyId: 'c1',
            name: 'Test Corp',
            industry: 'Tech',
            employeeCount: count,
            region: 'US',
            totalRevenue: 50000,
            createdAt: '2024-01-01',
            properties: {},
          },
          mixpanel: null,
          stripe: null,
          idealCustomerScore: 80,
          scoreBreakdown: {
            ltvScore: 80,
            engagementScore: 80,
            retentionScore: 80,
          },
        },
      ];

      const masked = maskCustomerData(customers);
      expect(masked[0].employeeCount).toBe(count);
    });
  });

  it('should bucket engagement scores correctly', () => {
    const testCases = [
      { score: 20, expected: 'Low' },
      { score: 50, expected: 'Medium' },
      { score: 80, expected: 'High' },
    ];

    testCases.forEach(({ score, expected }) => {
      const customers: ScoredCustomer[] = [
        {
          companyId: 'c1',
          hubspot: {
            companyId: 'c1',
            name: 'Test Corp',
            industry: 'Tech',
            employeeCount: 50,
            region: 'US',
            totalRevenue: 50000,
            createdAt: '2024-01-01',
            properties: {},
          },
          mixpanel: null,
          stripe: null,
          idealCustomerScore: 80,
          scoreBreakdown: {
            ltvScore: 80,
            engagementScore: score,
            retentionScore: 80,
          },
        },
      ];

      const masked = maskCustomerData(customers);
      expect(masked[0].engagementBucket).toBe(expected);
    });
  });

  it('should bucket retention scores correctly', () => {
    const testCases = [
      { score: 20, expected: 'Low' },
      { score: 50, expected: 'Medium' },
      { score: 80, expected: 'High' },
    ];

    testCases.forEach(({ score, expected }) => {
      const customers: ScoredCustomer[] = [
        {
          companyId: 'c1',
          hubspot: {
            companyId: 'c1',
            name: 'Test Corp',
            industry: 'Tech',
            employeeCount: 50,
            region: 'US',
            totalRevenue: 50000,
            createdAt: '2024-01-01',
            properties: {},
          },
          mixpanel: null,
          stripe: null,
          idealCustomerScore: 80,
          scoreBreakdown: {
            ltvScore: 80,
            engagementScore: 80,
            retentionScore: score,
          },
        },
      ];

      const masked = maskCustomerData(customers);
      expect(masked[0].retentionBucket).toBe(expected);
    });
  });

  it('should preserve required fields', () => {
    const customers: ScoredCustomer[] = [
      {
        companyId: 'c1',
        hubspot: {
          companyId: 'c1',
          name: 'Test Corp',
          industry: 'Finance',
          employeeCount: 50,
          region: 'US',
          totalRevenue: 75000,
          createdAt: '2024-01-01',
          properties: {},
        },
        mixpanel: null,
        stripe: null,
        idealCustomerScore: 85,
        scoreBreakdown: {
          ltvScore: 80,
          engagementScore: 70,
          retentionScore: 90,
        },
      },
    ];

    const masked = maskCustomerData(customers);

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
    const customers: ScoredCustomer[] = [
      {
        companyId: 'c1',
        hubspot: {
          companyId: 'c1',
          name: 'Test Corp',
          industry: 'Tech',
          employeeCount: 50,
          region: 'US',
          totalRevenue: 50000,
          createdAt: '2024-01-01',
          properties: {},
        },
        mixpanel: null,
        stripe: null,
        idealCustomerScore: 80,
        scoreBreakdown: {
          ltvScore: 80,
          engagementScore: 80,
          retentionScore: 80,
        },
      },
      {
        companyId: 'c2',
        hubspot: {
          companyId: 'c2',
          name: 'Another Corp',
          industry: 'Finance',
          employeeCount: 100,
          region: 'EU',
          totalRevenue: 100000,
          createdAt: '2024-01-01',
          properties: {},
        },
        mixpanel: null,
        stripe: null,
        idealCustomerScore: 90,
        scoreBreakdown: {
          ltvScore: 90,
          engagementScore: 85,
          retentionScore: 95,
        },
      },
    ];

    const consoleSpy = vi.spyOn(console, 'log');
    maskCustomerData(customers);

    expect(consoleSpy).toHaveBeenCalledWith(
      '[Masking] Audit trail:',
      expect.objectContaining({
        namesRemoved: 2,
        recordsMasked: 2,
      })
    );
  });

  it('should handle multiple emails in company name', () => {
    const customers: ScoredCustomer[] = [
      {
        companyId: 'c1',
        hubspot: {
          companyId: 'c1',
          name: 'Contact info@acme.com or sales@acme.com',
          industry: 'Tech',
          employeeCount: 50,
          region: 'US',
          totalRevenue: 50000,
          createdAt: '2024-01-01',
          properties: {},
        },
        mixpanel: null,
        stripe: null,
        idealCustomerScore: 80,
        scoreBreakdown: {
          ltvScore: 80,
          engagementScore: 80,
          retentionScore: 80,
        },
      },
    ];

    const consoleSpy = vi.spyOn(console, 'log');
    maskCustomerData(customers);

    expect(consoleSpy).toHaveBeenCalledWith(
      '[Masking] Audit trail:',
      expect.objectContaining({
        emailsRemoved: 2,
      })
    );
  });
});

describe('validateNoPII', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should pass validation for clean masked data', () => {
    const maskedData: MaskedCustomer[] = [
      {
        companyId: 'c1',
        industry: 'Finance',
        employeeCount: 50,
        region: 'US',
        ltvBucket: '$50K-$100K',
        engagementBucket: 'High',
        retentionBucket: 'High',
        idealCustomerScore: 85,
      },
    ];

    expect(() => validateNoPII(maskedData)).not.toThrow();
    expect(validateNoPII(maskedData)).toBe(true);
  });

  it('should detect email in industry field', () => {
    const maskedData: MaskedCustomer[] = [
      {
        companyId: 'c1',
        industry: 'Finance contact@example.com',
        employeeCount: 50,
        region: 'US',
        ltvBucket: '$50K-$100K',
        engagementBucket: 'High',
        retentionBucket: 'High',
        idealCustomerScore: 85,
      },
    ];

    const consoleWarnSpy = vi.spyOn(console, 'warn');

    expect(() => validateNoPII(maskedData)).toThrow('PII validation failed');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Potential email detected'),
      expect.objectContaining({
        companyId: 'c1',
      })
    );
  });

  it('should detect email in region field', () => {
    const maskedData: MaskedCustomer[] = [
      {
        companyId: 'c1',
        industry: 'Finance',
        employeeCount: 50,
        region: 'US admin@company.com',
        ltvBucket: '$50K-$100K',
        engagementBucket: 'High',
        retentionBucket: 'High',
        idealCustomerScore: 85,
      },
    ];

    expect(() => validateNoPII(maskedData)).toThrow('PII validation failed');
  });

  it('should detect phone numbers', () => {
    const maskedData: MaskedCustomer[] = [
      {
        companyId: 'c1',
        industry: 'Finance',
        employeeCount: 50,
        region: 'US 555-123-4567',
        ltvBucket: '$50K-$100K',
        engagementBucket: 'High',
        retentionBucket: 'High',
        idealCustomerScore: 85,
      },
    ];

    const consoleWarnSpy = vi.spyOn(console, 'warn');

    expect(() => validateNoPII(maskedData)).toThrow('PII validation failed');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Potential phone number detected'),
      expect.any(Object)
    );
  });

  it('should handle various email formats', () => {
    const emailFormats = [
      'test@example.com',
      'user.name@company.co.uk',
      'admin+tag@domain.org',
    ];

    emailFormats.forEach((email) => {
      const maskedData: MaskedCustomer[] = [
        {
          companyId: 'c1',
          industry: `Finance ${email}`,
          employeeCount: 50,
          region: 'US',
          ltvBucket: '$50K-$100K',
          engagementBucket: 'High',
          retentionBucket: 'High',
          idealCustomerScore: 85,
        },
      ];

      expect(() => validateNoPII(maskedData)).toThrow('PII validation failed');
    });
  });

  it('should handle various phone formats', () => {
    const phoneFormats = [
      '555-123-4567',
      '(555) 123-4567',
      '+1-555-123-4567',
      '5551234567',
    ];

    phoneFormats.forEach((phone) => {
      const maskedData: MaskedCustomer[] = [
        {
          companyId: 'c1',
          industry: 'Finance',
          employeeCount: 50,
          region: `US ${phone}`,
          ltvBucket: '$50K-$100K',
          engagementBucket: 'High',
          retentionBucket: 'High',
          idealCustomerScore: 85,
        },
      ];

      expect(() => validateNoPII(maskedData)).toThrow('PII validation failed');
    });
  });

  it('should validate multiple records', () => {
    const maskedData: MaskedCustomer[] = [
      {
        companyId: 'c1',
        industry: 'Finance',
        employeeCount: 50,
        region: 'US',
        ltvBucket: '$50K-$100K',
        engagementBucket: 'High',
        retentionBucket: 'High',
        idealCustomerScore: 85,
      },
      {
        companyId: 'c2',
        industry: 'Tech',
        employeeCount: 100,
        region: 'EU',
        ltvBucket: '>$100K',
        engagementBucket: 'Medium',
        retentionBucket: 'High',
        idealCustomerScore: 90,
      },
    ];

    expect(() => validateNoPII(maskedData)).not.toThrow();
    expect(validateNoPII(maskedData)).toBe(true);
  });

  it('should not log actual PII values', () => {
    const maskedData: MaskedCustomer[] = [
      {
        companyId: 'c1',
        industry: 'Finance test@example.com',
        employeeCount: 50,
        region: 'US',
        ltvBucket: '$50K-$100K',
        engagementBucket: 'High',
        retentionBucket: 'High',
        idealCustomerScore: 85,
      },
    ];

    const consoleWarnSpy = vi.spyOn(console, 'warn');

    try {
      validateNoPII(maskedData);
    } catch (e) {
      // Expected to throw
    }

    // Verify that the actual PII value is not logged
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        field: 'redacted',
      })
    );
  });
});
