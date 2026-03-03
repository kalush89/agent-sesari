/**
 * Unit tests for signal extraction module
 */

import { describe, it, expect } from 'vitest';
import {
  extractRelationshipSignal,
  extractDealProgressionSignal,
  extractSentimentSignal,
  HubSpotWebhookEvent,
} from '../signal-extractor';

describe('extractDealProgressionSignal', () => {
  it('should create event for deal moving from Qualified to Proposal (forward progression)', () => {
    const event: HubSpotWebhookEvent = {
      eventId: 'test-event-1',
      subscriptionId: 12345,
      portalId: 67890,
      occurredAt: 1704067200000, // 2024-01-01 00:00:00 UTC
      eventType: 'deal.propertyChange',
      attemptNumber: 0,
      objectId: 111,
      propertyName: 'dealstage',
      oldValue: 'Qualified',
      propertyValue: 'Proposal',
      dealValue: '5000',
      currency: 'USD',
      dealName: 'Acme Corp Deal',
      companyId: '222',
      contactId: '333',
    };

    const result = extractDealProgressionSignal(event);

    expect(result).not.toBeNull();
    expect(result?.eventType).toBe('deal_progression');
    expect(result?.eventId).toBe('test-event-1');
    expect(result?.companyId).toBe('222');
    expect(result?.contactId).toBe('333');
    expect(result?.dealId).toBe('111');
    const details = result?.details as any;
    expect(details).toMatchObject({
      oldStage: 'Qualified',
      newStage: 'Proposal',
      isRegression: false,
      dealValue: 5000,
      currency: 'USD',
      dealName: 'Acme Corp Deal',
    });
    expect(details.closeDate).toBeUndefined();
  });

  it('should create event for deal moving from Proposal to Qualified (regression)', () => {
    const event: HubSpotWebhookEvent = {
      eventId: 'test-event-2',
      subscriptionId: 12345,
      portalId: 67890,
      occurredAt: 1704067200000,
      eventType: 'deal.propertyChange',
      attemptNumber: 0,
      objectId: 112,
      propertyName: 'dealstage',
      oldValue: 'Proposal',
      propertyValue: 'Qualified',
      dealValue: '3000',
      currency: 'EUR',
      dealName: 'Beta Inc Deal',
      companyId: '223',
    };

    const result = extractDealProgressionSignal(event);

    expect(result).not.toBeNull();
    expect(result?.eventType).toBe('deal_progression');
    const details = result?.details as any;
    expect(details).toMatchObject({
      oldStage: 'Proposal',
      newStage: 'Qualified',
      isRegression: true,
      dealValue: 3000,
      currency: 'EUR',
      dealName: 'Beta Inc Deal',
    });
  });

  it('should create event for deal marked as Closed Won with value and date', () => {
    const closeDate = 1704153600; // 2024-01-02 00:00:00 UTC (in seconds)
    const event: HubSpotWebhookEvent = {
      eventId: 'test-event-3',
      subscriptionId: 12345,
      portalId: 67890,
      occurredAt: 1704153600000, // milliseconds
      eventType: 'deal.propertyChange',
      attemptNumber: 0,
      objectId: 113,
      propertyName: 'dealstage',
      oldValue: 'Negotiation',
      propertyValue: 'Closed Won',
      dealValue: '25000',
      currency: 'USD',
      dealName: 'Enterprise Deal',
      companyId: '224',
      contactId: '334',
      closeDate,
    };

    const result = extractDealProgressionSignal(event);

    expect(result).not.toBeNull();
    expect(result?.eventType).toBe('deal_progression');
    const details = result?.details as any;
    expect(details).toMatchObject({
      oldStage: 'Negotiation',
      newStage: 'Closed Won',
      isRegression: false,
      dealValue: 25000,
      currency: 'USD',
      dealName: 'Enterprise Deal',
      closeDate,
    });
  });

  it('should not create event for deal stage change with no actual change', () => {
    const event: HubSpotWebhookEvent = {
      eventId: 'test-event-4',
      subscriptionId: 12345,
      portalId: 67890,
      occurredAt: 1704067200000,
      eventType: 'deal.propertyChange',
      attemptNumber: 0,
      objectId: 114,
      propertyName: 'dealstage',
      oldValue: 'Qualified',
      propertyValue: 'Qualified',
      dealValue: '1000',
      currency: 'USD',
      dealName: 'Same Stage Deal',
      companyId: '225',
    };

    const result = extractDealProgressionSignal(event);

    expect(result).toBeNull();
  });

  it('should return null for non-dealstage property changes', () => {
    const event: HubSpotWebhookEvent = {
      eventId: 'test-event-5',
      subscriptionId: 12345,
      portalId: 67890,
      occurredAt: 1704067200000,
      eventType: 'deal.propertyChange',
      attemptNumber: 0,
      objectId: 115,
      propertyName: 'amount',
      oldValue: '1000',
      propertyValue: '2000',
      companyId: '226',
    };

    const result = extractDealProgressionSignal(event);

    expect(result).toBeNull();
  });
});

