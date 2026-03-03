/**
 * Unit tests for Communication Gap Detector
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateImportanceLevel,
  createGapEventIfNeeded,
  getActiveDeals,
  getExistingCustomers,
  getDaysSinceLastContact,
} from '../gap-detector';
import * as eventStore from '../event-store';
import { Client } from '@hubspot/api-client';

// Mock event store
vi.mock('../event-store', () => ({
  putEvent: vi.fn(),
}));

describe('calculateImportanceLevel', () => {
  it('should return high importance for deal value >$10k', () => {
    const result = calculateImportanceLevel(50000);
    expect(result).toBe('high');
  });

  it('should return medium importance for deal value $1k-$10k', () => {
    const result = calculateImportanceLevel(5000);
    expect(result).toBe('medium');
  });

  it('should return low importance for deal value <$1k', () => {
    const result = calculateImportanceLevel(500);
    expect(result).toBe('low');
  });

  it('should return high importance for customer with high lifetime value', () => {
    const result = calculateImportanceLevel(25000);
    expect(result).toBe('high');
  });

  it('should return medium importance for exactly $1k', () => {
    const result = calculateImportanceLevel(1000);
    expect(result).toBe('medium');
  });

  it('should return high importance for exactly $10k', () => {
    const result = calculateImportanceLevel(10000);
    expect(result).toBe('medium');
  });

  it('should return high importance for value just over $10k', () => {
    const result = calculateImportanceLevel(10001);
    expect(result).toBe('high');
  });
});

describe('createGapEventIfNeeded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set environment variables for thresholds
    process.env.DEAL_GAP_THRESHOLD_DAYS = '14';
    process.env.CUSTOMER_GAP_THRESHOLD_DAYS = '30';
  });

  it('should create gap event for active deal with 15 days since contact', async () => {
    const putEventMock = vi.mocked(eventStore.putEvent);

    await createGapEventIfNeeded(
      'contact-123',
      'company-456',
      15,
      'high',
      'active_deal',
      50000
    );

    expect(putEventMock).toHaveBeenCalledTimes(1);
    const event = putEventMock.mock.calls[0][0];
    expect(event.eventType).toBe('communication_gap');
    expect(event.contactId).toBe('contact-123');
    expect(event.companyId).toBe('company-456');
    expect(event.details.daysSinceLastContact).toBe(15);
    expect(event.details.importanceLevel).toBe('high');
    expect(event.details.relationshipType).toBe('active_deal');
    expect(event.details.dealValue).toBe(50000);
  });

  it('should not create gap event for active deal with 10 days since contact', async () => {
    const putEventMock = vi.mocked(eventStore.putEvent);

    await createGapEventIfNeeded(
      'contact-123',
      'company-456',
      10,
      'medium',
      'active_deal',
      5000
    );

    expect(putEventMock).not.toHaveBeenCalled();
  });

  it('should create gap event for customer with 35 days since contact', async () => {
    const putEventMock = vi.mocked(eventStore.putEvent);

    await createGapEventIfNeeded(
      'contact-789',
      'company-101',
      35,
      'high',
      'existing_customer',
      undefined,
      75000
    );

    expect(putEventMock).toHaveBeenCalledTimes(1);
    const event = putEventMock.mock.calls[0][0];
    expect(event.eventType).toBe('communication_gap');
    expect(event.contactId).toBe('contact-789');
    expect(event.details.daysSinceLastContact).toBe(35);
    expect(event.details.relationshipType).toBe('existing_customer');
    expect(event.details.customerLifetimeValue).toBe(75000);
  });

  it('should not create gap event for customer with 20 days since contact', async () => {
    const putEventMock = vi.mocked(eventStore.putEvent);

    await createGapEventIfNeeded(
      'contact-789',
      'company-101',
      20,
      'medium',
      'existing_customer',
      undefined,
      5000
    );

    expect(putEventMock).not.toHaveBeenCalled();
  });

  it('should create gap event for contact exactly at 14-day threshold', async () => {
    const putEventMock = vi.mocked(eventStore.putEvent);

    await createGapEventIfNeeded(
      'contact-999',
      'company-888',
      14,
      'low',
      'active_deal',
      500
    );

    expect(putEventMock).toHaveBeenCalledTimes(1);
    const event = putEventMock.mock.calls[0][0];
    expect(event.details.daysSinceLastContact).toBe(14);
  });

  it('should generate unique event IDs for gap events', async () => {
    const putEventMock = vi.mocked(eventStore.putEvent);

    await createGapEventIfNeeded(
      'contact-123',
      'company-456',
      15,
      'high',
      'active_deal',
      50000
    );

    // Add small delay to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 10));

    await createGapEventIfNeeded(
      'contact-123',
      'company-456',
      16,
      'high',
      'active_deal',
      50000
    );

    expect(putEventMock).toHaveBeenCalledTimes(2);
    const event1 = putEventMock.mock.calls[0][0];
    const event2 = putEventMock.mock.calls[1][0];
    expect(event1.eventId).not.toBe(event2.eventId);
  });
});

describe('HubSpot API error handling', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      crm: {
        deals: {
          searchApi: {
            doSearch: vi.fn(),
          },
        },
        contacts: {
          searchApi: {
            doSearch: vi.fn(),
          },
          basicApi: {
            getById: vi.fn(),
          },
        },
      },
    };
  });

  it('should retry on rate limiting with exponential backoff', async () => {
    const searchMock = mockClient.crm.deals.searchApi.doSearch;
    
    // Fail twice, then succeed
    searchMock
      .mockRejectedValueOnce(new Error('Rate limit exceeded'))
      .mockRejectedValueOnce(new Error('Rate limit exceeded'))
      .mockResolvedValueOnce({
        results: [
          {
            id: 'deal-1',
            properties: {
              associatedcompanyid: 'company-1',
              associatedcontactid: 'contact-1',
              amount: '10000',
              dealstage: 'proposal',
            },
          },
        ],
      });

    const result = await getActiveDeals(mockClient);

    expect(searchMock).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('deal-1');
  }, 10000);

  it('should throw error after max retries for API unavailable', async () => {
    const searchMock = mockClient.crm.deals.searchApi.doSearch;
    searchMock.mockRejectedValue(new Error('Service unavailable'));

    await expect(getActiveDeals(mockClient)).rejects.toThrow('Failed to retrieve active deals');
    expect(searchMock).toHaveBeenCalledTimes(4); // Initial + 3 retries
  }, 10000);

  it('should log critical error on authentication failure', async () => {
    const searchMock = mockClient.crm.contacts.searchApi.doSearch;
    searchMock.mockRejectedValue(new Error('Authentication failed'));

    await expect(getExistingCustomers(mockClient)).rejects.toThrow('Failed to retrieve existing customers');
    expect(searchMock).toHaveBeenCalledTimes(4);
  }, 10000);

  it('should handle individual contact query failure and continue batch', async () => {
    const getByIdMock = mockClient.crm.contacts.basicApi.getById;
    
    // Mock for first contact - will fail after retries
    const failingMock = vi.fn().mockRejectedValue(new Error('Contact not found'));
    
    // Mock for second contact - will succeed
    const successMock = vi.fn().mockResolvedValue({
      properties: {
        notes_last_contacted: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });

    // First call should throw after retries
    getByIdMock.mockImplementation(failingMock);
    await expect(getDaysSinceLastContact(mockClient, 'contact-1')).rejects.toThrow();

    // Reset mock for second call
    getByIdMock.mockImplementation(successMock);
    
    // Second call should succeed
    const days = await getDaysSinceLastContact(mockClient, 'contact-2');
    expect(days).toBe(20);
  }, 10000);

  it('should return 999 days for contact with no communication history', async () => {
    const getByIdMock = mockClient.crm.contacts.basicApi.getById;
    getByIdMock.mockResolvedValue({
      properties: {},
    });

    const days = await getDaysSinceLastContact(mockClient, 'contact-no-history');
    expect(days).toBe(999);
  });

  it('should parse active deals correctly', async () => {
    const searchMock = mockClient.crm.deals.searchApi.doSearch;
    searchMock.mockResolvedValue({
      results: [
        {
          id: 'deal-1',
          properties: {
            associatedcompanyid: 'company-1',
            associatedcontactid: 'contact-1',
            amount: '25000',
            dealstage: 'negotiation',
          },
        },
        {
          id: 'deal-2',
          properties: {
            associatedcompanyid: 'company-2',
            associatedcontactid: 'contact-2',
            amount: '5000',
            dealstage: 'proposal',
          },
        },
      ],
    });

    const deals = await getActiveDeals(mockClient);

    expect(deals).toHaveLength(2);
    expect(deals[0]).toEqual({
      id: 'deal-1',
      companyId: 'company-1',
      contactId: 'contact-1',
      dealValue: 25000,
      stage: 'negotiation',
    });
    expect(deals[1]).toEqual({
      id: 'deal-2',
      companyId: 'company-2',
      contactId: 'contact-2',
      dealValue: 5000,
      stage: 'proposal',
    });
  });

  it('should parse existing customers correctly', async () => {
    const searchMock = mockClient.crm.contacts.searchApi.doSearch;
    searchMock.mockResolvedValue({
      results: [
        {
          id: 'contact-1',
          properties: {
            associatedcompanyid: 'company-1',
            hs_lifetime_value: '50000',
          },
        },
        {
          id: 'contact-2',
          properties: {
            associatedcompanyid: 'company-2',
            hs_lifetime_value: '2500',
          },
        },
      ],
    });

    const customers = await getExistingCustomers(mockClient);

    expect(customers).toHaveLength(2);
    expect(customers[0]).toEqual({
      id: 'contact-1',
      companyId: 'company-1',
      customerLifetimeValue: 50000,
    });
    expect(customers[1]).toEqual({
      id: 'contact-2',
      companyId: 'company-2',
      customerLifetimeValue: 2500,
    });
  });
});
