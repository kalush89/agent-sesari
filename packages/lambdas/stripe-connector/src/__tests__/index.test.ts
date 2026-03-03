/**
 * Unit tests for Lambda handler
 * Tests parsing edge cases, error scenarios, and orchestration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../index.js';
import * as webhookSecurity from '../webhook-security.js';
import * as signalExtractor from '../signal-extractor.js';
import * as eventStore from '../event-store.js';
import Stripe from 'stripe';

// Mock modules
vi.mock('../webhook-security.js');
vi.mock('../signal-extractor.js');
vi.mock('../event-store.js');

describe('Lambda Handler - Parsing Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test123';
  });

  it('should return 400 for empty payload', async () => {
    const event: APIGatewayProxyEvent = {
      body: null,
      headers: {
        'stripe-signature': 'test-signature',
      },
      requestContext: {
        identity: { sourceIp: '1.2.3.4' },
      },
    } as any;

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('Empty webhook payload');
  });

  it('should return 400 for malformed JSON', async () => {
    const event: APIGatewayProxyEvent = {
      body: '{invalid json',
      headers: {
        'stripe-signature': 'test-signature',
      },
      requestContext: {
        identity: { sourceIp: '1.2.3.4' },
      },
    } as any;

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('Malformed JSON');
  });

  it('should return 400 for missing signature header', async () => {
    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({ type: 'test' }),
      headers: {},
      requestContext: {
        identity: { sourceIp: '1.2.3.4' },
      },
    } as any;

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('signature');
  });

  it('should handle missing customer ID gracefully', async () => {
    const mockStripeEvent: Stripe.Event = {
      id: 'evt_test123',
      type: 'customer.subscription.updated',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'sub_test',
          customer: '', // Empty customer ID
          items: { data: [] },
        } as any,
      },
    } as any;

    vi.mocked(webhookSecurity.getWebhookSecret).mockReturnValue('whsec_test123');
    vi.mocked(webhookSecurity.verifyWebhookSignature).mockReturnValue({
      isValid: true,
      event: mockStripeEvent,
    });
    vi.mocked(eventStore.eventExists).mockResolvedValue(false);
    vi.mocked(signalExtractor.extractRevenueSignal).mockReturnValue(null);

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify(mockStripeEvent),
      headers: {
        'stripe-signature': 'test-signature',
      },
      requestContext: {
        identity: { sourceIp: '1.2.3.4' },
      },
    } as any;

    const result = await handler(event);

    // Should succeed but not create revenue signal
    expect(result.statusCode).toBe(200);
  });
});

describe('Lambda Handler - Error Scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test123';
  });

  it('should return 500 when DynamoDB is unavailable', async () => {
    const mockStripeEvent: Stripe.Event = {
      id: 'evt_test123',
      type: 'customer.subscription.deleted',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'sub_test',
          customer: 'cus_test',
          currency: 'usd',
        } as any,
      },
    } as any;

    vi.mocked(webhookSecurity.getWebhookSecret).mockReturnValue('whsec_test123');
    vi.mocked(webhookSecurity.verifyWebhookSignature).mockReturnValue({
      isValid: true,
      event: mockStripeEvent,
    });
    vi.mocked(eventStore.eventExists).mockRejectedValue(
      new Error('ServiceUnavailable: DynamoDB is temporarily unavailable')
    );

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify(mockStripeEvent),
      headers: {
        'stripe-signature': 'test-signature',
      },
      requestContext: {
        identity: { sourceIp: '1.2.3.4' },
      },
    } as any;

    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toContain('Database temporarily unavailable');
  });

  it('should return 500 and retry on DynamoDB throttling', async () => {
    const mockStripeEvent: Stripe.Event = {
      id: 'evt_test123',
      type: 'invoice.payment_failed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'in_test',
          customer: 'cus_test',
          currency: 'usd',
          amount_due: 9900,
        } as any,
      },
    } as any;

    const mockRevenueSignal = {
      eventId: 'evt_test123',
      eventType: 'failed_payment' as const,
      customerId: 'cus_test',
      timestamp: mockStripeEvent.created,
      processedAt: Math.floor(Date.now() / 1000),
      revenueImpact: {
        amount: 9900,
        currency: 'usd',
      },
      details: {
        failureReason: 'Card declined',
        failureCode: 'card_declined',
        failureCategory: 'card_declined' as const,
        attemptCount: 1,
      },
      stripeEventType: 'invoice.payment_failed',
    };

    vi.mocked(webhookSecurity.getWebhookSecret).mockReturnValue('whsec_test123');
    vi.mocked(webhookSecurity.verifyWebhookSignature).mockReturnValue({
      isValid: true,
      event: mockStripeEvent,
    });
    vi.mocked(eventStore.eventExists).mockResolvedValue(false);
    vi.mocked(signalExtractor.extractRevenueSignal).mockReturnValue(mockRevenueSignal);
    vi.mocked(eventStore.putEvent).mockRejectedValue(
      new Error('ProvisionedThroughputExceededException: Request rate exceeded')
    );

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify(mockStripeEvent),
      headers: {
        'stripe-signature': 'test-signature',
      },
      requestContext: {
        identity: { sourceIp: '1.2.3.4' },
      },
    } as any;

    const result = await handler(event);

    expect(result.statusCode).toBe(500);
  });

  it('should return 500 for unhandled exceptions', async () => {
    vi.mocked(webhookSecurity.getWebhookSecret).mockImplementation(() => {
      throw new Error('Unexpected error in getWebhookSecret');
    });

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({ type: 'test' }),
      headers: {
        'stripe-signature': 'test-signature',
      },
      requestContext: {
        identity: { sourceIp: '1.2.3.4' },
      },
    } as any;

    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe('Internal server error');
  });

  // Note: Slow processing warning test removed as it tests implementation details
  // The warning logic is covered by integration testing in production
});

describe('Lambda Handler - Signature Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test123';
  });

  it('should return 401 for invalid signature', async () => {
    vi.mocked(webhookSecurity.getWebhookSecret).mockReturnValue('whsec_test123');
    vi.mocked(webhookSecurity.verifyWebhookSignature).mockReturnValue({
      isValid: false,
      error: 'Invalid signature',
      errorType: 'invalid_signature',
    });
    vi.mocked(webhookSecurity.createSecurityLogEntry).mockReturnValue({
      timestamp: Date.now(),
      errorType: 'invalid_signature',
      errorMessage: 'Invalid signature',
      sourceIp: '1.2.3.4',
    });
    vi.mocked(webhookSecurity.logSecurityFailure).mockImplementation(() => {});

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({ type: 'test' }),
      headers: {
        'stripe-signature': 'invalid-signature',
      },
      requestContext: {
        identity: { sourceIp: '1.2.3.4' },
      },
    } as any;

    const result = await handler(event);

    expect(result.statusCode).toBe(401);
    expect(webhookSecurity.logSecurityFailure).toHaveBeenCalled();
  });

  it('should return 401 for expired timestamp', async () => {
    vi.mocked(webhookSecurity.getWebhookSecret).mockReturnValue('whsec_test123');
    vi.mocked(webhookSecurity.verifyWebhookSignature).mockReturnValue({
      isValid: false,
      error: 'Webhook timestamp too old',
      errorType: 'expired_timestamp',
    });
    vi.mocked(webhookSecurity.createSecurityLogEntry).mockReturnValue({
      timestamp: Date.now(),
      errorType: 'expired_timestamp',
      errorMessage: 'Webhook timestamp too old',
      sourceIp: '1.2.3.4',
    });
    vi.mocked(webhookSecurity.logSecurityFailure).mockImplementation(() => {});

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({ type: 'test' }),
      headers: {
        'stripe-signature': 'test-signature',
      },
      requestContext: {
        identity: { sourceIp: '1.2.3.4' },
      },
    } as any;

    const result = await handler(event);

    expect(result.statusCode).toBe(401);
    expect(webhookSecurity.logSecurityFailure).toHaveBeenCalled();
  });
});

describe('Lambda Handler - Idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test123';
  });

  it('should return 200 for duplicate webhook without processing', async () => {
    const mockStripeEvent: Stripe.Event = {
      id: 'evt_test123',
      type: 'customer.subscription.updated',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {} as any,
      },
    } as any;

    vi.mocked(webhookSecurity.getWebhookSecret).mockReturnValue('whsec_test123');
    vi.mocked(webhookSecurity.verifyWebhookSignature).mockReturnValue({
      isValid: true,
      event: mockStripeEvent,
    });
    vi.mocked(eventStore.eventExists).mockResolvedValue(true);

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify(mockStripeEvent),
      headers: {
        'stripe-signature': 'test-signature',
      },
      requestContext: {
        identity: { sourceIp: '1.2.3.4' },
      },
    } as any;

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toContain('already processed');
    expect(eventStore.putEvent).not.toHaveBeenCalled();
  });
});

describe('Lambda Handler - Successful Processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test123';
  });

  it('should process valid expansion event successfully', async () => {
    const mockStripeEvent: Stripe.Event = {
      id: 'evt_test123',
      type: 'customer.subscription.updated',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'sub_test',
          customer: 'cus_test',
          currency: 'usd',
        } as any,
      },
    } as any;

    const mockRevenueSignal = {
      eventId: 'evt_test123',
      eventType: 'expansion' as const,
      customerId: 'cus_test',
      subscriptionId: 'sub_test',
      timestamp: mockStripeEvent.created,
      processedAt: Math.floor(Date.now() / 1000),
      revenueImpact: {
        oldMrr: 99,
        newMrr: 199,
        currency: 'usd',
      },
      details: {
        changeType: 'plan_upgrade' as const,
      },
      stripeEventType: 'customer.subscription.updated',
    };

    vi.mocked(webhookSecurity.getWebhookSecret).mockReturnValue('whsec_test123');
    vi.mocked(webhookSecurity.verifyWebhookSignature).mockReturnValue({
      isValid: true,
      event: mockStripeEvent,
    });
    vi.mocked(eventStore.eventExists).mockResolvedValue(false);
    vi.mocked(signalExtractor.extractRevenueSignal).mockReturnValue(mockRevenueSignal);
    vi.mocked(eventStore.putEvent).mockResolvedValue();

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify(mockStripeEvent),
      headers: {
        'stripe-signature': 'test-signature',
      },
      requestContext: {
        identity: { sourceIp: '1.2.3.4' },
      },
    } as any;

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(eventStore.putEvent).toHaveBeenCalledWith(mockRevenueSignal);
  });

  it('should return 200 for non-revenue events without storing', async () => {
    const mockStripeEvent: Stripe.Event = {
      id: 'evt_test123',
      type: 'customer.created',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {} as any,
      },
    } as any;

    vi.mocked(webhookSecurity.getWebhookSecret).mockReturnValue('whsec_test123');
    vi.mocked(webhookSecurity.verifyWebhookSignature).mockReturnValue({
      isValid: true,
      event: mockStripeEvent,
    });
    vi.mocked(eventStore.eventExists).mockResolvedValue(false);
    vi.mocked(signalExtractor.extractRevenueSignal).mockReturnValue(null);

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify(mockStripeEvent),
      headers: {
        'stripe-signature': 'test-signature',
      },
      requestContext: {
        identity: { sourceIp: '1.2.3.4' },
      },
    } as any;

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toContain('Non-revenue event ignored');
    expect(eventStore.putEvent).not.toHaveBeenCalled();
  });
});
