/**
 * Unit tests for Stripe Signal Translator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StripeSignalTranslator, RevenueSignalEvent } from '../stripe-translator';

describe('StripeSignalTranslator', () => {
  let translator: StripeSignalTranslator;

  beforeEach(() => {
    translator = new StripeSignalTranslator();
    process.env.SIGNAL_TTL_DAYS = '90';
  });

  describe('validate', () => {
    it('should return true for valid signal', () => {
      const signal: RevenueSignalEvent = {
        eventId: 'evt_123',
        eventType: 'expansion',
        customerId: 'cus_123',
        subscriptionId: 'sub_123',
        timestamp: Date.now(),
        processedAt: Date.now(),
        revenueImpact: {
          oldMrr: 100,
          newMrr: 200,
          currency: 'usd',
        },
        details: {
          changeType: 'plan_upgrade',
          oldPlanId: 'plan_old',
          newPlanId: 'plan_new',
        },
        stripeEventType: 'customer.subscription.updated',
      };

      expect(translator.validate(signal)).toBe(true);
    });

    it('should return false when eventId is missing', () => {
      const signal = {
        eventType: 'expansion',
        customerId: 'cus_123',
        timestamp: Date.now(),
        processedAt: Date.now(),
        revenueImpact: { currency: 'usd' },
        details: {},
        stripeEventType: 'test',
      } as RevenueSignalEvent;

      expect(translator.validate(signal)).toBe(false);
    });

    it('should return false when customerId is missing', () => {
      const signal = {
        eventId: 'evt_123',
        eventType: 'expansion',
        timestamp: Date.now(),
        processedAt: Date.now(),
        revenueImpact: { currency: 'usd' },
        details: {},
        stripeEventType: 'test',
      } as RevenueSignalEvent;

      expect(translator.validate(signal)).toBe(false);
    });

    it('should return false when timestamp is invalid', () => {
      const signal: RevenueSignalEvent = {
        eventId: 'evt_123',
        eventType: 'expansion',
        customerId: 'cus_123',
        timestamp: 0,
        processedAt: Date.now(),
        revenueImpact: { currency: 'usd' },
        details: {} as any,
        stripeEventType: 'test',
      };

      expect(translator.validate(signal)).toBe(false);
    });

    it('should return false when currency is missing', () => {
      const signal = {
        eventId: 'evt_123',
        eventType: 'expansion',
        customerId: 'cus_123',
        timestamp: Date.now(),
        processedAt: Date.now(),
        revenueImpact: {},
        details: {},
        stripeEventType: 'test',
      } as RevenueSignalEvent;

      expect(translator.validate(signal)).toBe(false);
    });
  });

  describe('translate', () => {
    it('should translate expansion signal correctly', async () => {
      const signal: RevenueSignalEvent = {
        eventId: 'evt_123',
        eventType: 'expansion',
        customerId: 'cus_123',
        subscriptionId: 'sub_123',
        timestamp: 1700000000000,
        processedAt: 1700000100000,
        revenueImpact: {
          oldMrr: 100,
          newMrr: 200,
          amount: 100,
          currency: 'usd',
        },
        details: {
          changeType: 'plan_upgrade',
          oldPlanId: 'plan_old',
          newPlanId: 'plan_new',
          newQuantity: 2,
        },
        stripeEventType: 'customer.subscription.updated',
      };

      const result = await translator.translate(signal);

      expect(result).not.toBeNull();
      expect(result?.category).toBe('revenue');
      expect(result?.eventType).toBe('revenue.expansion');
      expect(result?.entity.platformIds.stripe).toBe('cus_123');
      expect(result?.source.platform).toBe('stripe');
      expect(result?.source.originalEventType).toBe('expansion');
      expect(result?.impact.metrics.revenue?.amount).toBe(100);
      expect(result?.impact.metrics.revenue?.currency).toBe('usd');
      expect(result?.impact.metrics.revenue?.mrrChange).toBe(100);
      expect(result?.platformDetails).toHaveProperty('subscriptionId', 'sub_123');
      expect(result?.platformDetails).toHaveProperty('planId', 'plan_new');
      expect(result?.platformDetails).toHaveProperty('quantity', 2);
    });

    it('should translate churn signal correctly', async () => {
      const signal: RevenueSignalEvent = {
        eventId: 'evt_456',
        eventType: 'churn',
        customerId: 'cus_456',
        subscriptionId: 'sub_456',
        timestamp: 1700000000000,
        processedAt: 1700000100000,
        revenueImpact: {
          oldMrr: 500,
          newMrr: 0,
          currency: 'usd',
        },
        details: {
          cancellationType: 'immediate',
          canceledAt: 1700000000000,
          mrrLost: 500,
        },
        stripeEventType: 'customer.subscription.deleted',
      };

      const result = await translator.translate(signal);

      expect(result).not.toBeNull();
      expect(result?.eventType).toBe('revenue.churn');
      expect(result?.impact.severity).toBe('high');
      expect(result?.platformDetails).toHaveProperty('cancellationType', 'immediate');
    });

    it('should translate failed payment signal correctly', async () => {
      const signal: RevenueSignalEvent = {
        eventId: 'evt_789',
        eventType: 'failed_payment',
        customerId: 'cus_789',
        subscriptionId: 'sub_789',
        timestamp: 1700000000000,
        processedAt: 1700000100000,
        revenueImpact: {
          amount: 99,
          currency: 'usd',
        },
        details: {
          failureReason: 'Card declined',
          failureCode: 'card_declined',
          failureCategory: 'card_declined',
          attemptCount: 1,
          nextRetryAt: 1700086400000,
        },
        stripeEventType: 'invoice.payment_failed',
      };

      const result = await translator.translate(signal);

      expect(result).not.toBeNull();
      expect(result?.eventType).toBe('revenue.payment_failed');
      expect(result?.impact.severity).toBe('high');
      expect(result?.platformDetails).toHaveProperty('failureCode', 'card_declined');
      expect(result?.platformDetails).toHaveProperty('nextRetryAt', 1700086400000);
    });

    it('should return null for invalid signal', async () => {
      const signal = {
        eventType: 'expansion',
        timestamp: Date.now(),
      } as RevenueSignalEvent;

      const result = await translator.translate(signal);

      expect(result).toBeNull();
    });

    it('should use entity mapping when provided', async () => {
      const signal: RevenueSignalEvent = {
        eventId: 'evt_123',
        eventType: 'expansion',
        customerId: 'cus_123',
        timestamp: Date.now(),
        processedAt: Date.now(),
        revenueImpact: {
          currency: 'usd',
          amount: 100,
        },
        details: {
          changeType: 'plan_upgrade',
        },
        stripeEventType: 'test',
      };

      const entityMapping = {
        primaryKey: 'user@example.com',
        alternateKeys: ['alt_123'],
        platformIds: {
          stripe: 'cus_123',
          hubspot: 'hs_123',
        },
        lastUpdated: Date.now(),
        confidence: 'high' as const,
      };

      const result = await translator.translate(signal, entityMapping);

      expect(result).not.toBeNull();
      expect(result?.entity.primaryKey).toBe('user@example.com');
      expect(result?.entity.alternateKeys).toEqual(['alt_123']);
      expect(result?.entity.platformIds.hubspot).toBe('hs_123');
    });
  });

  describe('extractCorrelationKeys', () => {
    it('should extract customer ID as correlation key', async () => {
      const signal: RevenueSignalEvent = {
        eventId: 'evt_123',
        eventType: 'expansion',
        customerId: 'cus_123',
        timestamp: Date.now(),
        processedAt: Date.now(),
        revenueImpact: { currency: 'usd' },
        details: {} as any,
        stripeEventType: 'test',
      };

      const keys = await translator.extractCorrelationKeys(signal);

      expect(keys).toEqual(['cus_123']);
    });
  });
});
