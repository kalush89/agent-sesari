/**
 * Integration tests for end-to-end webhook processing
 * Tests complete flow from webhook receipt to DynamoDB storage
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../index.js';
import * as eventStore from '../event-store.js';
import * as webhookSecurity from '../webhook-security.js';
import * as signalExtractor from '../signal-extractor.js';

describe('Integration: End-to-End Webhook Processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set required environment variables
    process.env.HUBSPOT_WEBHOOK_SECRET = 'test_webhook_secret';
    process.env.DYNAMODB_TABLE_NAME = 'test-relationship-signals';
    process.env.AWS_REGION = 'us-east-1';
    process.env.LOG_LEVEL = 'error';
  });

  /**
   * Creates a mock API Gateway event for testing
   */
  function createMockEvent(body: string, signature: string, timestamp?: string): APIGatewayProxyEvent {
    return {
      body,
      headers: {
        'X-HubSpot-Signature': signature,
        ...(timestamp && { 'X-HubSpot-Request-Timestamp': timestamp }),
      },
      requestContext: {
        identity: {
          sourceIp: '192.168.1.1',
        },
      },
    } as any;
  }

  /**
   * Creates a mock HubSpot deal progression event
   */
  function createMockDealEvent(eventId: string, companyId: string): any {
    return {
      eventId,
      eventType: 'deal.propertyChange',
      companyId,
      contactId: 'contact_123',
      dealId: 'deal_456',
      timestamp: Math.floor(Date.now() / 1000),
      properties: {
        dealstage: {
          oldValue: 'qualified',
          newValue: 'proposal',
        },
        amount: {
          value: '50000',
        },
        dealname: {
          value: 'Enterprise Deal',
        },
      },
    };
  }

  /**
   * Creates a mock HubSpot sentiment event
   */
  function createMockSentimentEvent(eventId: string, companyId: string): any {
    return {
      eventId,
      eventType: 'note.created',
      companyId,
      contactId: 'contact_789',
      timestamp: Math.floor(Date.now() / 1000),
      note: {
        body: 'Customer is frustrated with the product and considering cancellation',
      },
    };
  }

  it('should process valid deal progression webhook end-to-end', async () => {
    const eventId = `evt_deal_${Date.now()}`;
    const companyId = 'company_test_deal';
    const hubspotEvent = createMockDealEvent(eventId, companyId);
    const payload = JSON.stringify(hubspotEvent);
    const signature = 'valid_signature';

    // Mock webhook verification
    vi.spyOn(webhookSecurity, 'verifyWebhookSignature').mockReturnValue({
      isValid: true,
    });

    // Mock event doesn't exist
    vi.spyOn(eventStore, 'eventExists').mockResolvedValue(false);

    // Mock signal extraction to return a deal progression signal
    vi.spyOn(signalExtractor, 'extractRelationshipSignal').mockReturnValue({
      eventId,
      eventType: 'deal_progression',
      companyId,
      contactId: 'contact_123',
      dealId: 'deal_456',
      timestamp: hubspotEvent.timestamp,
      processedAt: Math.floor(Date.now() / 1000),
      details: {
        oldStage: 'qualified',
        newStage: 'proposal',
        isRegression: false,
        dealValue: 50000,
        currency: 'USD',
        dealName: 'Enterprise Deal',
      },
      hubspotEventType: 'deal.propertyChange',
    } as any);

    // Mock putEvent
    const putEventSpy = vi.spyOn(eventStore, 'putEvent').mockResolvedValue();

    const event = createMockEvent(payload, signature);
    const result = await handler(event);

    // Verify response
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe('Event processed successfully');

    // Verify event was stored
    expect(putEventSpy).toHaveBeenCalledOnce();
    const storedEvent = putEventSpy.mock.calls[0][0];
    expect(storedEvent.eventId).toBe(eventId);
    expect(storedEvent.eventType).toBe('deal_progression');
    expect(storedEvent.companyId).toBe(companyId);
  });

  it('should process valid sentiment webhook end-to-end', async () => {
    const eventId = `evt_sentiment_${Date.now()}`;
    const companyId = 'company_test_sentiment';
    const hubspotEvent = createMockSentimentEvent(eventId, companyId);
    const payload = JSON.stringify(hubspotEvent);
    const signature = 'valid_signature';

    // Mock webhook verification
    vi.spyOn(webhookSecurity, 'verifyWebhookSignature').mockReturnValue({
      isValid: true,
    });

    // Mock event doesn't exist
    vi.spyOn(eventStore, 'eventExists').mockResolvedValue(false);

    // Mock signal extraction to return a sentiment signal
    vi.spyOn(signalExtractor, 'extractRelationshipSignal').mockReturnValue({
      eventId,
      eventType: 'sentiment',
      companyId,
      contactId: 'contact_789',
      timestamp: hubspotEvent.timestamp,
      processedAt: Math.floor(Date.now() / 1000),
      details: {
        sentimentScore: -0.6,
        sentimentCategory: 'negative',
        sourceType: 'note',
        sourceId: 'note_123',
        textExcerpt: 'Customer is frustrated with the product and considering cancellation',
        keywords: ['frustrated', 'cancellation'],
      },
      hubspotEventType: 'note.created',
    } as any);

    // Mock putEvent
    const putEventSpy = vi.spyOn(eventStore, 'putEvent').mockResolvedValue();

    const event = createMockEvent(payload, signature);
    const result = await handler(event);

    // Verify response
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe('Event processed successfully');

    // Verify event was stored
    expect(putEventSpy).toHaveBeenCalledOnce();
    const storedEvent = putEventSpy.mock.calls[0][0];
    expect(storedEvent.eventId).toBe(eventId);
    expect(storedEvent.eventType).toBe('sentiment');
    expect(storedEvent.companyId).toBe(companyId);
  });

  it('should handle duplicate webhooks idempotently', async () => {
    const eventId = `evt_duplicate_${Date.now()}`;
    const companyId = 'company_test_duplicate';
    const hubspotEvent = createMockDealEvent(eventId, companyId);
    const payload = JSON.stringify(hubspotEvent);
    const signature = 'valid_signature';

    // Mock webhook verification
    vi.spyOn(webhookSecurity, 'verifyWebhookSignature').mockReturnValue({
      isValid: true,
    });

    // Mock event already exists
    vi.spyOn(eventStore, 'eventExists').mockResolvedValue(true);

    // Mock putEvent (should not be called)
    const putEventSpy = vi.spyOn(eventStore, 'putEvent').mockResolvedValue();

    const event = createMockEvent(payload, signature);
    const result = await handler(event);

    // Verify response
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe('Event already processed');

    // Verify event was NOT stored
    expect(putEventSpy).not.toHaveBeenCalled();
  });

  it('should reject webhooks with invalid signatures', async () => {
    const hubspotEvent = createMockDealEvent('evt_test', 'company_test');
    const payload = JSON.stringify(hubspotEvent);
    const signature = 'invalid_signature';

    // Mock webhook verification failure
    vi.spyOn(webhookSecurity, 'verifyWebhookSignature').mockReturnValue({
      isValid: false,
      error: 'Invalid signature',
      errorType: 'invalid_signature',
    });

    // Mock putEvent (should not be called)
    const putEventSpy = vi.spyOn(eventStore, 'putEvent').mockResolvedValue();

    const event = createMockEvent(payload, signature);
    const result = await handler(event);

    // Verify response
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message).toBe('Invalid signature');

    // Verify event was NOT stored
    expect(putEventSpy).not.toHaveBeenCalled();
  });

  it('should handle database unavailability with 500 error', async () => {
    const eventId = `evt_db_error_${Date.now()}`;
    const companyId = 'company_test_db_error';
    const hubspotEvent = createMockDealEvent(eventId, companyId);
    const payload = JSON.stringify(hubspotEvent);
    const signature = 'valid_signature';

    // Mock webhook verification
    vi.spyOn(webhookSecurity, 'verifyWebhookSignature').mockReturnValue({
      isValid: true,
    });

    // Mock database error on eventExists check
    const dbError = new Error('ServiceUnavailable: DynamoDB is temporarily unavailable');
    dbError.name = 'ServiceUnavailable';
    vi.spyOn(eventStore, 'eventExists').mockRejectedValue(dbError);

    const event = createMockEvent(payload, signature);
    const result = await handler(event);

    // Verify response
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe('Internal Server Error');
  });

  it('should handle non-relationship events gracefully', async () => {
    const hubspotEvent = {
      eventId: 'evt_test_non_relationship',
      eventType: 'company.created',
      companyId: 'company_test',
      timestamp: Math.floor(Date.now() / 1000),
      properties: {
        name: 'Test Company',
      },
    };

    const payload = JSON.stringify(hubspotEvent);
    const signature = 'valid_signature';

    // Mock webhook verification
    vi.spyOn(webhookSecurity, 'verifyWebhookSignature').mockReturnValue({
      isValid: true,
    });

    // Mock event doesn't exist
    vi.spyOn(eventStore, 'eventExists').mockResolvedValue(false);

    // Mock signal extraction to return null (non-relationship event)
    vi.spyOn(signalExtractor, 'extractRelationshipSignal').mockReturnValue(null);

    // Mock putEvent (should not be called)
    const putEventSpy = vi.spyOn(eventStore, 'putEvent').mockResolvedValue();

    const event = createMockEvent(payload, signature);
    const result = await handler(event);

    // Verify response
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe('Event ignored (not a relationship signal)');

    // Verify event was NOT stored
    expect(putEventSpy).not.toHaveBeenCalled();
  });

  it('should handle malformed JSON payloads', async () => {
    const payload = '{ invalid json }';
    const signature = 'valid_signature';

    const event = createMockEvent(payload, signature);
    const result = await handler(event);

    // Verify response
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Malformed JSON payload');
  });

  it('should handle missing signature header', async () => {
    const hubspotEvent = createMockDealEvent('evt_test', 'company_test');
    const payload = JSON.stringify(hubspotEvent);

    const event = {
      body: payload,
      headers: {},
      requestContext: {
        identity: {
          sourceIp: '192.168.1.1',
        },
      },
    } as any;

    const result = await handler(event);

    // Verify response
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Missing X-HubSpot-Signature header');
  });

  it('should propagate errors across component boundaries', async () => {
    const eventId = `evt_error_${Date.now()}`;
    const companyId = 'company_test_error';
    const hubspotEvent = createMockDealEvent(eventId, companyId);
    const payload = JSON.stringify(hubspotEvent);
    const signature = 'valid_signature';

    // Mock webhook verification
    vi.spyOn(webhookSecurity, 'verifyWebhookSignature').mockReturnValue({
      isValid: true,
    });

    // Mock eventExists throws error
    const checkError = new Error('NetworkingError: Connection timeout');
    checkError.name = 'NetworkingError';
    vi.spyOn(eventStore, 'eventExists').mockRejectedValue(checkError);

    const event = createMockEvent(payload, signature);
    const result = await handler(event);

    // Verify response
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe('Internal Server Error');
  });
});

