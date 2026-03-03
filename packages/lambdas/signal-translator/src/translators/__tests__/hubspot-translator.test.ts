/**
 * Unit tests for HubSpot Signal Translator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HubSpotSignalTranslator, RelationshipSignalEvent } from '../hubspot-translator';

describe('HubSpotSignalTranslator', () => {
  let translator: HubSpotSignalTranslator;

  beforeEach(() => {
    translator = new HubSpotSignalTranslator();
    process.env.SIGNAL_TTL_DAYS = '90';
  });

  describe('validate', () => {
    it('should return true for valid signal', () => {
      const signal: RelationshipSignalEvent = {
        eventId: 'evt_123',
        eventType: 'deal_progression',
        companyId: 'comp_123',
        contactId: 'cont_123',
        dealId: 'deal_123',
        timestamp: Date.now(),
        processedAt: Date.now(),
        details: {
          oldStage: 'qualification',
          newStage: 'proposal',
          isRegression: false,
          dealValue: 50000,
          currency: 'USD',
          dealName: 'Enterprise Deal',
        },
        hubspotEventType: 'deal.propertyChange',
      };

      expect(translator.validate(signal)).toBe(true);
    });

    it('should return false when eventId is missing', () => {
      const signal = {
        eventType: 'deal_progression',
        companyId: 'comp_123',
        timestamp: Date.now(),
        processedAt: Date.now(),
        details: {},
      } as RelationshipSignalEvent;

      expect(translator.validate(signal)).toBe(false);
    });

    it('should return false when companyId is missing', () => {
      const signal = {
        eventId: 'evt_123',
        eventType: 'deal_progression',
        timestamp: Date.now(),
        processedAt: Date.now(),
        details: {},
      } as RelationshipSignalEvent;

      expect(translator.validate(signal)).toBe(false);
    });

    it('should return false when timestamp is invalid', () => {
      const signal: RelationshipSignalEvent = {
        eventId: 'evt_123',
        eventType: 'deal_progression',
        companyId: 'comp_123',
        timestamp: 0,
        processedAt: Date.now(),
        details: {} as any,
      };

      expect(translator.validate(signal)).toBe(false);
    });
  });

  describe('translate', () => {
    it('should translate deal progression signal correctly', async () => {
      const signal: RelationshipSignalEvent = {
        eventId: 'evt_123',
        eventType: 'deal_progression',
        companyId: 'comp_123',
        contactId: 'cont_123',
        dealId: 'deal_123',
        timestamp: 1700000000000,
        processedAt: 1700000100000,
        details: {
          oldStage: 'qualification',
          newStage: 'proposal',
          isRegression: false,
          dealValue: 50000,
          currency: 'USD',
          dealName: 'Enterprise Deal',
        },
      };

      const result = await translator.translate(signal);

      expect(result).not.toBeNull();
      expect(result?.category).toBe('relationship');
      expect(result?.eventType).toBe('relationship.deal_advanced');
      expect(result?.entity.platformIds.hubspot).toBe('comp_123');
      expect(result?.source.platform).toBe('hubspot');
      expect(result?.impact.metrics.relationship?.dealValue).toBe(50000);
      expect(result?.platformDetails).toHaveProperty('dealId', 'deal_123');
      expect(result?.platformDetails).toHaveProperty('dealStage', 'proposal');
      expect(result?.platformDetails).toHaveProperty('dealName', 'Enterprise Deal');
    });

    it('should translate deal regression signal correctly', async () => {
      const signal: RelationshipSignalEvent = {
        eventId: 'evt_456',
        eventType: 'deal_progression',
        companyId: 'comp_456',
        dealId: 'deal_456',
        timestamp: 1700000000000,
        processedAt: 1700000100000,
        details: {
          oldStage: 'proposal',
          newStage: 'qualification',
          isRegression: true,
          dealValue: 15000,
          currency: 'USD',
          dealName: 'SMB Deal',
        },
      };

      const result = await translator.translate(signal);

      expect(result).not.toBeNull();
      expect(result?.eventType).toBe('relationship.deal_regressed');
      expect(result?.impact.severity).toBe('high');
    });

    it('should translate communication gap signal correctly', async () => {
      const signal: RelationshipSignalEvent = {
        eventId: 'evt_789',
        eventType: 'communication_gap',
        companyId: 'comp_789',
        contactId: 'cont_789',
        timestamp: 1700000000000,
        processedAt: 1700000100000,
        details: {
          lastCommunicationDate: 1690000000000,
          daysSinceLastContact: 45,
          importanceLevel: 'high',
          relationshipType: 'active_deal',
          dealValue: 100000,
        },
      };

      const result = await translator.translate(signal);

      expect(result).not.toBeNull();
      expect(result?.eventType).toBe('relationship.engagement_gap');
      expect(result?.impact.severity).toBe('high');
      expect(result?.impact.metrics.relationship?.daysSinceContact).toBe(45);
    });

    it('should translate positive sentiment signal correctly', async () => {
      const signal: RelationshipSignalEvent = {
        eventId: 'evt_101',
        eventType: 'sentiment',
        companyId: 'comp_101',
        contactId: 'cont_101',
        timestamp: 1700000000000,
        processedAt: 1700000100000,
        details: {
          sentimentScore: 0.85,
          sentimentCategory: 'positive',
          sourceType: 'email',
          sourceId: 'email_123',
          textExcerpt: 'Great product!',
          keywords: ['great', 'product'],
        },
      };

      const result = await translator.translate(signal);

      expect(result).not.toBeNull();
      expect(result?.eventType).toBe('relationship.sentiment_positive');
      expect(result?.impact.metrics.relationship?.sentimentScore).toBe(0.85);
      expect(result?.platformDetails).toHaveProperty('sourceType', 'email');
      expect(result?.platformDetails).toHaveProperty('keywords');
    });

    it('should translate negative sentiment signal correctly', async () => {
      const signal: RelationshipSignalEvent = {
        eventId: 'evt_102',
        eventType: 'sentiment',
        companyId: 'comp_102',
        timestamp: 1700000000000,
        processedAt: 1700000100000,
        details: {
          sentimentScore: -0.65,
          sentimentCategory: 'negative',
          sourceType: 'call',
          sourceId: 'call_456',
          textExcerpt: 'Not satisfied',
          keywords: ['not', 'satisfied'],
        },
      };

      const result = await translator.translate(signal);

      expect(result).not.toBeNull();
      expect(result?.eventType).toBe('relationship.sentiment_negative');
      expect(result?.impact.severity).toBe('high');
    });

    it('should return null for invalid signal', async () => {
      const signal = {
        eventType: 'deal_progression',
        timestamp: Date.now(),
      } as RelationshipSignalEvent;

      const result = await translator.translate(signal);

      expect(result).toBeNull();
    });
  });

  describe('extractCorrelationKeys', () => {
    it('should extract company and contact IDs', async () => {
      const signal: RelationshipSignalEvent = {
        eventId: 'evt_123',
        eventType: 'deal_progression',
        companyId: 'comp_123',
        contactId: 'cont_123',
        timestamp: Date.now(),
        processedAt: Date.now(),
        details: {} as any,
      };

      const keys = await translator.extractCorrelationKeys(signal);

      expect(keys).toContain('comp_123');
      expect(keys).toContain('cont_123');
    });

    it('should extract only company ID when contact is missing', async () => {
      const signal: RelationshipSignalEvent = {
        eventId: 'evt_123',
        eventType: 'deal_progression',
        companyId: 'comp_123',
        timestamp: Date.now(),
        processedAt: Date.now(),
        details: {} as any,
      };

      const keys = await translator.extractCorrelationKeys(signal);

      expect(keys).toEqual(['comp_123']);
    });
  });
});