describe('extractSentimentSignal', () => {
  it('should create event for note with negative sentiment text', () => {
    const event: HubSpotWebhookEvent = {
      eventId: 'test-event-6',
      subscriptionId: 12345,
      portalId: 67890,
      occurredAt: 1704067200000,
      eventType: 'note.created',
      attemptNumber: 0,
      objectId: 201,
      body: 'Customer is frustrated with the product and mentioned they might cancel',
      companyId: '227',
      contactId: '335',
    };

    const result = extractSentimentSignal(event);

    expect(result).not.toBeNull();
    expect(result?.eventType).toBe('sentiment');
    expect(result?.eventId).toBe('test-event-6');
    expect(result?.companyId).toBe('227');
    expect(result?.contactId).toBe('335');
    expect(result?.details).toMatchObject({
      sentimentCategory: 'negative',
      sourceType: 'note',
      sourceId: '201',
    });
    expect((result?.details as any).keywords).toContain('frustrated');
    expect((result?.details as any).keywords).toContain('cancel');
    expect((result?.details as any).sentimentScore).toBeLessThan(0);
  });

  it('should create event for email with positive sentiment text', () => {
    const event: HubSpotWebhookEvent = {
      eventId: 'test-event-7',
      subscriptionId: 12345,
      portalId: 67890,
      occurredAt: 1704067200000,
      eventType: 'engagement.created',
      attemptNumber: 0,
      objectId: 202,
      engagementType: 'EMAIL',
      emailBody: "We're excited to expand our usage and love the new features!",
      companyId: '228',
      contactId: '336',
    };

    const result = extractSentimentSignal(event);

    expect(result).not.toBeNull();
    expect(result?.eventType).toBe('sentiment');
    expect(result?.details).toMatchObject({
      sentimentCategory: 'positive',
      sourceType: 'email',
      sourceId: '202',
    });
    expect((result?.details as any).keywords).toContain('excited');
    expect((result?.details as any).keywords).toContain('expand');
    expect((result?.details as any).keywords).toContain('love');
    expect((result?.details as any).sentimentScore).toBeGreaterThan(0);
  });

  it('should create event for note with neutral text', () => {
    const event: HubSpotWebhookEvent = {
      eventId: 'test-event-8',
      subscriptionId: 12345,
      portalId: 67890,
      occurredAt: 1704067200000,
      eventType: 'note.created',
      attemptNumber: 0,
      objectId: 203,
      body: 'Had a meeting to discuss the quarterly review schedule',
      companyId: '229',
      contactId: '337',
    };

    const result = extractSentimentSignal(event);

    expect(result).not.toBeNull();
    expect(result?.eventType).toBe('sentiment');
    expect(result?.details).toMatchObject({
      sentimentCategory: 'neutral',
      sourceType: 'note',
    });
    expect((result?.details as any).sentimentScore).toBeCloseTo(0, 1);
  });

  it('should return null for engagement with no text content', () => {
    const event: HubSpotWebhookEvent = {
      eventId: 'test-event-9',
      subscriptionId: 12345,
      portalId: 67890,
      occurredAt: 1704067200000,
      eventType: 'engagement.created',
      attemptNumber: 0,
      objectId: 204,
      engagementType: 'CALL',
      companyId: '230',
      contactId: '338',
    };

    const result = extractSentimentSignal(event);

    expect(result).toBeNull();
  });
});

describe('extractRelationshipSignal', () => {
  it('should route deal.propertyChange events to deal progression extraction', () => {
    const event: HubSpotWebhookEvent = {
      eventId: 'test-event-10',
      subscriptionId: 12345,
      portalId: 67890,
      occurredAt: 1704067200000,
      eventType: 'deal.propertyChange',
      attemptNumber: 0,
      objectId: 301,
      propertyName: 'dealstage',
      oldValue: 'Lead',
      propertyValue: 'Qualified',
      dealValue: '2000',
      currency: 'USD',
      dealName: 'Test Deal',
      companyId: '231',
    };

    const result = extractRelationshipSignal(event);

    expect(result).not.toBeNull();
    expect(result?.eventType).toBe('deal_progression');
  });

  it('should route note.created events to sentiment extraction', () => {
    const event: HubSpotWebhookEvent = {
      eventId: 'test-event-11',
      subscriptionId: 12345,
      portalId: 67890,
      occurredAt: 1704067200000,
      eventType: 'note.created',
      attemptNumber: 0,
      objectId: 302,
      body: 'Customer is happy with the service',
      companyId: '232',
    };

    const result = extractRelationshipSignal(event);

    expect(result).not.toBeNull();
    expect(result?.eventType).toBe('sentiment');
  });

  it('should route engagement.created events to sentiment extraction', () => {
    const event: HubSpotWebhookEvent = {
      eventId: 'test-event-12',
      subscriptionId: 12345,
      portalId: 67890,
      occurredAt: 1704067200000,
      eventType: 'engagement.created',
      attemptNumber: 0,
      objectId: 303,
      engagementType: 'EMAIL',
      emailBody: 'Great product!',
      companyId: '233',
    };

    const result = extractRelationshipSignal(event);

    expect(result).not.toBeNull();
    expect(result?.eventType).toBe('sentiment');
  });

  it('should return null and log for non-relationship event types', () => {
    const event: HubSpotWebhookEvent = {
      eventId: 'test-event-13',
      subscriptionId: 12345,
      portalId: 67890,
      occurredAt: 1704067200000,
      eventType: 'contact.propertyChange',
      attemptNumber: 0,
      objectId: 304,
      propertyName: 'email',
      companyId: '234',
    };

    const result = extractRelationshipSignal(event);

    expect(result).toBeNull();
  });
});
