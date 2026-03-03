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
import Stripe from 'stripe';

describe('Integration: End-to-End Webhook Processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set required environment variables
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
    process.env.DYNAMODB_TABLE_NAME = 'test-revenue-signals';
    process.env.AWS_REGION = 'us-east-1';
    process.env.LOG_LEVEL = 'error';
  });

  /**
   * Creates a mock API Gateway event for testing
   */
  function createMockEvent(body: string, signature: string): APIGatewayProxyEvent {
    return {
      body,
      headers: {
        'stripe-signature': signature,
      },
      requestContext: {
        identity: {
          sourceIp: '192.168.1.1',
        },
      },
    } as any;
  }

  /**
   * Creates a mock Stripe subscription updated event
   */
  function createMockStripeEvent(type: string, customerId: string): Stripe.Event {
    return {
      id: `evt_test_${Date.now()}`,
      object: 'event',
      type,
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'sub_test_123',
          customer: customerId,
          items: {
            data: [
              {
                price: {
                  id: 'price_new',
                  unit_amount: 19900,
                  currency: 'usd',
                  recurring: { interval: 'month' },
                },
                quantity: 1,
              },
            ],
          },
          metadata: {
            previous_plan: 'price_old',
            previous_amount: '9900',
          },
        },
      },
    } as any;
  }

  it('should process valid expansion webhook end-to-end', async () => {
    const customerId = 'cus_test_expansion';
    const stripeEvent = createMockStripeEvent('customer.subscription.updated', customerId);
    const payload = JSON.stringify(stripeEvent);
    const signature = 'valid_signature';

    // Mock webhook verification
    vi.spyOn(webhookSecurity, 'verifyWebhookSignature').mockReturnValue({
      isValid: true,
      event: stripeEvent,
    });

    // Mock event doesn't exist
    vi.spyOn(eventStore, 'eventExists').mockResolvedValue(false);

    // Mock signal extraction to return a revenue signal
    vi.spyOn(signalExtractor, 'extractRevenueSignal').mockReturnValue({
      eventId: stripeEvent.id,
      eventType: 'expansion',
      customerId,
      subscriptionId: 'sub_test_123',
      timestamp: stripeEvent.created,
      processedAt: Math.floor(Date.now() / 1000),
      revenueImpact: {
        oldMrr: 99,
        newMrr: 199,
        currency: 'usd',
      },
      details: {
        changeType: 'plan_upgrade',
        oldPlanId: 'price_old',
        newPlanId: 'price_new',
      },
      stripeEventType: 'customer.subscription.updated',
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
    expect(storedEvent.eventId).toBe(stripeEvent.id);
    expect(storedEvent.eventType).toBe('expansion');
    expect(storedEvent.customerId).toBe(customerId);
  });

  it('should handle duplicate webhooks idempotently', async () => {
    const customerId = 'cus_test_duplicate';
    const stripeEvent = createMockStripeEvent('customer.subscription.updated', customerId);
    const payload = JSON.stringify(stripeEvent);
    const signature = 'valid_signature';

    // Mock webhook verification
    vi.spyOn(webhookSecurity, 'verifyWebhookSignature').mockReturnValue({
      isValid: true,
      event: stripeEvent,
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
    const stripeEvent = createMockStripeEvent('customer.subscription.updated', 'cus_test');
    const payload = JSON.stringify(stripeEvent);
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
    expect(JSON.parse(result.body).error).toBe('Invalid signature');

    // Verify event was NOT stored
    expect(putEventSpy).not.toHaveBeenCalled();
  });

  it('should handle database unavailability with 500 error', async () => {
    const customerId = 'cus_test_db_error';
    const stripeEvent = createMockStripeEvent('customer.subscription.updated', customerId);
    const payload = JSON.stringify(stripeEvent);
    const signature = 'valid_signature';

    // Mock webhook verification
    vi.spyOn(webhookSecurity, 'verifyWebhookSignature').mockReturnValue({
      isValid: true,
      event: stripeEvent,
    });

    // Mock database error on eventExists check
    const dbError = new Error('ServiceUnavailable: DynamoDB is temporarily unavailable');
    dbError.name = 'ServiceUnavailable';
    vi.spyOn(eventStore, 'eventExists').mockRejectedValue(dbError);

    const event = createMockEvent(payload, signature);
    const result = await handler(event);

    // Verify response
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe('Database temporarily unavailable');
  });

  it('should handle non-revenue events gracefully', async () => {
    const stripeEvent = {
      id: 'evt_test_non_revenue',
      object: 'event',
      type: 'customer.created',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'cus_test',
          email: 'test@example.com',
        },
      },
    } as any;

    const payload = JSON.stringify(stripeEvent);
    const signature = 'valid_signature';

    // Mock webhook verification
    vi.spyOn(webhookSecurity, 'verifyWebhookSignature').mockReturnValue({
      isValid: true,
      event: stripeEvent,
    });

    // Mock event doesn't exist
    vi.spyOn(eventStore, 'eventExists').mockResolvedValue(false);

    // Mock signal extraction to return null (non-revenue event)
    vi.spyOn(signalExtractor, 'extractRevenueSignal').mockReturnValue(null);

    // Mock putEvent (should not be called)
    const putEventSpy = vi.spyOn(eventStore, 'putEvent').mockResolvedValue();

    const event = createMockEvent(payload, signature);
    const result = await handler(event);

    // Verify response
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe('Non-revenue event ignored');

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
    expect(JSON.parse(result.body).error).toBe('Malformed JSON payload');
  });

  it('should handle missing signature header', async () => {
    const stripeEvent = createMockStripeEvent('customer.subscription.updated', 'cus_test');
    const payload = JSON.stringify(stripeEvent);

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
    expect(JSON.parse(result.body).error).toBe('Missing stripe-signature header');
  });

  it('should propagate errors across component boundaries', async () => {
    const customerId = 'cus_test_error';
    const stripeEvent = createMockStripeEvent('customer.subscription.updated', customerId);
    const payload = JSON.stringify(stripeEvent);
    const signature = 'valid_signature';

    // Mock webhook verification
    vi.spyOn(webhookSecurity, 'verifyWebhookSignature').mockReturnValue({
      isValid: true,
      event: stripeEvent,
    });

    // Mock eventExists throws error
    const checkError = new Error('NetworkingError: Connection timeout');
    checkError.name = 'NetworkingError';
    vi.spyOn(eventStore, 'eventExists').mockRejectedValue(checkError);

    const event = createMockEvent(payload, signature);
    const result = await handler(event);

    // Verify response
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe('Database temporarily unavailable');
  });
});

