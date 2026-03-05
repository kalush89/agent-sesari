/**
 * Unit Tests for Signal Prioritization
 * 
 * Tests the prioritizeSignals function with various scenarios
 * including edge cases and sorting behavior.
 */

import { describe, it, expect } from 'vitest';
import { prioritizeSignals } from '../signal-prioritization.js';
import type { Universal_Signal, Severity } from '../types.js';

/**
 * Helper to create a test signal with minimal required fields
 */
function createTestSignal(
  severity: Severity,
  occurredAt: number,
  signalId: string = `signal-${Math.random()}`
): Universal_Signal {
  return {
    signalId,
    category: 'revenue',
    eventType: 'revenue.expansion',
    entity: {
      primaryKey: 'customer-123',
      alternateKeys: [],
      platformIds: {}
    },
    occurredAt,
    processedAt: Date.now(),
    source: {
      platform: 'stripe',
      originalEventType: 'customer.subscription.updated',
      originalEventId: 'evt_123'
    },
    impact: {
      severity,
      metrics: {}
    },
    platformDetails: {},
    ttl: Date.now() + 90 * 24 * 60 * 60 * 1000
  };
}

describe('prioritizeSignals', () => {
  describe('empty and small inputs', () => {
    it('should return empty array for empty input', () => {
      const result = prioritizeSignals([]);
      expect(result).toEqual([]);
    });

    it('should return single signal unchanged', () => {
      const signal = createTestSignal('critical', Date.now());
      const result = prioritizeSignals([signal]);
      expect(result).toEqual([signal]);
      expect(result).toHaveLength(1);
    });

    it('should return all signals when input has exactly 10 signals', () => {
      const signals = Array.from({ length: 10 }, (_, i) =>
        createTestSignal('medium', Date.now() - i * 1000, `signal-${i}`)
      );
      const result = prioritizeSignals(signals);
      expect(result).toHaveLength(10);
    });

    it('should return only 10 signals when input has more than 10', () => {
      const signals = Array.from({ length: 15 }, (_, i) =>
        createTestSignal('medium', Date.now() - i * 1000, `signal-${i}`)
      );
      const result = prioritizeSignals(signals);
      expect(result).toHaveLength(10);
    });
  });

  describe('severity-based prioritization', () => {
    it('should prioritize critical over high severity', () => {
      const now = Date.now();
      const critical = createTestSignal('critical', now, 'critical-1');
      const high = createTestSignal('high', now, 'high-1');
      
      const result = prioritizeSignals([high, critical]);
      
      expect(result[0].signalId).toBe('critical-1');
      expect(result[1].signalId).toBe('high-1');
    });

    it('should prioritize high over medium severity', () => {
      const now = Date.now();
      const high = createTestSignal('high', now, 'high-1');
      const medium = createTestSignal('medium', now, 'medium-1');
      
      const result = prioritizeSignals([medium, high]);
      
      expect(result[0].signalId).toBe('high-1');
      expect(result[1].signalId).toBe('medium-1');
    });

    it('should prioritize medium over low severity', () => {
      const now = Date.now();
      const medium = createTestSignal('medium', now, 'medium-1');
      const low = createTestSignal('low', now, 'low-1');
      
      const result = prioritizeSignals([low, medium]);
      
      expect(result[0].signalId).toBe('medium-1');
      expect(result[1].signalId).toBe('low-1');
    });

    it('should correctly order all severity levels', () => {
      const now = Date.now();
      const signals = [
        createTestSignal('low', now, 'low-1'),
        createTestSignal('critical', now, 'critical-1'),
        createTestSignal('medium', now, 'medium-1'),
        createTestSignal('high', now, 'high-1')
      ];
      
      const result = prioritizeSignals(signals);
      
      expect(result[0].signalId).toBe('critical-1');
      expect(result[1].signalId).toBe('high-1');
      expect(result[2].signalId).toBe('medium-1');
      expect(result[3].signalId).toBe('low-1');
    });
  });

  describe('recency-based prioritization', () => {
    it('should prioritize newer signals over older ones with same severity', () => {
      const now = Date.now();
      const oneHourAgo = now - 1 * 60 * 60 * 1000;
      const twoHoursAgo = now - 2 * 60 * 60 * 1000;
      
      const newer = createTestSignal('medium', oneHourAgo, 'newer');
      const older = createTestSignal('medium', twoHoursAgo, 'older');
      
      const result = prioritizeSignals([older, newer]);
      
      expect(result[0].signalId).toBe('newer');
      expect(result[1].signalId).toBe('older');
    });

    it('should handle signals from 24 hours ago', () => {
      const now = Date.now();
      const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
      
      const signal = createTestSignal('medium', twentyFourHoursAgo);
      const result = prioritizeSignals([signal]);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(signal);
    });

    it('should handle very recent signals (just now)', () => {
      const now = Date.now();
      const justNow = now - 1000; // 1 second ago
      
      const signal = createTestSignal('medium', justNow);
      const result = prioritizeSignals([signal]);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(signal);
    });
  });

  describe('combined severity and recency prioritization', () => {
    it('should prioritize recent critical over older critical', () => {
      const now = Date.now();
      const oneHourAgo = now - 1 * 60 * 60 * 1000;
      const fiveHoursAgo = now - 5 * 60 * 60 * 1000;
      
      const recentCritical = createTestSignal('critical', oneHourAgo, 'recent-critical');
      const olderCritical = createTestSignal('critical', fiveHoursAgo, 'older-critical');
      
      const result = prioritizeSignals([olderCritical, recentCritical]);
      
      expect(result[0].signalId).toBe('recent-critical');
      expect(result[1].signalId).toBe('older-critical');
    });

    it('should prioritize old critical over recent low', () => {
      const now = Date.now();
      const twentyHoursAgo = now - 20 * 60 * 60 * 1000;
      const oneHourAgo = now - 1 * 60 * 60 * 1000;
      
      const oldCritical = createTestSignal('critical', twentyHoursAgo, 'old-critical');
      const recentLow = createTestSignal('low', oneHourAgo, 'recent-low');
      
      const result = prioritizeSignals([recentLow, oldCritical]);
      
      // Critical weight=10, recency=4 (24-20) => score=40
      // Low weight=1, recency=23 (24-1) => score=23
      expect(result[0].signalId).toBe('old-critical');
      expect(result[1].signalId).toBe('recent-low');
    });

    it('should handle mixed severity and timestamps correctly', () => {
      const now = Date.now();
      const signals = [
        createTestSignal('low', now - 1 * 60 * 60 * 1000, 'low-recent'),
        createTestSignal('critical', now - 10 * 60 * 60 * 1000, 'critical-old'),
        createTestSignal('high', now - 2 * 60 * 60 * 1000, 'high-recent'),
        createTestSignal('medium', now - 5 * 60 * 60 * 1000, 'medium-mid')
      ];
      
      const result = prioritizeSignals(signals);
      
      // Expected scores:
      // critical-old: 10 * (24-10) = 140
      // high-recent: 5 * (24-2) = 110
      // medium-mid: 2 * (24-5) = 38
      // low-recent: 1 * (24-1) = 23
      
      expect(result[0].signalId).toBe('critical-old');
      expect(result[1].signalId).toBe('high-recent');
      expect(result[2].signalId).toBe('medium-mid');
      expect(result[3].signalId).toBe('low-recent');
    });
  });

  describe('top 10 limit', () => {
    it('should return only top 10 from 20 signals', () => {
      const now = Date.now();
      const signals = Array.from({ length: 20 }, (_, i) =>
        createTestSignal('medium', now - i * 60 * 60 * 1000, `signal-${i}`)
      );
      
      const result = prioritizeSignals(signals);
      
      expect(result).toHaveLength(10);
      // Should get the 10 most recent (highest recency weight)
      expect(result[0].signalId).toBe('signal-0');
      expect(result[9].signalId).toBe('signal-9');
    });

    it('should return top 10 highest priority from mixed severities', () => {
      const now = Date.now();
      const signals = [
        // 5 critical signals (should all be in top 10)
        ...Array.from({ length: 5 }, (_, i) =>
          createTestSignal('critical', now - i * 60 * 60 * 1000, `critical-${i}`)
        ),
        // 5 high signals (should all be in top 10)
        ...Array.from({ length: 5 }, (_, i) =>
          createTestSignal('high', now - i * 60 * 60 * 1000, `high-${i}`)
        ),
        // 10 medium signals (should be excluded)
        ...Array.from({ length: 10 }, (_, i) =>
          createTestSignal('medium', now - i * 60 * 60 * 1000, `medium-${i}`)
        )
      ];
      
      const result = prioritizeSignals(signals);
      
      expect(result).toHaveLength(10);
      // All results should be critical or high
      result.forEach(signal => {
        expect(['critical', 'high']).toContain(signal.impact.severity);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle signals with identical severity and timestamp', () => {
      const now = Date.now();
      const signal1 = createTestSignal('medium', now, 'signal-1');
      const signal2 = createTestSignal('medium', now, 'signal-2');
      const signal3 = createTestSignal('medium', now, 'signal-3');
      
      const result = prioritizeSignals([signal1, signal2, signal3]);
      
      expect(result).toHaveLength(3);
      // All three should be returned (order may vary for identical scores)
      const ids = result.map(s => s.signalId);
      expect(ids).toContain('signal-1');
      expect(ids).toContain('signal-2');
      expect(ids).toContain('signal-3');
    });

    it('should handle signals older than 24 hours', () => {
      const now = Date.now();
      const thirtyHoursAgo = now - 30 * 60 * 60 * 1000;
      
      const signal = createTestSignal('critical', thirtyHoursAgo);
      const result = prioritizeSignals([signal]);
      
      // Should still return the signal with minimum recency weight of 1
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(signal);
    });

    it('should maintain descending order for all returned signals', () => {
      const now = Date.now();
      const signals = Array.from({ length: 15 }, (_, i) => {
        const severity: Severity = i < 5 ? 'critical' : i < 10 ? 'high' : 'medium';
        return createTestSignal(severity, now - i * 60 * 60 * 1000, `signal-${i}`);
      });
      
      const result = prioritizeSignals(signals);
      
      // Verify descending order by checking each pair
      for (let i = 0; i < result.length - 1; i++) {
        const current = result[i];
        const next = result[i + 1];
        
        // Calculate scores manually to verify order
        const currentScore = getSeverityWeight(current.impact.severity) * 
          Math.max(1, 24 - (now - current.occurredAt) / (1000 * 60 * 60));
        const nextScore = getSeverityWeight(next.impact.severity) * 
          Math.max(1, 24 - (now - next.occurredAt) / (1000 * 60 * 60));
        
        expect(currentScore).toBeGreaterThanOrEqual(nextScore);
      }
    });
  });
});

/**
 * Helper to get severity weight for test verification
 */
function getSeverityWeight(severity: Severity): number {
  const weights = { critical: 10, high: 5, medium: 2, low: 1 };
  return weights[severity];
}
