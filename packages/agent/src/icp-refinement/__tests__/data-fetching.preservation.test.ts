/**
 * Preservation Property Tests for Data Fetching Layer
 * 
 * These tests capture the CURRENT behavior of the data-fetching module
 * to ensure that vault integration preserves all existing functionality.
 * 
 * Tests run on UNFIXED code with mocked vault returning same values as environment variables.
 * Expected outcome: All tests PASS (confirms baseline behavior to preserve).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchHubSpotCompanies,
  fetchMixpanelCohorts,
  fetchStripeCustomers,
  fetchAllCustomerData,
  calculateDataCompleteness,
} from '../data-fetching.js';
import type { HubSpotCompany, MixpanelCohort, StripeCustomer } from '../types.js';

// Mock AWS SDK Lambda client
vi.mock('@aws-sdk/client-lambda', () => {
  return {
    LambdaClient: class MockLambdaClient {
      async send(command: any) {
        const payload = JSON.parse(command.input.Payload);
        const serviceName = payload.serviceName;
        
        if (serviceName === 'hubspot') {
          return {
            Payload: new TextEncoder().encode(JSON.stringify({
              service_name: 'hubspot',
              credential_type: 'oauth',
              data: {
                access_token: 'test-hubspot-key',
                refresh_token: 'test-refresh',
                token_expiry: new Date(Date.now() + 3600000).toISOString(),
              },
            })),
          };
        } else if (serviceName === 'mixpanel') {
          return {
            Payload: new TextEncoder().encode(JSON.stringify({
              service_name: 'mixpanel',
              credential_type: 'service_account',
              data: {
                username: 'test-mixpanel-key',
                secret: 'test-mixpanel-secret',
              },
            })),
          };
        } else if (serviceName === 'stripe') {
          return {
            Payload: new TextEncoder().encode(JSON.stringify({
              service_name: 'stripe',
              credential_type: 'api_key',
              data: {
                api_key: 'test-stripe-key',
              },
            })),
          };
        }
      }
    },
    InvokeCommand: class MockInvokeCommand {
      input: any;
      constructor(input: any) {
        this.input = input;
      }
    },
  };
});

// Mock global fetch
global.fetch = vi.fn();

describe('Data Fetching Preservation Properties', () => {
  const testUserId = 'test-user-123';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AWS_REGION = 'us-east-1';
    process.env.CREDENTIAL_RETRIEVAL_LAMBDA_NAME = 'credential-retrieval';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Property 2.1: HubSpot Pagination Preservation', () => {
    it('should preserve pagination logic with multiple batches', async () => {
      // Mock paginated responses
      const mockPage1 = {
        results: Array.from({ length: 100 }, (_, i) => ({
          id: `company-${i}`,
          properties: {
            name: `Company ${i}`,
            industry: 'Technology',
            numberofemployees: '50',
            state: 'CA',
            total_revenue: '100000',
            createdate: '2024-01-01T00:00:00Z',
          },
        })),
        paging: { next: { after: 'cursor1' } },
      };

      const mockPage2 = {
        results: Array.from({ length: 50 }, (_, i) => ({
          id: `company-${i + 100}`,
          properties: {
            name: `Company ${i + 100}`,
            industry: 'Finance',
            numberofemployees: '100',
            state: 'NY',
            total_revenue: '200000',
            createdate: '2024-01-02T00:00:00Z',
          },
        })),
        paging: null,
      };

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockPage1,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockPage2,
        });

      const companies = await fetchHubSpotCompanies(testUserId, 150);

      // Verify pagination behavior
      expect(companies).toHaveLength(150);
      expect(companies[0].companyId).toBe('company-0');
      expect(companies[99].companyId).toBe('company-99');
      expect(companies[100].companyId).toBe('company-100');
      expect(companies[149].companyId).toBe('company-149');

      // Verify API was called with correct pagination parameters
      expect(global.fetch).toHaveBeenCalledTimes(2);
      const firstCall = (global.fetch as any).mock.calls[0][0];
      const secondCall = (global.fetch as any).mock.calls[1][0];
      
      expect(firstCall).toContain('limit=100');
      expect(firstCall).not.toContain('after=');
      expect(secondCall).toContain('limit=50');
      expect(secondCall).toContain('after=cursor1');
    });

    it('should preserve batch size of 100 for HubSpot', async () => {
      const mockResponse = {
        results: Array.from({ length: 100 }, (_, i) => ({
          id: `company-${i}`,
          properties: {
            name: `Company ${i}`,
            industry: 'Tech',
            numberofemployees: '10',
            state: 'CA',
            total_revenue: '10000',
            createdate: '2024-01-01T00:00:00Z',
          },
        })),
        paging: { next: { after: 'cursor1' } },
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await fetchHubSpotCompanies(testUserId, 250);

      // Verify batch size is 100
      const firstCall = (global.fetch as any).mock.calls[0][0];
      expect(firstCall).toContain('limit=100');
    });
  });

  describe('Property 2.2: Mixpanel Batch Processing Preservation', () => {
    it('should preserve batch size of 50 for Mixpanel', async () => {
      const companyIds = Array.from({ length: 120 }, (_, i) => `company-${i}`);

      const mockEventResponse = {
        data: { values: { 'Aha! Moment': { '2024-01-01': 5 } } },
      };

      const mockRetentionResponse = {
        data: { '2024-01-01': { counts: [100, 80], first: 100 } },
      };

      (global.fetch as any)
        .mockResolvedValueOnce({ ok: true, json: async () => mockEventResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => mockRetentionResponse });

      // Mock responses for all companies (2 API calls per company)
      for (let i = 0; i < 120; i++) {
        (global.fetch as any)
          .mockResolvedValueOnce({ ok: true, json: async () => mockEventResponse })
          .mockResolvedValueOnce({ ok: true, json: async () => mockRetentionResponse });
      }

      const cohorts = await fetchMixpanelCohorts(companyIds);

      // Verify batch processing: 120 companies / 50 per batch = 3 batches
      expect(cohorts).toHaveLength(120);
      
      // Each company makes 2 API calls (event count + retention)
      // 120 companies * 2 calls = 240 total calls
      expect(global.fetch).toHaveBeenCalledTimes(240);
    });

    it('should preserve 500ms rate limiting between Mixpanel batches', async () => {
      const companyIds = Array.from({ length: 60 }, (_, i) => `company-${i}`);

      const mockEventResponse = {
        data: { values: { 'Aha! Moment': {} } },
      };

      const mockRetentionResponse = {
        data: {},
      };

      // Mock responses for all companies
      for (let i = 0; i < 60; i++) {
        (global.fetch as any)
          .mockResolvedValueOnce({ ok: true, json: async () => mockEventResponse })
          .mockResolvedValueOnce({ ok: true, json: async () => mockRetentionResponse });
      }

      const startTime = Date.now();
      await fetchMixpanelCohorts(companyIds);
      const duration = Date.now() - startTime;

      // 60 companies / 50 per batch = 2 batches
      // Should have at least one 500ms delay between batches
      expect(duration).toBeGreaterThanOrEqual(400); // Allow some margin
    });
  });

  describe('Property 2.3: Stripe Rate Limiting Preservation', () => {
    it('should preserve 1000ms rate limiting between Stripe batches', async () => {
      const companyIds = Array.from({ length: 110 }, (_, i) => `company-${i}`);

      const mockSearchResponse = {
        data: [{ id: 'cus_123' }],
      };

      const mockSubscriptionsResponse = {
        data: [],
      };

      const mockInvoicesResponse = {
        data: [],
      };

      // Mock responses for all companies (3 API calls per company)
      for (let i = 0; i < 110; i++) {
        (global.fetch as any)
          .mockResolvedValueOnce({ ok: true, json: async () => mockSearchResponse })
          .mockResolvedValueOnce({ ok: true, json: async () => mockSubscriptionsResponse })
          .mockResolvedValueOnce({ ok: true, json: async () => mockInvoicesResponse });
      }

      const startTime = Date.now();
      await fetchStripeCustomers(companyIds);
      const duration = Date.now() - startTime;

      // 110 companies / 100 per batch = 2 batches
      // Should have at least one 1000ms delay between batches
      expect(duration).toBeGreaterThanOrEqual(900); // Allow some margin
    });

    it('should preserve batch size of 100 for Stripe', async () => {
      const companyIds = Array.from({ length: 150 }, (_, i) => `company-${i}`);

      const mockSearchResponse = {
        data: [{ id: 'cus_123' }],
      };

      const mockSubscriptionsResponse = {
        data: [],
      };

      const mockInvoicesResponse = {
        data: [],
      };

      // Mock responses for all companies
      for (let i = 0; i < 150; i++) {
        (global.fetch as any)
          .mockResolvedValueOnce({ ok: true, json: async () => mockSearchResponse })
          .mockResolvedValueOnce({ ok: true, json: async () => mockSubscriptionsResponse })
          .mockResolvedValueOnce({ ok: true, json: async () => mockInvoicesResponse });
      }

      await fetchStripeCustomers(companyIds);

      // 150 companies / 100 per batch = 2 batches
      // Each company makes 3 API calls
      expect(global.fetch).toHaveBeenCalledTimes(450);
    });
  });

  describe('Property 2.4: Retry Logic Preservation', () => {
    it('should preserve exponential backoff retry for HubSpot', async () => {
      const mockResponse = {
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
      };

      // Fail twice, then succeed
      (global.fetch as any)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

      const startTime = Date.now();
      const companies = await fetchHubSpotCompanies(testUserId, 10);
      const duration = Date.now() - startTime;

      // Verify retry happened
      expect(companies).toHaveLength(1);
      expect(global.fetch).toHaveBeenCalledTimes(3);

      // Verify exponential backoff: 2^1 * 1000 + 2^2 * 1000 = 6000ms
      expect(duration).toBeGreaterThanOrEqual(5800); // Allow some margin
    }, 10000);

    it('should preserve max retry attempts of 3', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      await expect(fetchHubSpotCompanies(testUserId, 10)).rejects.toThrow('failed after 3 attempts');
      expect(global.fetch).toHaveBeenCalledTimes(3);
    }, 10000);
  });

  describe('Property 2.5: Data Transformation Preservation', () => {
    it('should preserve HubSpot data transformation', async () => {
      const mockResponse = {
        results: [
          {
            id: 'hubspot-123',
            properties: {
              name: 'Acme Corp',
              industry: 'Technology',
              numberofemployees: '250',
              state: 'California',
              total_revenue: '5000000',
              createdate: '2023-06-15T10:30:00Z',
              custom_field: 'custom_value',
            },
          },
        ],
        paging: null,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const companies = await fetchHubSpotCompanies(testUserId, 10);

      // Verify exact transformation
      expect(companies[0]).toEqual({
        companyId: 'hubspot-123',
        name: 'Acme Corp',
        industry: 'Technology',
        employeeCount: 250,
        region: 'California',
        totalRevenue: 5000000,
        createdAt: '2023-06-15T10:30:00Z',
        properties: {
          name: 'Acme Corp',
          industry: 'Technology',
          numberofemployees: '250',
          state: 'California',
          total_revenue: '5000000',
          createdate: '2023-06-15T10:30:00Z',
          custom_field: 'custom_value',
        },
      });
    });

    it('should preserve Mixpanel data transformation', async () => {
      const mockEventResponse = {
        data: {
          values: {
            'Aha! Moment': {
              '2024-01-01': 10,
              '2024-01-02': 15,
              '2024-01-03': 8,
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
          '2024-01-02': {
            counts: [50, 45, 42],
            first: 50,
          },
        },
      };

      (global.fetch as any)
        .mockResolvedValueOnce({ ok: true, json: async () => mockEventResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => mockRetentionResponse });

      const cohorts = await fetchMixpanelCohorts(testUserId, ['company-123']);

      // Verify exact transformation
      expect(cohorts[0]).toMatchObject({
        companyId: 'company-123',
        ahaEventCount: 33, // 10 + 15 + 8
        retentionRate: expect.any(Number),
        lastActiveDate: expect.any(String),
        engagementScore: 33,
      });
    });

    it('should preserve Stripe data transformation with MRR calculation', async () => {
      const mockSearchResponse = {
        data: [
          {
            id: 'cus_stripe123',
            metadata: { company_id: 'company-456' },
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
                    unit_amount: 9900, // $99.00 in cents
                    recurring: { interval: 'month' },
                  },
                },
              ],
            },
          },
          {
            status: 'active',
            items: {
              data: [
                {
                  price: {
                    unit_amount: 120000, // $1200.00 in cents
                    recurring: { interval: 'year' },
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
        .mockResolvedValueOnce({ ok: true, json: async () => mockSearchResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => mockSubscriptionsResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => mockInvoicesResponse });

      const customers = await fetchStripeCustomers(testUserId, ['company-456']);

      // Verify exact transformation and MRR calculation
      // Monthly: $99, Annual: $1200/12 = $100, Total MRR: $199
      expect(customers[0]).toEqual({
        customerId: 'cus_stripe123',
        companyId: 'company-456',
        hasChurnSignal: false,
        mrr: 199,
        subscriptionStatus: 'active',
      });
    });
  });

  describe('Property 2.6: Error Handling Preservation', () => {
    it('should preserve graceful degradation for Mixpanel failures', async () => {
      const companyIds = ['company-1', 'company-2', 'company-3'];

      // Mock failure for all Mixpanel calls
      (global.fetch as any).mockRejectedValue(new Error('Mixpanel API error'));

      const cohorts = await fetchMixpanelCohorts(companyIds);

      // Verify graceful degradation with null values
      expect(cohorts).toHaveLength(3);
      expect(cohorts[0]).toBeNull();
      expect(cohorts[1]).toBeNull();
      expect(cohorts[2]).toBeNull();
    });

    it('should preserve graceful degradation for Stripe failures', async () => {
      const companyIds = ['company-1', 'company-2'];

      // Mock failure for all Stripe calls
      (global.fetch as any).mockRejectedValue(new Error('Stripe API error'));

      const customers = await fetchStripeCustomers(companyIds);

      // Verify graceful degradation with null values
      expect(customers).toHaveLength(2);
      expect(customers[0]).toBeNull();
      expect(customers[1]).toBeNull();
    });

    it('should preserve critical failure for HubSpot in fetchAllCustomerData', async () => {
      (global.fetch as any).mockRejectedValue(new Error('HubSpot error'));

      await expect(fetchAllCustomerData(10)).rejects.toThrow('Cannot proceed without HubSpot data');
    }, 10000);
  });

  describe('Property 2.7: fetchAllCustomerData Orchestration Preservation', () => {
    it('should preserve orchestration logic and data completeness calculation', async () => {
      const mockHubSpotResponse = {
        results: [
          {
            id: '1',
            properties: {
              name: 'Company 1',
              industry: 'Tech',
              numberofemployees: '50',
              state: 'CA',
              total_revenue: '100000',
              createdate: '2024-01-01T00:00:00Z',
            },
          },
          {
            id: '2',
            properties: {
              name: 'Company 2',
              industry: 'Finance',
              numberofemployees: '100',
              state: 'NY',
              total_revenue: '200000',
              createdate: '2024-01-02T00:00:00Z',
            },
          },
        ],
        paging: null,
      };

      const mockEventResponse = {
        data: { values: { 'Aha! Moment': { '2024-01-01': 5 } } },
      };

      const mockRetentionResponse = {
        data: { '2024-01-01': { counts: [100, 80], first: 100 } },
      };

      const mockSearchResponse = {
        data: [{ id: 'cus_123' }],
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

      // Mock HubSpot call
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockHubSpotResponse,
      });

      // Mock Mixpanel calls for company 1 (success)
      (global.fetch as any)
        .mockResolvedValueOnce({ ok: true, json: async () => mockEventResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => mockRetentionResponse });

      // Mock Mixpanel calls for company 2 (failure)
      (global.fetch as any)
        .mockRejectedValueOnce(new Error('Mixpanel error'));

      // Mock Stripe calls for company 1 (success)
      (global.fetch as any)
        .mockResolvedValueOnce({ ok: true, json: async () => mockSearchResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => mockSubscriptionsResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => mockInvoicesResponse });

      // Mock Stripe calls for company 2 (success)
      (global.fetch as any)
        .mockResolvedValueOnce({ ok: true, json: async () => mockSearchResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => mockSubscriptionsResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => mockInvoicesResponse });

      const result = await fetchAllCustomerData(testUserId, 10);

      // Verify orchestration
      expect(result.hubspotCompanies).toHaveLength(2);
      expect(result.mixpanelCohorts).toHaveLength(2);
      expect(result.stripeCustomers).toHaveLength(2);

      // Verify data completeness calculation
      expect(result.completenessMetrics).toEqual({
        totalCompanies: 2,
        hubspotAvailable: 2,
        mixpanelAvailable: 1, // One failed
        stripeAvailable: 2,
        mixpanelCompleteness: 50,
        stripeCompleteness: 100,
      });
    });
  });

  describe('Property 2.8: API Request Construction Preservation', () => {
    it('should preserve HubSpot API request properties', async () => {
      const mockResponse = {
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
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await fetchHubSpotCompanies(testUserId, 10);

      const callUrl = (global.fetch as any).mock.calls[0][0];
      
      // Verify exact properties requested (URL encoded)
      expect(callUrl).toContain('properties=name%2Cindustry%2Cnumberofemployees%2Cstate%2Ctotal_revenue%2Ccreatedate');
    });

    it('should preserve Mixpanel query parameters', async () => {
      const mockEventResponse = {
        data: { values: { 'Aha! Moment': {} } },
      };

      const mockRetentionResponse = {
        data: {},
      };

      (global.fetch as any)
        .mockResolvedValueOnce({ ok: true, json: async () => mockEventResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => mockRetentionResponse });

      await fetchMixpanelCohorts(testUserId, ['company-123']);

      const eventCallUrl = (global.fetch as any).mock.calls[0][0];
      const retentionCallUrl = (global.fetch as any).mock.calls[1][0];

      // Verify event query parameters (URL encoded with + for space)
      expect(eventCallUrl).toContain('event=Aha%21+Moment');
      expect(eventCallUrl).toContain('type=general');
      expect(eventCallUrl).toContain('unit=day');
      expect(eventCallUrl).toContain('where=properties%5B%22company_id%22%5D%3D%3D%22company-123%22');

      // Verify retention query parameters
      expect(retentionCallUrl).toContain('retention_type=birth');
      expect(retentionCallUrl).toContain('unit=day');
      expect(retentionCallUrl).toContain('interval=1');
      expect(retentionCallUrl).toContain('interval_count=30');
    });

    it('should preserve Stripe search query format', async () => {
      const mockSearchResponse = {
        data: [{ id: 'cus_123' }],
      };

      const mockSubscriptionsResponse = {
        data: [],
      };

      const mockInvoicesResponse = {
        data: [],
      };

      (global.fetch as any)
        .mockResolvedValueOnce({ ok: true, json: async () => mockSearchResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => mockSubscriptionsResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => mockInvoicesResponse });

      await fetchStripeCustomers(testUserId, ['company-456']);

      const searchCallUrl = (global.fetch as any).mock.calls[0][0];

      // Verify search query format (URL encoded with %27 for single quotes)
      expect(searchCallUrl).toContain("query=metadata%5B%27company_id%27%5D%3A%27company-456%27");
    });
  });
});

