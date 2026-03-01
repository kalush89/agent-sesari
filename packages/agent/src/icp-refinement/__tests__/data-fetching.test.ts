/**
 * Unit tests for data fetching layer
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchHubSpotCompanies,
  fetchMixpanelCohorts,
  fetchStripeCustomers,
  fetchAllCustomerData,
  calculateDataCompleteness,
} from '../data-fetching.js';

// Mock global fetch
global.fetch = vi.fn();

describe('Data Fetching Layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.HUBSPOT_API_KEY = 'test-hubspot-key';
    process.env.MIXPANEL_API_KEY = 'test-mixpanel-key';
    process.env.STRIPE_API_KEY = 'test-stripe-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchHubSpotCompanies', () => {
    it('should fetch companies successfully', async () => {
      const mockResponse = {
        results: [
          {
            id: '123',
            properties: {
              name: 'Acme Corp',
              industry: 'Technology',
              numberofemployees: '50',
              state: 'CA',
              total_revenue: '100000',
              createdate: '2024-01-01T00:00:00Z',
            },
          },
        ],
        paging: null,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const companies = await fetchHubSpotCompanies(10);

      expect(companies).toHaveLength(1);
      expect(companies[0]).toMatchObject({
        companyId: '123',
        name: 'Acme Corp',
        industry: 'Technology',
        employeeCount: 50,
        region: 'CA',
        totalRevenue: 100000,
      });
    });

    it('should handle pagination', async () => {
      const mockResponse1 = {
        results: [
          {
            id: '1',
            properties: {
              name: 'Company 1',
              industry: 'Tech',
              numberofemployees: '10',
              state: 'CA',
              total_revenue: '50000',
              createdate: '2024-01-01T00:00:00Z',
            },
          },
        ],
        paging: { next: { after: 'cursor1' } },
      };

      const mockResponse2 = {
        results: [
          {
            id: '2',
            properties: {
              name: 'Company 2',
              industry: 'Finance',
              numberofemployees: '20',
              state: 'NY',
              total_revenue: '75000',
              createdate: '2024-01-02T00:00:00Z',
            },
          },
        ],
        paging: null,
      };

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse1,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse2,
        });

      const companies = await fetchHubSpotCompanies(200);

      expect(companies).toHaveLength(2);
      expect(companies[0].companyId).toBe('1');
      expect(companies[1].companyId).toBe('2');
    });

    it('should retry on API failure', async () => {
      (global.fetch as any)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: [
              {
                id: '123',
                properties: {
                  name: 'Test',
                  industry: 'Tech',
                  numberofemployees: '10',
                  state: 'CA',
                  total_revenue: '10000',
                  createdate: '2024-01-01T00:00:00Z',
                },
              },
            ],
            paging: null,
          }),
        });

      const companies = await fetchHubSpotCompanies(10);

      expect(companies).toHaveLength(1);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retries', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      await expect(fetchHubSpotCompanies(10)).rejects.toThrow('HubSpot API call failed after 3 attempts');
    }, 10000); // 10 second timeout for retry delays

    it('should handle missing environment variable', async () => {
      delete process.env.HUBSPOT_API_KEY;

      await expect(fetchHubSpotCompanies(10)).rejects.toThrow('HUBSPOT_API_KEY environment variable is required');
    });
  });

  describe('fetchMixpanelCohorts', () => {
    it('should fetch cohorts successfully', async () => {
      const mockEventResponse = {
        data: {
          values: {
            'Aha! Moment': {
              '2024-01-01': 5,
              '2024-01-02': 3,
            },
          },
        },
      };

      const mockRetentionResponse = {
        data: {
          '2024-01-01': {
            counts: [100, 90, 85, 80],
            first: 100,
          },
        },
      };

      // Mock both API calls for each company (event count + retention)
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockEventResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockRetentionResponse,
        });

      const cohorts = await fetchMixpanelCohorts(['company1']);

      expect(cohorts).toHaveLength(1);
      expect(cohorts[0]).toMatchObject({
        companyId: 'company1',
        ahaEventCount: 8,
        retentionRate: 80,
      });
    });

    it('should handle missing data gracefully', async () => {
      (global.fetch as any).mockRejectedValue(new Error('API error'));

      const cohorts = await fetchMixpanelCohorts(['company1', 'company2']);

      expect(cohorts).toHaveLength(2);
      expect(cohorts[0]).toBeNull();
      expect(cohorts[1]).toBeNull();
    });

    it('should process batches with delays', async () => {
      const companyIds = Array.from({ length: 60 }, (_, i) => `company${i}`);

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ data: { values: { 'Aha! Moment': {} } } }),
      });

      const startTime = Date.now();
      await fetchMixpanelCohorts(companyIds);
      const duration = Date.now() - startTime;

      // Should have at least one 500ms delay between batches
      expect(duration).toBeGreaterThanOrEqual(400);
    });
  });

  describe('fetchStripeCustomers', () => {
    it('should fetch customers successfully', async () => {
      const mockSearchResponse = {
        data: [
          {
            id: 'cus_123',
            metadata: { company_id: 'company1' },
          },
        ],
      };

      const mockSubscriptionsResponse = {
        data: [
          {
            status: 'active',
            items: {
              data: [
                {
                  price: {
                    unit_amount: 5000,
                    recurring: { interval: 'month' },
                  },
                },
              ],
            },
          },
        ],
      };

      const mockInvoicesResponse = {
        data: [],
      };

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockSearchResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockSubscriptionsResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockInvoicesResponse,
        });

      const customers = await fetchStripeCustomers(['company1']);

      expect(customers).toHaveLength(1);
      expect(customers[0]).toMatchObject({
        customerId: 'cus_123',
        companyId: 'company1',
        hasChurnSignal: false,
        mrr: 50,
        subscriptionStatus: 'active',
      });
    });

    it('should detect churn signals from cancelled subscriptions', async () => {
      const mockSearchResponse = {
        data: [{ id: 'cus_123' }],
      };

      const mockSubscriptionsResponse = {
        data: [
          {
            status: 'canceled',
            items: { data: [] },
          },
        ],
      };

      const mockInvoicesResponse = {
        data: [],
      };

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockSearchResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockSubscriptionsResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockInvoicesResponse,
        });

      const customers = await fetchStripeCustomers(['company1']);

      expect(customers[0].hasChurnSignal).toBe(true);
    });

    it('should handle missing data gracefully', async () => {
      (global.fetch as any).mockRejectedValue(new Error('API error'));

      const customers = await fetchStripeCustomers(['company1', 'company2']);

      expect(customers).toHaveLength(2);
      expect(customers[0]).toBeNull();
      expect(customers[1]).toBeNull();
    });
  });

  describe('calculateDataCompleteness', () => {
    it('should calculate completeness metrics correctly', () => {
      const hubspotCompanies = [
        { companyId: '1' } as any,
        { companyId: '2' } as any,
        { companyId: '3' } as any,
        { companyId: '4' } as any,
      ];

      const mixpanelCohorts = [
        { companyId: '1' } as any,
        null,
        { companyId: '3' } as any,
        null,
      ];

      const stripeCustomers = [
        { companyId: '1' } as any,
        { companyId: '2' } as any,
        { companyId: '3' } as any,
        null,
      ];

      const metrics = calculateDataCompleteness(hubspotCompanies, mixpanelCohorts, stripeCustomers);

      expect(metrics).toMatchObject({
        totalCompanies: 4,
        hubspotAvailable: 4,
        mixpanelAvailable: 2,
        stripeAvailable: 3,
        mixpanelCompleteness: 50,
        stripeCompleteness: 75,
      });
    });
  });

  describe('fetchAllCustomerData', () => {
    it('should fetch all data successfully', async () => {
      const mockHubSpotResponse = {
        results: [
          {
            id: '1',
            properties: {
              name: 'Company 1',
              industry: 'Tech',
              numberofemployees: '10',
              state: 'CA',
              total_revenue: '10000',
              createdate: '2024-01-01T00:00:00Z',
            },
          },
        ],
        paging: null,
      };

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockHubSpotResponse,
        })
        .mockResolvedValue({
          ok: true,
          json: async () => ({ data: {} }),
        });

      const result = await fetchAllCustomerData(10);

      expect(result.hubspotCompanies).toHaveLength(1);
      expect(result.completenessMetrics.totalCompanies).toBe(1);
    });

    it('should throw error if HubSpot fails', async () => {
      (global.fetch as any).mockRejectedValue(new Error('HubSpot error'));

      await expect(fetchAllCustomerData(10)).rejects.toThrow('Cannot proceed without HubSpot data');
    }, 10000); // 10 second timeout for retry delays

    it('should continue if Mixpanel fails', async () => {
      const mockHubSpotResponse = {
        results: [
          {
            id: '1',
            properties: {
              name: 'Company 1',
              industry: 'Tech',
              numberofemployees: '10',
              state: 'CA',
              total_revenue: '10000',
              createdate: '2024-01-01T00:00:00Z',
            },
          },
        ],
        paging: null,
      };

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockHubSpotResponse,
        })
        .mockRejectedValueOnce(new Error('Mixpanel error'))
        .mockResolvedValue({
          ok: true,
          json: async () => ({ data: [] }),
        });

      const result = await fetchAllCustomerData(10);

      expect(result.hubspotCompanies).toHaveLength(1);
      expect(result.mixpanelCohorts[0]).toBeNull();
      expect(result.completenessMetrics.mixpanelCompleteness).toBe(0);
    });
  });
});