describe('Integration: Complete Webhook Flow with All Event Types', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    process.env.HUBSPOT_WEBHOOK_SECRET = 'test_webhook_secret';
    process.env.DYNAMODB_TABLE_NAME = 'test-relationship-signals';
    process.env.AWS_REGION = 'us-east-1';
    process.env.LOG_LEVEL = 'error';
  });

  it('should process deal regression event end-to-end', async () => {
    const hubspotEvent = {
      eventId: 'evt_test_regression',
      eventType: 'deal.propertyChange',
      companyId: 'company_test_regression',
      contactId: 'contact_123',
      dealId: 'deal_456',
      timestamp: Math.floor(Date.now() / 1000),
      properties: {
        dealstage: {
          oldValue: 'proposal',
          newValue: 'qualified',
        },
        amount: {
          value: '25000',
        },
        dealname: {
          value: 'Regressed Deal',
        },
      },
    };

    const payload = JSON.stringify(hubspotEvent);
    const signature = 'valid_signature';

    vi.spyOn(webhookSecurity, 'verifyWebhookSignature').mockReturnValue({
      isValid: true,
    });

    vi.spyOn(eventStore, 'eventExists').mockResolvedValue(false);

    // Mock signal extraction to return a regression event
    vi.spyOn(signalExtractor, 'extractRelationshipSignal').mockReturnValue({
      eventId: hubspotEvent.eventId,
      eventType: 'deal_progression',
      companyId: hubspotEvent.companyId,
      contactId: hubspotEvent.contactId,
      dealId: hubspotEvent.dealId,
      timestamp: hubspotEvent.timestamp,
      processedAt: Math.floor(Date.now() / 1000),
      details: {
        oldStage: 'proposal',
        newStage: 'qualified',
        isRegression: true,
        dealValue: 25000,
        currency: 'USD',
        dealName: 'Regressed Deal',
      },
      hubspotEventType: 'deal.propertyChange',
    } as any);

    const putEventSpy = vi.spyOn(eventStore, 'putEvent').mockResolvedValue();

    const event = {
      body: payload,
      headers: { 'X-HubSpot-Signature': signature },
      requestContext: { identity: { sourceIp: '192.168.1.1' } },
    } as any;

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(putEventSpy).toHaveBeenCalledOnce();
    
    const storedEvent = putEventSpy.mock.calls[0][0];
    expect(storedEvent.eventType).toBe('deal_progression');
    expect(storedEvent.details.isRegression).toBe(true);
  });

  it('should process closed won deal event end-to-end', async () => {
    const hubspotEvent = {
      eventId: 'evt_test_closed_won',
      eventType: 'deal.propertyChange',
      companyId: 'company_test_won',
      contactId: 'contact_123',
      dealId: 'deal_789',
      timestamp: Math.floor(Date.now() / 1000),
      properties: {
        dealstage: {
          oldValue: 'proposal',
          newValue: 'closedwon',
        },
        amount: {
          value: '100000',
        },
        dealname: {
          value: 'Won Deal',
        },
        closedate: {
          value: new Date().toISOString(),
        },
      },
    };

    const payload = JSON.stringify(hubspotEvent);
    const signature = 'valid_signature';

    vi.spyOn(webhookSecurity, 'verifyWebhookSignature').mockReturnValue({
      isValid: true,
    });

    vi.spyOn(eventStore, 'eventExists').mockResolvedValue(false);

    // Mock signal extraction to return a closed won event
    vi.spyOn(signalExtractor, 'extractRelationshipSignal').mockReturnValue({
      eventId: hubspotEvent.eventId,
      eventType: 'deal_progression',
      companyId: hubspotEvent.companyId,
      contactId: hubspotEvent.contactId,
      dealId: hubspotEvent.dealId,
      timestamp: hubspotEvent.timestamp,
      processedAt: Math.floor(Date.now() / 1000),
      details: {
        oldStage: 'proposal',
        newStage: 'closedwon',
        isRegression: false,
        dealValue: 100000,
        currency: 'USD',
        dealName: 'Won Deal',
        closeDate: Math.floor(new Date(hubspotEvent.properties.closedate.value).getTime() / 1000),
      },
      hubspotEventType: 'deal.propertyChange',
    } as any);

    const putEventSpy = vi.spyOn(eventStore, 'putEvent').mockResolvedValue();

    const event = {
      body: payload,
      headers: { 'X-HubSpot-Signature': signature },
      requestContext: { identity: { sourceIp: '192.168.1.1' } },
    } as any;

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(putEventSpy).toHaveBeenCalledOnce();
    
    const storedEvent = putEventSpy.mock.calls[0][0];
    expect(storedEvent.eventType).toBe('deal_progression');
    expect(storedEvent.details.newStage).toBe('closedwon');
    expect(storedEvent.details.closeDate).toBeDefined();
  });

  it('should process positive sentiment event end-to-end', async () => {
    const hubspotEvent = {
      eventId: 'evt_test_positive_sentiment',
      eventType: 'note.created',
      companyId: 'company_test_positive',
      contactId: 'contact_456',
      timestamp: Math.floor(Date.now() / 1000),
      note: {
        body: 'Customer is excited about the new features and wants to expand usage',
      },
    };

    const payload = JSON.stringify(hubspotEvent);
    const signature = 'valid_signature';

    vi.spyOn(webhookSecurity, 'verifyWebhookSignature').mockReturnValue({
      isValid: true,
    });

    vi.spyOn(eventStore, 'eventExists').mockResolvedValue(false);

    // Mock signal extraction to return a positive sentiment event
    vi.spyOn(signalExtractor, 'extractRelationshipSignal').mockReturnValue({
      eventId: hubspotEvent.eventId,
      eventType: 'sentiment',
      companyId: hubspotEvent.companyId,
      contactId: hubspotEvent.contactId,
      timestamp: hubspotEvent.timestamp,
      processedAt: Math.floor(Date.now() / 1000),
      details: {
        sentimentScore: 0.7,
        sentimentCategory: 'positive',
        sourceType: 'note',
        sourceId: 'note_456',
        textExcerpt: 'Customer is excited about the new features and wants to expand usage',
        keywords: ['excited', 'expand'],
      },
      hubspotEventType: 'note.created',
    } as any);

    const putEventSpy = vi.spyOn(eventStore, 'putEvent').mockResolvedValue();

    const event = {
      body: payload,
      headers: { 'X-HubSpot-Signature': signature },
      requestContext: { identity: { sourceIp: '192.168.1.1' } },
    } as any;

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(putEventSpy).toHaveBeenCalledOnce();
    
    const storedEvent = putEventSpy.mock.calls[0][0];
    expect(storedEvent.eventType).toBe('sentiment');
    expect(storedEvent.details.sentimentCategory).toBe('positive');
  });
});
