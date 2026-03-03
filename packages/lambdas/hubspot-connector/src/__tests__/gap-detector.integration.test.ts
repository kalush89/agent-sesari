/**
 * Integration tests for communication gap detection
 * Tests gap detection logic with mocked HubSpot API
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getActiveDeals, getExistingCustomers, getDaysSinceLastContact, createGapEventIfNeeded, calculateImportanceLevel } from '../gap-detector.js';
import * as eventStore from '../event-store.js';
import { Client } from '@hubspot/api-client';

// Set environment variables before importing
process.env.HUBSPOT_API_KEY = 'test_api_key';
process.env.DYNAMODB_TABLE_NAME = 'test-relationship-signals';
process.env.AWS_REGION = 'us-east-1';
process.env.DEAL_GAP_THRESHOLD_DAYS = '14';
process.env.CUSTOMER_GAP_THRESHOLD_DAYS = '30';
process.env.LOG_LEVEL = 'error';

describe('Integration: Gap Detection Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Creates a mock HubSpot client with mocked methods
   */
  function createMockHubSpotClient(
    deals: any[] = [],
    customers: any[] = [],
    contactDates: Record<string, string> = {}
  ): Client {
    const mockClient = {
      crm: {
        deals: {
          searchApi: {
            doSearch: vi.fn().mockResolvedValue({
              results: deals,
            }),
          },
        },
        contacts: {
          searchApi: {
            doSearch: vi.fn().mockResolvedValue({
              results: customers,
            }),
          },
          basicApi: {
            getById: vi.fn().mockImplementation((contactId: string) => {
              const lastContactedDate = contactDates[contactId] || new Date().toISOString();
              return Promise.resolve({
                properties: {
                  notes_last_contacted: lastContactedDate,
                  lastmodifieddate: lastContactedDate,
                },
              });
            }),
          },
        },
      },
    } as any;

    return mockClient;
  }

  it('should detect communication gap for active deal exceeding threshold', async () => {
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

    const mockDeals = [
      {
        id: 'deal_123',
        properties: {
          dealname: 'Test Deal',
          amount: '50000',
          dealstage: 'proposal',
          associatedcompanyid: 'company_123',
          associatedcontactid: 'contact_123',
        },
      },
    ];

    const mockClient = createMockHubSpotClient(
      mockDeals,
      [],
      { contact_123: fifteenDaysAgo.toISOString() }
    );

    // Mock putEvent
    const putEventSpy = vi.spyOn(eventStore, 'putEvent').mockResolvedValue();

    // Mock the Client constructor to return our mock
    vi.spyOn(Client.prototype, 'crm', 'get').mockReturnValue(mockClient.crm as any);

    const deals = await getActiveDeals(mockClient);
    expect(deals).toHaveLength(1);
    expect(deals[0].id).toBe('deal_123');

    const daysSince = await getDaysSinceLastContact(mockClient, 'contact_123');
    expect(daysSince).toBeGreaterThanOrEqual(14);

    await createGapEventIfNeeded(
      'contact_123',
      'company_123',
      daysSince,
      'high',
      'active_deal',
      50000
    );

    // Verify gap event was created
    expect(putEventSpy).toHaveBeenCalled();
    const storedEvent = putEventSpy.mock.calls[0][0];
    expect(storedEvent.eventType).toBe('communication_gap');
    expect(storedEvent.contactId).toBe('contact_123');
    expect(storedEvent.companyId).toBe('company_123');
    expect(storedEvent.details.daysSinceLastContact).toBeGreaterThanOrEqual(14);
    expect(storedEvent.details.relationshipType).toBe('active_deal');
  });

  it('should not create gap event for active deal below threshold', async () => {
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    const mockClient = createMockHubSpotClient(
      [],
      [],
      { contact_456: tenDaysAgo.toISOString() }
    );

    // Mock putEvent
    const putEventSpy = vi.spyOn(eventStore, 'putEvent').mockResolvedValue();

    const daysSince = await getDaysSinceLastContact(mockClient, 'contact_456');
    expect(daysSince).toBeLessThan(14);

    await createGapEventIfNeeded(
      'contact_456',
      'company_456',
      daysSince,
      'medium',
      'active_deal',
      25000
    );

    // Verify no gap event was created
    expect(putEventSpy).not.toHaveBeenCalled();
  });

  it('should detect communication gap for existing customer exceeding threshold', async () => {
    const thirtyFiveDaysAgo = new Date();
    thirtyFiveDaysAgo.setDate(thirtyFiveDaysAgo.getDate() - 35);

    const mockClient = createMockHubSpotClient(
      [],
      [],
      { contact_789: thirtyFiveDaysAgo.toISOString() }
    );

    // Mock putEvent
    const putEventSpy = vi.spyOn(eventStore, 'putEvent').mockResolvedValue();

    const daysSince = await getDaysSinceLastContact(mockClient, 'contact_789');
    expect(daysSince).toBeGreaterThanOrEqual(30);

    await createGapEventIfNeeded(
      'contact_789',
      'company_789',
      daysSince,
      'high',
      'existing_customer',
      undefined,
      15000
    );

    // Verify gap event was created
    expect(putEventSpy).toHaveBeenCalled();
    const storedEvent = putEventSpy.mock.calls[0][0];
    expect(storedEvent.eventType).toBe('communication_gap');
    expect(storedEvent.contactId).toBe('contact_789');
    expect(storedEvent.companyId).toBe('company_789');
    expect(storedEvent.details.daysSinceLastContact).toBeGreaterThanOrEqual(30);
    expect(storedEvent.details.relationshipType).toBe('existing_customer');
  });

  it('should not create gap event for existing customer below threshold', async () => {
    const twentyDaysAgo = new Date();
    twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);

    const mockClient = createMockHubSpotClient(
      [],
      [],
      { contact_999: twentyDaysAgo.toISOString() }
    );

    // Mock putEvent
    const putEventSpy = vi.spyOn(eventStore, 'putEvent').mockResolvedValue();

    const daysSince = await getDaysSinceLastContact(mockClient, 'contact_999');
    expect(daysSince).toBeLessThan(30);

    await createGapEventIfNeeded(
      'contact_999',
      'company_999',
      daysSince,
      'medium',
      'existing_customer',
      undefined,
      8000
    );

    // Verify no gap event was created
    expect(putEventSpy).not.toHaveBeenCalled();
  });

  it('should process multiple deals and customers in batch', async () => {
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

    const thirtyFiveDaysAgo = new Date();
    thirtyFiveDaysAgo.setDate(thirtyFiveDaysAgo.getDate() - 35);

    const mockDeals = [
      {
        id: 'deal_1',
        properties: {
          dealname: 'Deal 1',
          amount: '30000',
          dealstage: 'proposal',
          associatedcompanyid: 'company_1',
          associatedcontactid: 'contact_1',
        },
      },
      {
        id: 'deal_2',
        properties: {
          dealname: 'Deal 2',
          amount: '40000',
          dealstage: 'qualified',
          associatedcompanyid: 'company_2',
          associatedcontactid: 'contact_2',
        },
      },
    ];

    const mockCustomers = [
      {
        id: 'contact_3',
        properties: {
          associatedcompanyid: 'company_3',
          hs_lifetime_value: '20000',
        },
      },
    ];

    const mockClient = createMockHubSpotClient(
      mockDeals,
      mockCustomers,
      {
        contact_1: fifteenDaysAgo.toISOString(),
        contact_2: fifteenDaysAgo.toISOString(),
        contact_3: thirtyFiveDaysAgo.toISOString(),
      }
    );

    // Mock putEvent
    const putEventSpy = vi.spyOn(eventStore, 'putEvent').mockResolvedValue();

    // Test retrieving deals
    const deals = await getActiveDeals(mockClient);
    expect(deals).toHaveLength(2);

    // Test retrieving customers
    const customers = await getExistingCustomers(mockClient);
    expect(customers).toHaveLength(1);

    // Test creating gap events for each
    for (const deal of deals) {
      const daysSince = await getDaysSinceLastContact(mockClient, deal.contactId);
      await createGapEventIfNeeded(
        deal.contactId,
        deal.companyId,
        daysSince,
        calculateImportanceLevel(deal.dealValue),
        'active_deal',
        deal.dealValue
      );
    }

    for (const customer of customers) {
      const daysSince = await getDaysSinceLastContact(mockClient, customer.id);
      await createGapEventIfNeeded(
        customer.id,
        customer.companyId,
        daysSince,
        calculateImportanceLevel(customer.customerLifetimeValue),
        'existing_customer',
        undefined,
        customer.customerLifetimeValue
      );
    }

    // Verify 3 gap events were created (2 deals + 1 customer)
    expect(putEventSpy).toHaveBeenCalledTimes(3);
  });

  it('should continue processing on individual contact failure', async () => {
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

    const mockClient = {
      crm: {
        deals: {
          searchApi: {
            doSearch: vi.fn().mockResolvedValue({
              results: [],
            }),
          },
        },
        contacts: {
          searchApi: {
            doSearch: vi.fn().mockResolvedValue({
              results: [],
            }),
          },
          basicApi: {
            getById: vi.fn().mockImplementation((contactId: string) => {
              if (contactId === 'contact_1') {
                // Fail immediately without retries for this test
                const error = new Error('Contact not found');
                (error as any).code = 'NotFound';
                return Promise.reject(error);
              }
              return Promise.resolve({
                properties: {
                  notes_last_contacted: fifteenDaysAgo.toISOString(),
                },
              });
            }),
          },
        },
      },
    } as any;

    // Mock putEvent
    const putEventSpy = vi.spyOn(eventStore, 'putEvent').mockResolvedValue();

    // Test that contact_1 fails (will retry but eventually fail)
    await expect(getDaysSinceLastContact(mockClient, 'contact_1')).rejects.toThrow();

    // Test that contact_2 succeeds
    const daysSince = await getDaysSinceLastContact(mockClient, 'contact_2');
    expect(daysSince).toBeGreaterThanOrEqual(14);

    await createGapEventIfNeeded(
      'contact_2',
      'company_2',
      daysSince,
      'high',
      'active_deal',
      40000
    );

    // Verify only 1 gap event was created (contact_2 succeeded)
    expect(putEventSpy).toHaveBeenCalledTimes(1);
    const storedEvent = putEventSpy.mock.calls[0][0];
    expect(storedEvent.contactId).toBe('contact_2');
  }, 15000); // Increase timeout to 15 seconds for retry logic

  it('should handle HubSpot API rate limiting with retry', async () => {
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

    let attemptCount = 0;
    const mockClient = {
      crm: {
        deals: {
          searchApi: {
            doSearch: vi.fn().mockResolvedValue({
              results: [],
            }),
          },
        },
        contacts: {
          searchApi: {
            doSearch: vi.fn().mockResolvedValue({
              results: [],
            }),
          },
          basicApi: {
            getById: vi.fn().mockImplementation(() => {
              attemptCount++;
              if (attemptCount === 1) {
                const error = new Error('Rate limit exceeded');
                (error as any).statusCode = 429;
                return Promise.reject(error);
              }
              return Promise.resolve({
                properties: {
                  notes_last_contacted: fifteenDaysAgo.toISOString(),
                },
              });
            }),
          },
        },
      },
    } as any;

    // Test that retry logic works
    const daysSince = await getDaysSinceLastContact(mockClient, 'contact_rate_limit');
    expect(daysSince).toBeGreaterThanOrEqual(14);
    expect(attemptCount).toBeGreaterThan(1);
  });

  it('should handle HubSpot API unavailability gracefully', async () => {
    const mockClient = {
      crm: {
        deals: {
          searchApi: {
            doSearch: vi.fn().mockRejectedValue(new Error('Service unavailable')),
          },
        },
        contacts: {
          searchApi: {
            doSearch: vi.fn().mockResolvedValue({
              results: [],
            }),
          },
          basicApi: {
            getById: vi.fn(),
          },
        },
      },
    } as any;

    // Should throw error after retries
    await expect(getActiveDeals(mockClient)).rejects.toThrow();
  }, 15000); // Increase timeout to 15 seconds for retry logic

  it('should calculate correct importance levels', async () => {
    // Test high importance
    expect(calculateImportanceLevel(50000)).toBe('high');
    
    // Test medium importance
    expect(calculateImportanceLevel(5000)).toBe('medium');
    
    // Test low importance
    expect(calculateImportanceLevel(500)).toBe('low');
  });

  it('should handle contact with no communication history', async () => {
    const mockClient = {
      crm: {
        deals: {
          searchApi: {
            doSearch: vi.fn().mockResolvedValue({
              results: [],
            }),
          },
        },
        contacts: {
          searchApi: {
            doSearch: vi.fn().mockResolvedValue({
              results: [],
            }),
          },
          basicApi: {
            getById: vi.fn().mockResolvedValue({
              properties: {
                // No notes_last_contacted or lastmodifieddate
              },
            }),
          },
        },
      },
    } as any;

    // Mock putEvent
    const putEventSpy = vi.spyOn(eventStore, 'putEvent').mockResolvedValue();

    const daysSince = await getDaysSinceLastContact(mockClient, 'contact_no_history');
    expect(daysSince).toBeGreaterThan(100);

    await createGapEventIfNeeded(
      'contact_no_history',
      'company_no_history',
      daysSince,
      'medium',
      'active_deal',
      30000
    );

    // Verify gap event was created with very high days count
    expect(putEventSpy).toHaveBeenCalled();
    const storedEvent = putEventSpy.mock.calls[0][0];
    expect(storedEvent.details.daysSinceLastContact).toBeGreaterThan(100);
  });
});
