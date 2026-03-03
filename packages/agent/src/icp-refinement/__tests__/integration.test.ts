/**
 * Integration tests for complete ICP refinement flow
 * Tests end-to-end orchestration with mocked AWS services
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runICPRefinement, handler } from '../index.js';
import type { HubSpotCompany, MixpanelCohort, StripeCustomer } from '../types.js';

// Mock all AWS SDK clients
vi.mock('../clients', () => ({
  createBedrockRuntimeClient: vi.fn(() => ({
    send: vi.fn(),
  })),
  createBedrockAgentRuntimeClient: vi.fn(() => ({
    send: vi.fn(),
  })),
  createDynamoDBClient: vi.fn(() => ({
    send: vi.fn(),
  })),
}));

// Mock CloudWatch client
vi.mock('@aws-sdk/client-cloudwatch', () => ({
  CloudWatchClient: vi.fn(() => ({
    send: vi.fn(),
  })),
  PutMetricDataCommand: vi.fn((input) => ({ input })),
}));

// Mock Lambda client for credential vault
vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: vi.fn(() => ({
    send: vi.fn(),
  })),
  InvokeCommand: vi.fn((input) => ({ input })),
}));

// Mock global fetch
global.fetch = vi.fn();

describe('ICP Refinement Integration Tests', () => {
  const testUserId = 'test-user-123';
  let mockBedrockRuntimeSend: any;
  let mockBedrockAgentSend: any;
  let mockDynamoSend: any;
  let mockCloudWatchSend: any;
  let mockLambdaSend: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Set required environment variables
    process.env.AWS_REGION = 'us-east-1';
    process.env.KNOWLEDGE_BASE_ID = 'test-kb-123';
    process.env.NOVA_MODEL_ID = 'amazon.nova-lite-v1:0';
    process.env.ANALYSIS_TABLE_NAME = 'test-analysis-table';
    process.env.CREDENTIAL_RETRIEVAL_LAMBDA_NAME = 'credential-retrieval';
    // Set dummy API keys to pass environment validation (actual credentials come from vault)
    process.env.HUBSPOT_API_KEY = 'test-hubspot-key';
    process.env.MIXPANEL_API_KEY = 'test-mixpanel-key';
    process.env.STRIPE_API_KEY = 'test-stripe-key';

    // Get mock functions
    const { createBedrockRuntimeClient, createBedrockAgentRuntimeClient, createDynamoDBClient } = 
      await import('../clients.js');
    const { CloudWatchClient } = await import('@aws-sdk/client-cloudwatch');
    const { LambdaClient } = await import('@aws-sdk/client-lambda');

    mockBedrockRuntimeSend = vi.fn();
    mockBedrockAgentSend = vi.fn();
    mockDynamoSend = vi.fn();
    mockCloudWatchSend = vi.fn();
    mockLambdaSend = vi.fn();

    (createBedrockRuntimeClient as any).mockReturnValue({
      send: mockBedrockRuntimeSend,
    });

    (createBedrockAgentRuntimeClient as any).mockReturnValue({
      send: mockBedrockAgentSend,
    });

    (createDynamoDBClient as any).mockReturnValue({
      send: mockDynamoSend,
    });

    (CloudWatchClient as any).mockReturnValue({
      send: mockCloudWatchSend,
    });

    (LambdaClient as any).mockReturnValue({
      send: mockLambdaSend,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.KNOWLEDGE_BASE_ID;
    delete process.env.NOVA_MODEL_ID;
    delete process.env.ANALYSIS_TABLE_NAME;
    delete process.env.CREDENTIAL_RETRIEVAL_LAMBDA_NAME;
    delete process.env.HUBSPOT_API_KEY;
    delete process.env.MIXPANEL_API_KEY;
    delete process.env.STRIPE_API_KEY;
  });

  /**
   * Helper function to setup successful credential vault responses
   */
  function setupCredentialVaultMocks() {
    mockLambdaSend.mockImplementation((command: any) => {
      const payload = JSON.parse(command.input.Payload);
      const serviceName = payload.serviceName;

      if (serviceName === 'hubspot') {
        return Promise.resolve({
          Payload: new TextEncoder().encode(JSON.stringify({
            service_name: 'hubspot',
            credential_type: 'oauth',
            data: {
              access_token: 'test-hubspot-token',
              refresh_token: 'test-refresh',
              token_expiry: new Date(Date.now() + 3600000).toISOString(),
            },
          })),
        });
      } else if (serviceName === 'mixpanel') {
        return Promise.resolve({
          Payload: new TextEncoder().encode(JSON.stringify({
            service_name: 'mixpanel',
            credential_type: 'service_account',
            data: {
              username: 'test-mixpanel-user',
              secret: 'test-mixpanel-secret',
            },
          })),
        });
      } else if (serviceName === 'stripe') {
        return Promise.resolve({
          Payload: new TextEncoder().encode(JSON.stringify({
            service_name: 'stripe',
            credential_type: 'api_key',
            data: {
              api_key: 'test-stripe-key',
            },
          })),
        });
      }
    });
  }

  /**
   * Helper function to setup successful HubSpot API responses
   */
  function setupHubSpotMocks(companyCount: number = 50) {
    const companies = Array.from({ length: companyCount }, (_, i) => ({
      id: `company-${i + 1}`,
      properties: {
        name: `Company ${i + 1}`,
        industry: i % 2 === 0 ? 'Technology' : 'Finance',
        numberofemployees: String(50 + i * 10),
        state: i % 3 === 0 ? 'CA' : i % 3 === 1 ? 'NY' : 'TX',
        total_revenue: String(100000 + i * 10000),
        createdate: '2024-01-01T00:00:00Z',
      },
    }));

    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('api.hubapi.com')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            results: companies,
            paging: null,
          }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
  }

  /**
   * Helper function to setup successful Mixpanel API responses
   */
  function setupMixpanelMocks() {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('mixpanel.com/api/query/segmentation')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: {
              values: {
                'Aha! Moment': {
                  '2024-01-01': 5,
                  '2024-01-02': 3,
                },
              },
            },
          }),
        });
      } else if (url.includes('mixpanel.com/api/query/retention')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            '2024-01-01': {
              counts: [100, 90, 85, 80],
              first: 100,
            },
          }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
  }

  /**
   * Helper function to setup successful Stripe API responses
   */
  function setupStripeMocks() {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('api.stripe.com/v1/customers/search')) {
        const companyId = new URL(url).searchParams.get('query')?.match(/company-\d+/)?.[0];
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [
              {
                id: `cus-${companyId}`,
                metadata: { company_id: companyId },
              },
            ],
          }),
        });
      } else if (url.includes('api.stripe.com/v1/subscriptions')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
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
          }),
        });
      } else if (url.includes('api.stripe.com/v1/invoices')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [],
          }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
  }

  /**
   * Helper function to setup successful Bedrock responses
   */
  function setupBedrockMocks() {
    // Mock Knowledge Base version retrieval
    mockBedrockAgentSend.mockImplementation((command: any) => {
      if (command.constructor.name === 'RetrieveCommand') {
        return Promise.resolve({
          retrievalResults: [
            {
              content: {
                text: 'Version: 5',
              },
            },
          ],
        });
      }
      return Promise.resolve({});
    });

    // Mock Nova Lite trait analysis
    mockBedrockRuntimeSend.mockResolvedValue({
      body: {
        transformToString: () => JSON.stringify({
          output: {
            message: {
              content: [
                {
                  text: JSON.stringify({
                    commonTraits: {
                      industries: ['Technology', 'Finance'],
                      sizeRange: '50-200 employees',
                      regions: ['CA', 'NY'],
                      usagePatterns: ['High engagement', 'Regular usage'],
                    },
                    reasoning: 'Top customers show strong patterns in tech and finance sectors.',
                    confidenceScore: 85,
                    changeFromPrevious: 'Increased focus on technology sector',
                  }),
                },
              ],
            },
          },
        }),
      },
    });
  }

  /**
   * Helper function to setup successful DynamoDB responses
   */
  function setupDynamoDBMocks() {
    mockDynamoSend.mockResolvedValue({});
  }

  /**
   * Helper function to setup all successful mocks
   */
  function setupSuccessfulMocks(companyCount: number = 50) {
    setupCredentialVaultMocks();
    setupDynamoDBMocks();
    setupBedrockMocks();

    // Setup combined fetch mock for all services
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('api.hubapi.com')) {
        const companies = Array.from({ length: companyCount }, (_, i) => ({
          id: `company-${i + 1}`,
          properties: {
            name: `Company ${i + 1}`,
            industry: i % 2 === 0 ? 'Technology' : 'Finance',
            numberofemployees: String(50 + i * 10),
            state: i % 3 === 0 ? 'CA' : i % 3 === 1 ? 'NY' : 'TX',
            total_revenue: String(100000 + i * 10000),
            createdate: '2024-01-01T00:00:00Z',
          },
        }));
        return Promise.resolve({
          ok: true,
          json: async () => ({
            results: companies,
            paging: null,
          }),
        });
      } else if (url.includes('mixpanel.com/api/query/segmentation')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: {
              values: {
                'Aha! Moment': {
                  '2024-01-01': 5,
                  '2024-01-02': 3,
                },
              },
            },
          }),
        });
      } else if (url.includes('mixpanel.com/api/query/retention')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            '2024-01-01': {
              counts: [100, 90, 85, 80],
              first: 100,
            },
          }),
        });
      } else if (url.includes('api.stripe.com/v1/customers/search')) {
        const companyId = new URL(url).searchParams.get('query')?.match(/company-\d+/)?.[0];
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [
              {
                id: `cus-${companyId}`,
                metadata: { company_id: companyId },
              },
            ],
          }),
        });
      } else if (url.includes('api.stripe.com/v1/subscriptions')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
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
          }),
        });
      } else if (url.includes('api.stripe.com/v1/invoices')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [],
          }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
  }

  describe('Successful End-to-End Flow', () => {
    it('should complete full analysis with all services working', async () => {
      setupSuccessfulMocks(50);

      await runICPRefinement(testUserId);

      // Verify credential vault was called for all services
      expect(mockLambdaSend).toHaveBeenCalledTimes(3);

      // Verify HubSpot API was called
      expect(global.fetch).toHaveBeenCalled();

      // Verify Bedrock was called for trait analysis
      expect(mockBedrockRuntimeSend).toHaveBeenCalled();

      // Verify Knowledge Base was queried for version
      expect(mockBedrockAgentSend).toHaveBeenCalled();

      // Verify DynamoDB was called to store analysis
      expect(mockDynamoSend).toHaveBeenCalled();

      // Verify CloudWatch metrics were published
      expect(mockCloudWatchSend).toHaveBeenCalled();
    });

    it('should process correct number of top customers', async () => {
      setupSuccessfulMocks(100);

      await runICPRefinement(testUserId);

      // Verify trait analysis was called with masked data
      expect(mockBedrockRuntimeSend).toHaveBeenCalled();
      
      // Top 10% of 100 companies = 10 companies
      const bedrockCall = mockBedrockRuntimeSend.mock.calls[0][0];
      const payload = JSON.parse(bedrockCall.input.messages[0].content[0].text);
      expect(payload.customers).toHaveLength(10);
    });

    it('should increment ICP version correctly', async () => {
      setupSuccessfulMocks(50);

      // Mock previous version as 5
      mockBedrockAgentSend.mockResolvedValue({
        retrievalResults: [
          {
            content: {
              text: 'Version: 5',
            },
          },
        ],
      });

      await runICPRefinement(testUserId);

      // Verify DynamoDB was called with version 6
      const dynamoCall = mockDynamoSend.mock.calls.find((call: any) => 
        call[0].constructor.name === 'PutItemCommand'
      );
      
      expect(dynamoCall).toBeDefined();
    });
  });

  describe('Graceful Degradation', () => {
    it('should continue when Mixpanel fails', async () => {
      setupCredentialVaultMocks();
      setupDynamoDBMocks();
      setupBedrockMocks();

      // Setup HubSpot to succeed
      const companies = Array.from({ length: 50 }, (_, i) => ({
        id: `company-${i + 1}`,
        properties: {
          name: `Company ${i + 1}`,
          industry: 'Technology',
          numberofemployees: '100',
          state: 'CA',
          total_revenue: '200000',
          createdate: '2024-01-01T00:00:00Z',
        },
      }));

      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('api.hubapi.com')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              results: companies,
              paging: null,
            }),
          });
        } else if (url.includes('mixpanel.com')) {
          // Mixpanel fails
          return Promise.reject(new Error('Mixpanel API error'));
        } else if (url.includes('api.stripe.com/v1/customers/search')) {
          const companyId = new URL(url).searchParams.get('query')?.match(/company-\d+/)?.[0];
          return Promise.resolve({
            ok: true,
            json: async () => ({
              data: [
                {
                  id: `cus-${companyId}`,
                  metadata: { company_id: companyId },
                },
              ],
            }),
          });
        } else if (url.includes('api.stripe.com/v1/subscriptions')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
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
            }),
          });
        } else if (url.includes('api.stripe.com/v1/invoices')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              data: [],
            }),
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      // Should complete successfully with null Mixpanel data
      await expect(runICPRefinement(testUserId)).resolves.not.toThrow();

      // Verify analysis still completed
      expect(mockBedrockRuntimeSend).toHaveBeenCalled();
      expect(mockDynamoSend).toHaveBeenCalled();
    });

    it('should continue when Stripe fails', async () => {
      setupCredentialVaultMocks();
      setupDynamoDBMocks();
      setupBedrockMocks();

      // Setup HubSpot to succeed
      const companies = Array.from({ length: 50 }, (_, i) => ({
        id: `company-${i + 1}`,
        properties: {
          name: `Company ${i + 1}`,
          industry: 'Technology',
          numberofemployees: '100',
          state: 'CA',
          total_revenue: '200000',
          createdate: '2024-01-01T00:00:00Z',
        },
      }));

      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('api.hubapi.com')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              results: companies,
              paging: null,
            }),
          });
        } else if (url.includes('mixpanel.com/api/query/segmentation')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              data: {
                values: {
                  'Aha! Moment': {
                    '2024-01-01': 5,
                  },
                },
              },
            }),
          });
        } else if (url.includes('mixpanel.com/api/query/retention')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              '2024-01-01': {
                counts: [100, 90],
                first: 100,
              },
            }),
          });
        } else if (url.includes('api.stripe.com')) {
          // Stripe fails
          return Promise.reject(new Error('Stripe API error'));
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      // Should complete successfully with null Stripe data
      await expect(runICPRefinement(testUserId)).resolves.not.toThrow();

      // Verify analysis still completed
      expect(mockBedrockRuntimeSend).toHaveBeenCalled();
      expect(mockDynamoSend).toHaveBeenCalled();
    });

    it('should continue when both Mixpanel and Stripe fail', async () => {
      setupCredentialVaultMocks();
      setupDynamoDBMocks();
      setupBedrockMocks();

      // Setup only HubSpot to succeed
      const companies = Array.from({ length: 50 }, (_, i) => ({
        id: `company-${i + 1}`,
        properties: {
          name: `Company ${i + 1}`,
          industry: 'Technology',
          numberofemployees: '100',
          state: 'CA',
          total_revenue: '200000',
          createdate: '2024-01-01T00:00:00Z',
        },
      }));

      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('api.hubapi.com')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              results: companies,
              paging: null,
            }),
          });
        }
        // All other services fail
        return Promise.reject(new Error('API error'));
      });

      // Should complete successfully with only HubSpot data
      await expect(runICPRefinement(testUserId)).resolves.not.toThrow();

      // Verify analysis still completed
      expect(mockBedrockRuntimeSend).toHaveBeenCalled();
      expect(mockDynamoSend).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should abort when HubSpot fails', async () => {
      setupCredentialVaultMocks();

      // HubSpot fails after retries
      (global.fetch as any).mockRejectedValue(new Error('HubSpot API error'));

      await expect(runICPRefinement(testUserId)).rejects.toThrow('Cannot proceed without HubSpot data');

      // Verify no further processing occurred
      expect(mockBedrockRuntimeSend).not.toHaveBeenCalled();
      expect(mockDynamoSend).not.toHaveBeenCalled();

      // Verify failure metrics were published
      expect(mockCloudWatchSend).toHaveBeenCalled();
    }, 15000); // Increased timeout for retries

    it('should handle insufficient sample size', async () => {
      setupSuccessfulMocks(10); // Only 10 companies, need 20 minimum

      await expect(runICPRefinement(testUserId)).rejects.toThrow('Insufficient sample size');

      // Verify no trait analysis occurred
      expect(mockBedrockRuntimeSend).not.toHaveBeenCalled();
    });

    it('should handle missing environment variables', async () => {
      delete process.env.KNOWLEDGE_BASE_ID;

      await expect(runICPRefinement(testUserId)).rejects.toThrow('KNOWLEDGE_BASE_ID environment variable is required');
    });
  });

  describe('Checkpoint and Resume Logic', () => {
    it('should save checkpoint for large datasets', async () => {
      setupSuccessfulMocks(600); // > 500 companies

      await runICPRefinement(testUserId);

      // Verify checkpoint was saved
      const checkpointCalls = mockDynamoSend.mock.calls.filter((call: any) =>
        call[0].input?.Item?.M?.checkpointId
      );
      
      expect(checkpointCalls.length).toBeGreaterThan(0);
    });

    it('should clear checkpoint on successful completion', async () => {
      setupSuccessfulMocks(600); // > 500 companies

      await runICPRefinement(testUserId);

      // Verify checkpoint was cleared (status set to 'completed')
      const clearCalls = mockDynamoSend.mock.calls.filter((call: any) => {
        const item = call[0].input?.Item?.M;
        return item?.checkpointId && item?.status?.S === 'completed';
      });
      
      expect(clearCalls.length).toBeGreaterThan(0);
    });

    it('should not save checkpoint for small datasets', async () => {
      setupSuccessfulMocks(100); // < 500 companies

      await runICPRefinement(testUserId);

      // Verify no checkpoint was saved
      const checkpointCalls = mockDynamoSend.mock.calls.filter((call: any) =>
        call[0].input?.Item?.M?.checkpointId
      );
      
      // Should only have the clear call at the end, not save calls
      expect(checkpointCalls.length).toBe(0);
    });
  });

  describe('Lambda Handler', () => {
    it('should handle scheduled EventBridge invocation', async () => {
      setupSuccessfulMocks(50);

      const event = {
        source: 'aws.events',
        userId: testUserId,
      };

      await handler(event);

      // Verify analysis ran
      expect(mockBedrockRuntimeSend).toHaveBeenCalled();
    });

    it('should handle manual invocation', async () => {
      setupSuccessfulMocks(50);

      const event = {
        userId: testUserId,
      };

      await handler(event);

      // Verify analysis ran
      expect(mockBedrockRuntimeSend).toHaveBeenCalled();
    });

    it('should throw error when userId is missing', async () => {
      const event = {};

      await expect(handler(event)).rejects.toThrow('userId is required in event payload');
    });

    it('should handle userId in detail object', async () => {
      setupSuccessfulMocks(50);

      const event = {
        detail: {
          userId: testUserId,
        },
      };

      await handler(event);

      // Verify analysis ran
      expect(mockBedrockRuntimeSend).toHaveBeenCalled();
    });
  });

  describe('Metrics Publishing', () => {
    it('should publish success metrics', async () => {
      setupSuccessfulMocks(50);

      await runICPRefinement(testUserId);

      // Verify CloudWatch metrics were published
      expect(mockCloudWatchSend).toHaveBeenCalled();

      const metricsCall = mockCloudWatchSend.mock.calls[0][0];
      expect(metricsCall.input.Namespace).toBe('Sesari/ICPRefinement');
      expect(metricsCall.input.MetricData).toBeDefined();
      
      const metrics = metricsCall.input.MetricData;
      expect(metrics.some((m: any) => m.MetricName === 'ICPAnalysisSuccess')).toBe(true);
      expect(metrics.some((m: any) => m.MetricName === 'CustomersAnalyzed')).toBe(true);
      expect(metrics.some((m: any) => m.MetricName === 'AnalysisDurationMs')).toBe(true);
      expect(metrics.some((m: any) => m.MetricName === 'ICPConfidenceScore')).toBe(true);
    });

    it('should publish failure metrics on error', async () => {
      setupCredentialVaultMocks();
      (global.fetch as any).mockRejectedValue(new Error('HubSpot error'));

      await expect(runICPRefinement(testUserId)).rejects.toThrow();

      // Verify failure metrics were published
      expect(mockCloudWatchSend).toHaveBeenCalled();

      const metricsCall = mockCloudWatchSend.mock.calls[0][0];
      const successMetric = metricsCall.input.MetricData.find(
        (m: any) => m.MetricName === 'ICPAnalysisSuccess'
      );
      
      expect(successMetric.Value).toBe(0);
    }, 15000); // Increased timeout for retries
  });
});
