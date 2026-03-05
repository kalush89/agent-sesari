/**
 * Unit tests for growth play determination
 */

import { describe, it, expect } from 'vitest';
import { determineGrowthPlay } from '../growth-play.js';
import type { Universal_Signal } from '../types.js';

describe('Growth Play Determination', () => {
  describe('Revenue signals', () => {
    it('should create growth play for expansion event', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_exp',
        category: 'revenue',
        eventType: 'revenue.expansion',
        entity: {
          primaryKey: 'Acme Corp',
          alternateKeys: [],
          platformIds: { stripe: 'cus_123' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'stripe',
          originalEventType: 'customer.subscription.updated',
          originalEventId: 'evt_123',
        },
        impact: {
          severity: 'high',
          metrics: {},
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const growthPlay = determineGrowthPlay(signal);

      expect(growthPlay.label).toBe('Thank Customer');
      expect(growthPlay.action).toBe('navigate');
      expect(growthPlay.target).toBe('/customers/cus_123');
    });

    it('should create growth play for churn event', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_churn',
        category: 'revenue',
        eventType: 'revenue.churn',
        entity: {
          primaryKey: 'Beta Inc',
          alternateKeys: [],
          platformIds: { stripe: 'cus_456' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'stripe',
          originalEventType: 'customer.subscription.deleted',
          originalEventId: 'evt_456',
        },
        impact: {
          severity: 'critical',
          metrics: {},
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const growthPlay = determineGrowthPlay(signal);

      expect(growthPlay.label).toBe('Review Churn Details');
      expect(growthPlay.action).toBe('navigate');
      expect(growthPlay.target).toBe('/customers/cus_456');
    });

    it('should create growth play for contraction event', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_con',
        category: 'revenue',
        eventType: 'revenue.contraction',
        entity: {
          primaryKey: 'Gamma LLC',
          alternateKeys: [],
          platformIds: { stripe: 'cus_789' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'stripe',
          originalEventType: 'customer.subscription.updated',
          originalEventId: 'evt_789',
        },
        impact: {
          severity: 'high',
          metrics: {},
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const growthPlay = determineGrowthPlay(signal);

      expect(growthPlay.label).toBe('Check on Customer');
      expect(growthPlay.action).toBe('navigate');
      expect(growthPlay.target).toBe('/customers/cus_789');
    });

    it('should create growth play for payment failed event', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_pay',
        category: 'revenue',
        eventType: 'revenue.payment_failed',
        entity: {
          primaryKey: 'Delta Corp',
          alternateKeys: [],
          platformIds: { stripe: 'cus_delta' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'stripe',
          originalEventType: 'invoice.payment_failed',
          originalEventId: 'evt_delta',
        },
        impact: {
          severity: 'high',
          metrics: {},
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const growthPlay = determineGrowthPlay(signal);

      expect(growthPlay.label).toBe('Update Payment Info');
      expect(growthPlay.action).toBe('navigate');
      expect(growthPlay.target).toBe('/customers/cus_delta');
    });

    it('should fallback to customers list when no stripe ID', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_no_id',
        category: 'revenue',
        eventType: 'revenue.expansion',
        entity: {
          primaryKey: 'Epsilon Ltd',
          alternateKeys: [],
          platformIds: {},
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'stripe',
          originalEventType: 'customer.subscription.updated',
          originalEventId: 'evt_epsilon',
        },
        impact: {
          severity: 'medium',
          metrics: {},
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const growthPlay = determineGrowthPlay(signal);

      expect(growthPlay.label).toBe('View Customer');
      expect(growthPlay.action).toBe('navigate');
      expect(growthPlay.target).toBe('/customers');
    });
  });

  describe('Relationship signals', () => {
    it('should create growth play for engagement gap event', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_gap',
        category: 'relationship',
        eventType: 'relationship.engagement_gap',
        entity: {
          primaryKey: 'Zeta Inc',
          alternateKeys: [],
          platformIds: { hubspot: 'contact_123' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'hubspot',
          originalEventType: 'contact.updated',
          originalEventId: 'evt_zeta',
        },
        impact: {
          severity: 'medium',
          metrics: {},
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const growthPlay = determineGrowthPlay(signal);

      expect(growthPlay.label).toBe('Schedule Check-in');
      expect(growthPlay.action).toBe('external');
      expect(growthPlay.target).toBe('https://app.hubspot.com/contacts/0/contact/contact_123');
    });

    it('should create growth play for negative sentiment event', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_sent',
        category: 'relationship',
        eventType: 'relationship.sentiment_negative',
        entity: {
          primaryKey: 'Eta Corp',
          alternateKeys: [],
          platformIds: { hubspot: 'contact_456' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'hubspot',
          originalEventType: 'engagement.created',
          originalEventId: 'evt_eta',
        },
        impact: {
          severity: 'high',
          metrics: {},
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const growthPlay = determineGrowthPlay(signal);

      expect(growthPlay.label).toBe('Address Concerns');
      expect(growthPlay.action).toBe('external');
      expect(growthPlay.target).toBe('https://app.hubspot.com/contacts/0/contact/contact_456');
    });

    it('should create growth play for deal advanced event', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_deal_adv',
        category: 'relationship',
        eventType: 'relationship.deal_advanced',
        entity: {
          primaryKey: 'Theta LLC',
          alternateKeys: [],
          platformIds: { hubspot: 'contact_789' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'hubspot',
          originalEventType: 'deal.updated',
          originalEventId: 'evt_theta',
        },
        impact: {
          severity: 'low',
          metrics: {},
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const growthPlay = determineGrowthPlay(signal);

      expect(growthPlay.label).toBe('View Deal Progress');
      expect(growthPlay.action).toBe('external');
      expect(growthPlay.target).toBe('https://app.hubspot.com/contacts/0/contact/contact_789');
    });

    it('should create growth play for deal regressed event', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_deal_reg',
        category: 'relationship',
        eventType: 'relationship.deal_regressed',
        entity: {
          primaryKey: 'Iota Inc',
          alternateKeys: [],
          platformIds: { hubspot: 'contact_abc' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'hubspot',
          originalEventType: 'deal.updated',
          originalEventId: 'evt_iota',
        },
        impact: {
          severity: 'medium',
          metrics: {},
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const growthPlay = determineGrowthPlay(signal);

      expect(growthPlay.label).toBe('Review Deal Status');
      expect(growthPlay.action).toBe('external');
      expect(growthPlay.target).toBe('https://app.hubspot.com/contacts/0/contact/contact_abc');
    });

    it('should fallback to HubSpot home when no contact ID', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_no_contact',
        category: 'relationship',
        eventType: 'relationship.engagement_gap',
        entity: {
          primaryKey: 'Kappa Corp',
          alternateKeys: [],
          platformIds: {},
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'hubspot',
          originalEventType: 'contact.updated',
          originalEventId: 'evt_kappa',
        },
        impact: {
          severity: 'medium',
          metrics: {},
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const growthPlay = determineGrowthPlay(signal);

      expect(growthPlay.label).toBe('Open HubSpot');
      expect(growthPlay.action).toBe('external');
      expect(growthPlay.target).toBe('https://app.hubspot.com');
    });
  });

  describe('Behavioral signals', () => {
    it('should create growth play for power user event', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_power',
        category: 'behavioral',
        eventType: 'behavioral.power_user',
        entity: {
          primaryKey: 'user@lambda.com',
          alternateKeys: [],
          platformIds: { mixpanel: 'user_123' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'mixpanel',
          originalEventType: 'engagement_spike',
          originalEventId: 'evt_lambda',
        },
        impact: {
          severity: 'low',
          metrics: {},
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const growthPlay = determineGrowthPlay(signal);

      expect(growthPlay.label).toBe('Explore Upsell');
      expect(growthPlay.action).toBe('navigate');
      expect(growthPlay.target).toBe('/users/user_123');
    });

    it('should create growth play for inactivity event', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_inact',
        category: 'behavioral',
        eventType: 'behavioral.inactivity',
        entity: {
          primaryKey: 'user@mu.com',
          alternateKeys: [],
          platformIds: { mixpanel: 'user_456' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'mixpanel',
          originalEventType: 'inactivity_detected',
          originalEventId: 'evt_mu',
        },
        impact: {
          severity: 'medium',
          metrics: {},
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const growthPlay = determineGrowthPlay(signal);

      expect(growthPlay.label).toBe('Re-engage User');
      expect(growthPlay.action).toBe('navigate');
      expect(growthPlay.target).toBe('/users/user_456');
    });

    it('should create growth play for feature adoption drop event', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_drop',
        category: 'behavioral',
        eventType: 'behavioral.feature_adoption_drop',
        entity: {
          primaryKey: 'user@nu.com',
          alternateKeys: [],
          platformIds: { mixpanel: 'user_789' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'mixpanel',
          originalEventType: 'feature_usage_changed',
          originalEventId: 'evt_nu',
        },
        impact: {
          severity: 'medium',
          metrics: {},
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const growthPlay = determineGrowthPlay(signal);

      expect(growthPlay.label).toBe('Check Feature Usage');
      expect(growthPlay.action).toBe('navigate');
      expect(growthPlay.target).toBe('/users/user_789');
    });

    it('should create growth play for engagement spike event', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_spike',
        category: 'behavioral',
        eventType: 'behavioral.engagement_spike',
        entity: {
          primaryKey: 'user@xi.com',
          alternateKeys: [],
          platformIds: { mixpanel: 'user_abc' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'mixpanel',
          originalEventType: 'engagement_spike',
          originalEventId: 'evt_xi',
        },
        impact: {
          severity: 'low',
          metrics: {},
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const growthPlay = determineGrowthPlay(signal);

      expect(growthPlay.label).toBe('Review Engagement');
      expect(growthPlay.action).toBe('navigate');
      expect(growthPlay.target).toBe('/users/user_abc');
    });

    it('should fallback to users list when no mixpanel ID', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_no_user',
        category: 'behavioral',
        eventType: 'behavioral.power_user',
        entity: {
          primaryKey: 'user@omicron.com',
          alternateKeys: [],
          platformIds: {},
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'mixpanel',
          originalEventType: 'engagement_spike',
          originalEventId: 'evt_omicron',
        },
        impact: {
          severity: 'low',
          metrics: {},
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const growthPlay = determineGrowthPlay(signal);

      expect(growthPlay.label).toBe('View Activity');
      expect(growthPlay.action).toBe('navigate');
      expect(growthPlay.target).toBe('/users');
    });
  });
});
