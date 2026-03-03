/**
 * Unit tests for revenue signal extraction
 */

import { describe, it, expect } from 'vitest';
import Stripe from 'stripe';
import {
  extractRevenueSignal,
  extractExpansionSignal,
  extractChurnSignal,
  extractFailedPaymentSignal,
} from '../signal-extractor.js';

describe('Expansion Signal Extraction', () => {
  it('should extract plan upgrade from $99 to $199', () => {
    const event: Stripe.Event = {
      id: 'evt_test_expansion_1',
      object: 'event',
      type: 'customer.subscription.updated',
      created: 1234567890,
      data: {
        object: {
          id: 'sub_123',
          object: 'subscription',
          customer: 'cus_123',
          currency: 'usd',
          items: {
            object: 'list',
            data: [
              {
                id: 'si_123',
                object: 'subscription_item',
                quantity: 1,
                price: {
                  id: 'price_199',
                  object: 'price',
                  unit_amount: 19900,
                  currency: 'usd',
                  recurring: { interval: 'month' },
                },
              },
            ],
          },
        } as Stripe.Subscription,
        previous_attributes: {
          items: {
            object: 'list',
            data: [
              {
                id: 'si_123',
                object: 'subscription_item',
                quantity: 1,
                price: {
                  id: 'price_99',
                  object: 'price',
                  unit_amount: 9900,
                  currency: 'usd',
                  recurring: { interval: 'month' },
                },
              },
            ],
          },
        } as Partial<Stripe.Subscription>,
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      api_version: '2023-10-16',
    };

    const signal = extractExpansionSignal(event);

    expect(signal).toBeDefined();
    expect(signal?.eventType).toBe('expansion');
    expect(signal?.customerId).toBe('cus_123');
    expect(signal?.revenueImpact.oldMrr).toBe(99);
    expect(signal?.revenueImpact.newMrr).toBe(199);
    expect(signal?.details).toMatchObject({
      changeType: 'plan_upgrade',
      oldPlanId: 'price_99',
      newPlanId: 'price_199',
    });
  });

  it('should extract quantity increase from 5 to 10 seats', () => {
    const event: Stripe.Event = {
      id: 'evt_test_expansion_2',
      object: 'event',
      type: 'customer.subscription.updated',
      created: 1234567890,
      data: {
        object: {
          id: 'sub_123',
          object: 'subscription',
          customer: 'cus_123',
          currency: 'usd',
          items: {
            object: 'list',
            data: [
              {
                id: 'si_123',
                object: 'subscription_item',
                quantity: 10,
                price: {
                  id: 'price_per_seat',
                  object: 'price',
                  unit_amount: 2000,
                  currency: 'usd',
                  recurring: { interval: 'month' },
                },
              },
            ],
          },
        } as Stripe.Subscription,
        previous_attributes: {
          items: {
            object: 'list',
            data: [
              {
                id: 'si_123',
                object: 'subscription_item',
                quantity: 5,
                price: {
                  id: 'price_per_seat',
                  object: 'price',
                  unit_amount: 2000,
                  currency: 'usd',
                  recurring: { interval: 'month' },
                },
              },
            ],
          },
        } as Partial<Stripe.Subscription>,
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      api_version: '2023-10-16',
    };

    const signal = extractExpansionSignal(event);

    expect(signal).toBeDefined();
    expect(signal?.eventType).toBe('expansion');
    expect(signal?.revenueImpact.oldMrr).toBe(100);
    expect(signal?.revenueImpact.newMrr).toBe(200);
    expect(signal?.details).toMatchObject({
      changeType: 'quantity_increase',
      oldQuantity: 5,
      newQuantity: 10,
    });
  });

  it('should extract additional product addition', () => {
    const event: Stripe.Event = {
      id: 'evt_test_expansion_3',
      object: 'event',
      type: 'customer.subscription.updated',
      created: 1234567890,
      data: {
        object: {
          id: 'sub_123',
          object: 'subscription',
          customer: 'cus_123',
          currency: 'usd',
          items: {
            object: 'list',
            data: [
              {
                id: 'si_123',
                object: 'subscription_item',
                quantity: 1,
                price: {
                  id: 'price_base',
                  object: 'price',
                  unit_amount: 9900,
                  currency: 'usd',
                  recurring: { interval: 'month' },
                },
              },
              {
                id: 'si_124',
                object: 'subscription_item',
                quantity: 1,
                price: {
                  id: 'price_addon',
                  object: 'price',
                  unit_amount: 4900,
                  currency: 'usd',
                  recurring: { interval: 'month' },
                },
              },
            ],
          },
        } as Stripe.Subscription,
        previous_attributes: {
          items: {
            object: 'list',
            data: [
              {
                id: 'si_123',
                object: 'subscription_item',
                quantity: 1,
                price: {
                  id: 'price_base',
                  object: 'price',
                  unit_amount: 9900,
                  currency: 'usd',
                  recurring: { interval: 'month' },
                },
              },
            ],
          },
        } as Partial<Stripe.Subscription>,
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      api_version: '2023-10-16',
    };

    const signal = extractExpansionSignal(event);

    expect(signal).toBeDefined();
    expect(signal?.eventType).toBe('expansion');
    expect(signal?.revenueImpact.oldMrr).toBe(99);
    expect(signal?.revenueImpact.newMrr).toBe(148);
    expect(signal?.details).toMatchObject({
      changeType: 'additional_product',
      additionalProducts: ['price_addon'],
    });
  });

  it('should not create event for subscription update with no MRR change', () => {
    const event: Stripe.Event = {
      id: 'evt_test_no_change',
      object: 'event',
      type: 'customer.subscription.updated',
      created: 1234567890,
      data: {
        object: {
          id: 'sub_123',
          object: 'subscription',
          customer: 'cus_123',
          currency: 'usd',
          items: {
            object: 'list',
            data: [
              {
                id: 'si_123',
                object: 'subscription_item',
                quantity: 1,
                price: {
                  id: 'price_99',
                  object: 'price',
                  unit_amount: 9900,
                  currency: 'usd',
                  recurring: { interval: 'month' },
                },
              },
            ],
          },
        } as Stripe.Subscription,
        previous_attributes: {
          items: {
            object: 'list',
            data: [
              {
                id: 'si_123',
                object: 'subscription_item',
                quantity: 1,
                price: {
                  id: 'price_99',
                  object: 'price',
                  unit_amount: 9900,
                  currency: 'usd',
                  recurring: { interval: 'month' },
                },
              },
            ],
          },
        } as Partial<Stripe.Subscription>,
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      api_version: '2023-10-16',
    };

    const signal = extractExpansionSignal(event);

    expect(signal).toBeNull();
  });
});

describe('Churn Signal Extraction', () => {
  it('should extract immediate cancellation', () => {
    const now = Math.floor(Date.now() / 1000);
    const event: Stripe.Event = {
      id: 'evt_test_churn_1',
      object: 'event',
      type: 'customer.subscription.deleted',
      created: now,
      data: {
        object: {
          id: 'sub_123',
          object: 'subscription',
          customer: 'cus_123',
          currency: 'usd',
          canceled_at: now,
          current_period_end: now + 86400,
          cancel_at_period_end: false,
          items: {
            object: 'list',
            data: [
              {
                id: 'si_123',
                object: 'subscription_item',
                quantity: 1,
                price: {
                  id: 'price_99',
                  object: 'price',
                  unit_amount: 9900,
                  currency: 'usd',
                  recurring: { interval: 'month' },
                },
              },
            ],
          },
        } as Stripe.Subscription,
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      api_version: '2023-10-16',
    };

    const signal = extractChurnSignal(event);

    expect(signal).toBeDefined();
    expect(signal.eventType).toBe('churn');
    expect(signal.customerId).toBe('cus_123');
    expect(signal.revenueImpact.oldMrr).toBe(99);
    expect(signal.revenueImpact.newMrr).toBe(0);
    expect(signal.details).toMatchObject({
      cancellationType: 'immediate',
      mrrLost: 99,
    });
  });

  it('should extract end-of-period cancellation', () => {
    const now = Math.floor(Date.now() / 1000);
    const event: Stripe.Event = {
      id: 'evt_test_churn_2',
      object: 'event',
      type: 'customer.subscription.deleted',
      created: now,
      data: {
        object: {
          id: 'sub_123',
          object: 'subscription',
          customer: 'cus_123',
          currency: 'usd',
          canceled_at: now,
          current_period_end: now + 86400,
          cancel_at_period_end: true,
          items: {
            object: 'list',
            data: [
              {
                id: 'si_123',
                object: 'subscription_item',
                quantity: 1,
                price: {
                  id: 'price_199',
                  object: 'price',
                  unit_amount: 19900,
                  currency: 'usd',
                  recurring: { interval: 'month' },
                },
              },
            ],
          },
        } as Stripe.Subscription,
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      api_version: '2023-10-16',
    };

    const signal = extractChurnSignal(event);

    expect(signal).toBeDefined();
    expect(signal.details).toMatchObject({
      cancellationType: 'end_of_period',
      mrrLost: 199,
    });
  });

  it('should extract cancellation with reason "too_expensive"', () => {
    const now = Math.floor(Date.now() / 1000);
    const event: Stripe.Event = {
      id: 'evt_test_churn_3',
      object: 'event',
      type: 'customer.subscription.deleted',
      created: now,
      data: {
        object: {
          id: 'sub_123',
          object: 'subscription',
          customer: 'cus_123',
          currency: 'usd',
          canceled_at: now,
          current_period_end: now + 86400,
          cancel_at_period_end: false,
          cancellation_details: {
            reason: 'too_expensive',
          },
          items: {
            object: 'list',
            data: [
              {
                id: 'si_123',
                object: 'subscription_item',
                quantity: 1,
                price: {
                  id: 'price_99',
                  object: 'price',
                  unit_amount: 9900,
                  currency: 'usd',
                  recurring: { interval: 'month' },
                },
              },
            ],
          },
        } as Stripe.Subscription,
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      api_version: '2023-10-16',
    };

    const signal = extractChurnSignal(event);

    expect(signal).toBeDefined();
    expect(signal.details).toMatchObject({
      cancellationReason: 'too_expensive',
    });
  });

  it('should extract cancellation without reason', () => {
    const now = Math.floor(Date.now() / 1000);
    const event: Stripe.Event = {
      id: 'evt_test_churn_4',
      object: 'event',
      type: 'customer.subscription.deleted',
      created: now,
      data: {
        object: {
          id: 'sub_123',
          object: 'subscription',
          customer: 'cus_123',
          currency: 'usd',
          canceled_at: now,
          current_period_end: now + 86400,
          cancel_at_period_end: false,
          items: {
            object: 'list',
            data: [
              {
                id: 'si_123',
                object: 'subscription_item',
                quantity: 1,
                price: {
                  id: 'price_99',
                  object: 'price',
                  unit_amount: 9900,
                  currency: 'usd',
                  recurring: { interval: 'month' },
                },
              },
            ],
          },
        } as Stripe.Subscription,
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      api_version: '2023-10-16',
    };

    const signal = extractChurnSignal(event);

    expect(signal).toBeDefined();
    expect(signal.details.cancellationReason).toBeUndefined();
  });
});

describe('Failed Payment Signal Extraction', () => {
  it('should extract card_declined failure', () => {
    const event: Stripe.Event = {
      id: 'evt_test_failed_1',
      object: 'event',
      type: 'invoice.payment_failed',
      created: 1234567890,
      data: {
        object: {
          id: 'in_123',
          object: 'invoice',
          customer: 'cus_123',
          subscription: 'sub_123',
          currency: 'usd',
          amount_due: 9900,
          attempt_count: 1,
          last_finalization_error: {
            code: 'card_declined',
            message: 'Your card was declined',
          },
        } as Stripe.Invoice,
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      api_version: '2023-10-16',
    };

    const signal = extractFailedPaymentSignal(event);

    expect(signal).toBeDefined();
    expect(signal.eventType).toBe('failed_payment');
    expect(signal.customerId).toBe('cus_123');
    expect(signal.revenueImpact.amount).toBe(9900);
    expect(signal.details).toMatchObject({
      failureCategory: 'card_declined',
      failureCode: 'card_declined',
      attemptCount: 1,
    });
  });

  it('should extract expired_card failure', () => {
    const event: Stripe.Event = {
      id: 'evt_test_failed_2',
      object: 'event',
      type: 'invoice.payment_failed',
      created: 1234567890,
      data: {
        object: {
          id: 'in_123',
          object: 'invoice',
          customer: 'cus_123',
          subscription: 'sub_123',
          currency: 'usd',
          amount_due: 19900,
          attempt_count: 1,
          last_finalization_error: {
            code: 'expired_card',
            message: 'Your card has expired',
          },
        } as Stripe.Invoice,
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      api_version: '2023-10-16',
    };

    const signal = extractFailedPaymentSignal(event);

    expect(signal).toBeDefined();
    expect(signal.details).toMatchObject({
      failureCategory: 'expired_card',
      failureCode: 'expired_card',
    });
  });

  it('should extract insufficient_funds failure', () => {
    const event: Stripe.Event = {
      id: 'evt_test_failed_3',
      object: 'event',
      type: 'invoice.payment_failed',
      created: 1234567890,
      data: {
        object: {
          id: 'in_123',
          object: 'invoice',
          customer: 'cus_123',
          subscription: 'sub_123',
          currency: 'usd',
          amount_due: 9900,
          attempt_count: 2,
          last_finalization_error: {
            code: 'insufficient_funds',
            message: 'Insufficient funds',
          },
        } as Stripe.Invoice,
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      api_version: '2023-10-16',
    };

    const signal = extractFailedPaymentSignal(event);

    expect(signal).toBeDefined();
    expect(signal.details).toMatchObject({
      failureCategory: 'insufficient_funds',
      failureCode: 'insufficient_funds',
      attemptCount: 2,
    });
  });

  it('should categorize unknown failure code as "other"', () => {
    const event: Stripe.Event = {
      id: 'evt_test_failed_4',
      object: 'event',
      type: 'invoice.payment_failed',
      created: 1234567890,
      data: {
        object: {
          id: 'in_123',
          object: 'invoice',
          customer: 'cus_123',
          subscription: 'sub_123',
          currency: 'usd',
          amount_due: 9900,
          attempt_count: 1,
          last_finalization_error: {
            code: 'processing_error',
            message: 'An error occurred while processing your card',
          },
        } as Stripe.Invoice,
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      api_version: '2023-10-16',
    };

    const signal = extractFailedPaymentSignal(event);

    expect(signal).toBeDefined();
    expect(signal.details).toMatchObject({
      failureCategory: 'other',
      failureCode: 'processing_error',
    });
  });

  it('should track multiple retry attempts for same subscription', () => {
    const event: Stripe.Event = {
      id: 'evt_test_failed_5',
      object: 'event',
      type: 'invoice.payment_failed',
      created: 1234567890,
      data: {
        object: {
          id: 'in_123',
          object: 'invoice',
          customer: 'cus_123',
          subscription: 'sub_123',
          currency: 'usd',
          amount_due: 9900,
          attempt_count: 3,
          next_payment_attempt: 1234657890,
          last_finalization_error: {
            code: 'card_declined',
            message: 'Your card was declined',
          },
        } as Stripe.Invoice,
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      api_version: '2023-10-16',
    };

    const signal = extractFailedPaymentSignal(event);

    expect(signal).toBeDefined();
    expect(signal.details).toMatchObject({
      attemptCount: 3,
      nextRetryAt: 1234657890,
    });
  });
});

describe('Event Filtering', () => {
  it('should return null for non-revenue event types', () => {
    const event: Stripe.Event = {
      id: 'evt_test_other',
      object: 'event',
      type: 'customer.created',
      created: 1234567890,
      data: {
        object: {
          id: 'cus_123',
          object: 'customer',
        } as Stripe.Customer,
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      api_version: '2023-10-16',
    };

    const signal = extractRevenueSignal(event);

    expect(signal).toBeNull();
  });

  it('should process customer.subscription.updated events', () => {
    const event: Stripe.Event = {
      id: 'evt_test_sub_updated',
      object: 'event',
      type: 'customer.subscription.updated',
      created: 1234567890,
      data: {
        object: {
          id: 'sub_123',
          object: 'subscription',
          customer: 'cus_123',
          currency: 'usd',
          items: {
            object: 'list',
            data: [
              {
                id: 'si_123',
                object: 'subscription_item',
                quantity: 1,
                price: {
                  id: 'price_199',
                  object: 'price',
                  unit_amount: 19900,
                  currency: 'usd',
                  recurring: { interval: 'month' },
                },
              },
            ],
          },
        } as Stripe.Subscription,
        previous_attributes: {
          items: {
            object: 'list',
            data: [
              {
                id: 'si_123',
                object: 'subscription_item',
                quantity: 1,
                price: {
                  id: 'price_99',
                  object: 'price',
                  unit_amount: 9900,
                  currency: 'usd',
                  recurring: { interval: 'month' },
                },
              },
            ],
          },
        } as Partial<Stripe.Subscription>,
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      api_version: '2023-10-16',
    };

    const signal = extractRevenueSignal(event);

    expect(signal).toBeDefined();
    expect(signal?.eventType).toBe('expansion');
  });

  it('should process customer.subscription.deleted events', () => {
    const now = Math.floor(Date.now() / 1000);
    const event: Stripe.Event = {
      id: 'evt_test_sub_deleted',
      object: 'event',
      type: 'customer.subscription.deleted',
      created: now,
      data: {
        object: {
          id: 'sub_123',
          object: 'subscription',
          customer: 'cus_123',
          currency: 'usd',
          canceled_at: now,
          current_period_end: now + 86400,
          items: {
            object: 'list',
            data: [
              {
                id: 'si_123',
                object: 'subscription_item',
                quantity: 1,
                price: {
                  id: 'price_99',
                  object: 'price',
                  unit_amount: 9900,
                  currency: 'usd',
                  recurring: { interval: 'month' },
                },
              },
            ],
          },
        } as Stripe.Subscription,
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      api_version: '2023-10-16',
    };

    const signal = extractRevenueSignal(event);

    expect(signal).toBeDefined();
    expect(signal?.eventType).toBe('churn');
  });

  it('should process invoice.payment_failed events', () => {
    const event: Stripe.Event = {
      id: 'evt_test_payment_failed',
      object: 'event',
      type: 'invoice.payment_failed',
      created: 1234567890,
      data: {
        object: {
          id: 'in_123',
          object: 'invoice',
          customer: 'cus_123',
          subscription: 'sub_123',
          currency: 'usd',
          amount_due: 9900,
          attempt_count: 1,
          last_finalization_error: {
            code: 'card_declined',
            message: 'Your card was declined',
          },
        } as Stripe.Invoice,
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      api_version: '2023-10-16',
    };

    const signal = extractRevenueSignal(event);

    expect(signal).toBeDefined();
    expect(signal?.eventType).toBe('failed_payment');
  });
});