describe('Integration: Complete Webhook Flow with All Event Types', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
    process.env.DYNAMODB_TABLE_NAME = 'test-revenue-signals';
    process.env.AWS_REGION = 'us-east-1';
    process.env.LOG_LEVEL = 'error';
  });

  it('should process churn event end-to-end', async () => {
    const stripeEvent = {
      id: 'evt_test_churn',
      object: 'event',
      type: 'customer.subscription.deleted',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'sub_test_123',
          customer: 'cus_test_churn',
          canceled_at: Math.floor(Date.now() / 1000),
          cancel_at_period_end: false,
          cancellation_details: {
            reason: 'too_expensive',
          },
          items: {
            data: [
              {
                price: {
                  unit_amount: 9900,
                  currency: 'usd',
                  recurring: { interval: 'month' },
                },
                quantity: 1,
              },
            ],
          },
        },
      },
    } as any;

    const payload = JSON.stringify(stripeEvent);
    const signature = 'valid_signature';

    vi.spyOn(webhookSecurity, 'verifyWebhookSignature').mockReturnValue({
      isValid: true,
      event: stripeEvent,
    });

    vi.spyOn(eventStore, 'eventExists').mockResolvedValue(false);

    // Mock signal extraction to return a churn event
    vi.spyOn(signalExtractor, 'extractRevenueSignal').mockReturnValue({
      eventId: stripeEvent.id,
      eventType: 'churn',
      customerId: 'cus_test_churn',
      subscriptionId: 'sub_test_123',
      timestamp: stripeEvent.created,
      processedAt: Math.floor(Date.now() / 1000),
      revenueImpact: {
        oldMrr: 99,
        newMrr: 0,
        currency: 'usd',
      },
      details: {
        cancellationType: 'immediate',
        cancellationReason: 'too_expensive',
        canceledAt: stripeEvent.created,
        mrrLost: 99,
      },
      stripeEventType: 'customer.subscription.deleted',
    } as any);

    const putEventSpy = vi.spyOn(eventStore, 'putEvent').mockResolvedValue();

    const event = {
      body: payload,
      headers: { 'stripe-signature': signature },
      requestContext: { identity: { sourceIp: '192.168.1.1' } },
    } as any;

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(putEventSpy).toHaveBeenCalledOnce();
    
    const storedEvent = putEventSpy.mock.calls[0][0];
    expect(storedEvent.eventType).toBe('churn');
    expect(storedEvent.customerId).toBe('cus_test_churn');
  });

  it('should process failed payment event end-to-end', async () => {
    const stripeEvent = {
      id: 'evt_test_failed_payment',
      object: 'event',
      type: 'invoice.payment_failed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'in_test_123',
          customer: 'cus_test_failed',
          subscription: 'sub_test_123',
          amount_due: 9900,
          currency: 'usd',
          attempt_count: 1,
          last_payment_error: {
            code: 'card_declined',
            message: 'Your card was declined',
          },
        },
      },
    } as any;

    const payload = JSON.stringify(stripeEvent);
    const signature = 'valid_signature';

    vi.spyOn(webhookSecurity, 'verifyWebhookSignature').mockReturnValue({
      isValid: true,
      event: stripeEvent,
    });

    vi.spyOn(eventStore, 'eventExists').mockResolvedValue(false);

    // Mock signal extraction to return a failed payment event
    vi.spyOn(signalExtractor, 'extractRevenueSignal').mockReturnValue({
      eventId: stripeEvent.id,
      eventType: 'failed_payment',
      customerId: 'cus_test_failed',
      subscriptionId: 'sub_test_123',
      timestamp: stripeEvent.created,
      processedAt: Math.floor(Date.now() / 1000),
      revenueImpact: {
        amount: 99,
        currency: 'usd',
      },
      details: {
        failureReason: 'Your card was declined',
        failureCode: 'card_declined',
        failureCategory: 'card_declined',
        attemptCount: 1,
      },
      stripeEventType: 'invoice.payment_failed',
    } as any);

    const putEventSpy = vi.spyOn(eventStore, 'putEvent').mockResolvedValue();

    const event = {
      body: payload,
      headers: { 'stripe-signature': signature },
      requestContext: { identity: { sourceIp: '192.168.1.1' } },
    } as any;

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(putEventSpy).toHaveBeenCalledOnce();
    
    const storedEvent = putEventSpy.mock.calls[0][0];
    expect(storedEvent.eventType).toBe('failed_payment');
    expect(storedEvent.customerId).toBe('cus_test_failed');
  });
});
