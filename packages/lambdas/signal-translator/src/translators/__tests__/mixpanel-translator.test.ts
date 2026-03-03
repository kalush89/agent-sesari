/**
 * Unit tests for Mixpanel Signal Translator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MixpanelSignalTranslator, BehavioralSignalEvent } from '../mixpanel-translator';

describe('MixpanelSignalTranslator', () => {
  let translator: MixpanelSignalTranslator;

  beforeEach(() => {
    translator = new MixpanelSignalTranslator();
    process.env.SIGNAL_TTL_DAYS = '90';
  });

  describe('validate', () => {
    it('should return true for valid signal', () => {
      const signal: BehavioralSignalEvent = {
        eventId: 'evt_123',
        eventType: 'power_user',
        userId: 'user_123',
        timestamp: Date.now(),
        processedAt: Date.now(),
        details: {
          engagementScore: 95,
          daysActiveInLast30: 28,
          mostUsedFeatures: [
            { feature: 'dashboard', usageCount: 150 },
            { feature: 'reports', usageCount: 80 },
          ],
          totalEventsLast30Days: 500,
          featureDiversity: 12,
          percentileRank: 98,
        },
      };

      expect(translator.validate(signal)).toBe(true);
    });

    it('should return false when eventId is missing', () => {
      const signal = {
        eventType: 'power_user',
        userId: 'user_123',
        timestamp: Date.now(),
        processedAt: Date.now(),
        details: {},
      } as BehavioralSignalEvent;

      expect(translator.validate(signal)).toBe(false);
    });

    it('should return false when userId is missing', () => {
      const signal = {
        eventId: 'evt_123',
        eventType: 'power_user',
        timestamp: Date.now(),
        processedAt: Date.now(),
        details: {},
      } as BehavioralSignalEvent;

      expect(translator.validate(signal)).toBe(false);
    });

    it('should return false when timestamp is invalid', () => {
      const signal: BehavioralSignalEvent = {
        eventId: 'evt_123',
        eventType: 'power_user',
        userId: 'user_123',
        timestamp: 0,
        processedAt: Date.now(),
        details: {} as any,
      };

      expect(translator.validate(signal)).toBe(false);
    });
  });

  describe('translate', () => {
    it('should translate power user signal correctly', async () => {
      const signal: BehavioralSignalEvent = {
        eventId: 'evt_123',
        eventType: 'power_user',
        userId: 'user_123',
        timestamp: 1700000000000,
        processedAt: 1700000100000,
        details: {
          engagementScore: 95,
          daysActiveInLast30: 28,
          mostUsedFeatures: [
            { feature: 'dashboard', usageCount: 150 },
            { feature: 'reports', usageCount: 80 },
          ],
          totalEventsLast30Days: 500,
          featureDiversity: 12,
          percentileRank: 98,
        },
      };

      const result = await translator.translate(signal);

      expect(result).not.toBeNull();
      expect(result?.category).toBe('behavioral');
      expect(result?.eventType).toBe('behavioral.power_user');
      expect(result?.entity.platformIds.mixpanel).toBe('user_123');
      expect(result?.source.platform).toBe('mixpanel');
      expect(result?.impact.metrics.behavioral?.engagementScore).toBe(95);
      expect(result?.impact.metrics.behavioral?.usageFrequency).toBe(500);
      expect(result?.impact.metrics.behavioral?.featureCount).toBe(2);
      expect(result?.platformDetails).toHaveProperty('mostUsedFeatures');
      expect(result?.platformDetails).toHaveProperty('percentileRank', 98);
      expect(result?.impact.severity).toBe('high');
    });

    it('should translate feature adoption drop signal correctly', async () => {
      const signal: BehavioralSignalEvent = {
        eventId: 'evt_456',
        eventType: 'feature_adoption_drop',
        userId: 'user_456',
        timestamp: 1700000000000,
        processedAt: 1700000100000,
        details: {
          feature: 'analytics',
          previousUsageFrequency: 50,
          currentUsageFrequency: 5,
          dropPercentage: 90,
          daysSinceLastUse: 15,
          baselinePeriodDays: 30,
          detectionReason: 'percentage_drop',
        },
      };

      const result = await translator.translate(signal);

      expect(result).not.toBeNull();
      expect(result?.eventType).toBe('behavioral.feature_adoption_drop');
      expect(result?.impact.severity).toBe('high');
      expect(result?.impact.metrics.behavioral?.usageFrequency).toBe(5);
      expect(result?.platformDetails).toHaveProperty('feature', 'analytics');
      expect(result?.platformDetails).toHaveProperty('dropPercentage', 90);
      expect(result?.platformDetails).toHaveProperty('usageCount', 5);
    });

    it('should calculate medium severity for moderate drop', async () => {
      const signal: BehavioralSignalEvent = {
        eventId: 'evt_789',
        eventType: 'feature_adoption_drop',
        userId: 'user_789',
        timestamp: 1700000000000,
        processedAt: 1700000100000,
        details: {
          feature: 'reports',
          previousUsageFrequency: 20,
          currentUsageFrequency: 8,
          dropPercentage: 60,
          daysSinceLastUse: 5,
          baselinePeriodDays: 30,
          detectionReason: 'percentage_drop',
        },
      };

      const result = await translator.translate(signal);

      expect(result).not.toBeNull();
      expect(result?.impact.severity).toBe('medium');
    });

    it('should calculate medium severity for lower percentile power user', async () => {
      const signal: BehavioralSignalEvent = {
        eventId: 'evt_101',
        eventType: 'power_user',
        userId: 'user_101',
        timestamp: 1700000000000,
        processedAt: 1700000100000,
        details: {
          engagementScore: 75,
          daysActiveInLast30: 20,
          mostUsedFeatures: [
            { feature: 'dashboard', usageCount: 50 },
          ],
          totalEventsLast30Days: 200,
          featureDiversity: 5,
          percentileRank: 85,
        },
      };

      const result = await translator.translate(signal);

      expect(result).not.toBeNull();
      expect(result?.impact.severity).toBe('medium');
    });

    it('should return null for invalid signal', async () => {
      const signal = {
        eventType: 'power_user',
        timestamp: Date.now(),
      } as BehavioralSignalEvent;

      const result = await translator.translate(signal);

      expect(result).toBeNull();
    });
  });

  describe('extractCorrelationKeys', () => {
    it('should extract user ID as correlation key', async () => {
      const signal: BehavioralSignalEvent = {
        eventId: 'evt_123',
        eventType: 'power_user',
        userId: 'user_123',
        timestamp: Date.now(),
        processedAt: Date.now(),
        details: {} as any,
      };

      const keys = await translator.extractCorrelationKeys(signal);

      expect(keys).toEqual(['user_123']);
    });
  });
});
