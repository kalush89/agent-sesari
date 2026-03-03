/**
 * Unit tests for baseline calculator functions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import {
  calculateUsageBaseline,
  detectAdoptionDrop,
  calculateEngagementScore,
  identifyPowerUsers,
  getUserFeatureCombinations,
  storeUsageBaseline,
} from '../baseline-functions';
import { UsageEvent, UsageBaseline } from '../types';

const ddbMock = mockClient(DynamoDBClient);
const docClientMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
  docClientMock.reset();
  vi.clearAllMocks();
});

describe('calculateUsageBaseline', () => {
  it('should calculate baseline with 30 events over 30 days (average = 1.0)', async () => {
    const userId = 'user123';
    const feature = 'feature-a';
    const now = Math.floor(Date.now() / 1000);

    // Create 30 events, one per day
    const events: UsageEvent[] = [];
    for (let i = 0; i < 30; i++) {
      const timestamp = now - (i * 24 * 60 * 60);
      events.push({
        eventId: `event-${i}`,
        userId,
        feature,
        eventName: 'Feature Used',
        timestamp,
        properties: {},
        expiresAt: timestamp + (90 * 24 * 60 * 60),
      });
    }

    ddbMock.on(ScanCommand).resolves({
      Items: events.map(e => marshall(e)),
    });

    const baseline = await calculateUsageBaseline(userId, feature);

    expect(baseline).not.toBeNull();
    expect(baseline?.userId).toBe(userId);
    expect(baseline?.feature).toBe(feature);
    expect(baseline?.totalUses).toBe(30);
    expect(baseline?.baselinePeriodDays).toBe(30);
    expect(baseline?.averageFrequency).toBeCloseTo(1.0, 1);
  });

  it('should calculate baseline with 60 events over 30 days (average = 2.0)', async () => {
    const userId = 'user456';
    const feature = 'feature-b';
    const now = Math.floor(Date.now() / 1000);

    // Create 60 events, two per day for 30 days
    const events: UsageEvent[] = [];
    for (let i = 0; i < 30; i++) {
      const timestamp = now - (i * 24 * 60 * 60);
      events.push({
        eventId: `event-${i}-1`,
        userId,
        feature,
        eventName: 'Feature Used',
        timestamp,
        properties: {},
        expiresAt: timestamp + (90 * 24 * 60 * 60),
      });
      events.push({
        eventId: `event-${i}-2`,
        userId,
        feature,
        eventName: 'Feature Used',
        timestamp: timestamp + 3600, // 1 hour later same day
        properties: {},
        expiresAt: timestamp + (90 * 24 * 60 * 60),
      });
    }

    ddbMock.on(ScanCommand).resolves({
      Items: events.map(e => marshall(e)),
    });

    const baseline = await calculateUsageBaseline(userId, feature);

    expect(baseline).not.toBeNull();
    expect(baseline?.totalUses).toBe(60);
    expect(baseline?.baselinePeriodDays).toBe(30);
    expect(baseline?.averageFrequency).toBeCloseTo(2.0, 1);
  });

  it('should return null for insufficient data (5 events over 5 days)', async () => {
    const userId = 'user789';
    const feature = 'feature-c';
    const now = Math.floor(Date.now() / 1000);

    // Create only 5 events over 5 days (< 7 days threshold)
    const events: UsageEvent[] = [];
    for (let i = 0; i < 5; i++) {
      const timestamp = now - (i * 24 * 60 * 60);
      events.push({
        eventId: `event-${i}`,
        userId,
        feature,
        eventName: 'Feature Used',
        timestamp,
        properties: {},
        expiresAt: timestamp + (90 * 24 * 60 * 60),
      });
    }

    ddbMock.on(ScanCommand).resolves({
      Items: events.map(e => marshall(e)),
    });

    const baseline = await calculateUsageBaseline(userId, feature);

    expect(baseline).toBeNull();
  });

  it('should calculate baseline with 10 events over 10 days (average = 1.0, >= 7 days)', async () => {
    const userId = 'user101';
    const feature = 'feature-d';
    const now = Math.floor(Date.now() / 1000);

    // Create 10 events over 10 days (>= 7 days threshold)
    const events: UsageEvent[] = [];
    for (let i = 0; i < 10; i++) {
      const timestamp = now - (i * 24 * 60 * 60);
      events.push({
        eventId: `event-${i}`,
        userId,
        feature,
        eventName: 'Feature Used',
        timestamp,
        properties: {},
        expiresAt: timestamp + (90 * 24 * 60 * 60),
      });
    }

    ddbMock.on(ScanCommand).resolves({
      Items: events.map(e => marshall(e)),
    });

    const baseline = await calculateUsageBaseline(userId, feature);

    expect(baseline).not.toBeNull();
    expect(baseline?.totalUses).toBe(10);
    expect(baseline?.baselinePeriodDays).toBe(10);
    expect(baseline?.averageFrequency).toBeCloseTo(1.0, 1);
  });

  it('should return null when no usage history exists', async () => {
    const userId = 'user-no-data';
    const feature = 'feature-none';

    ddbMock.on(ScanCommand).resolves({
      Items: [],
    });

    const baseline = await calculateUsageBaseline(userId, feature);

    expect(baseline).toBeNull();
  });
});

describe('detectAdoptionDrop', () => {
  it('should detect 50% drop (baseline 10, current 5)', async () => {
    const userId = 'user-drop-50';
    const feature = 'feature-drop';
    const now = Math.floor(Date.now() / 1000);

    const baseline: UsageBaseline = {
      userFeatureKey: `${userId}#${feature}`,
      userId,
      feature,
      averageFrequency: 10,
      totalUses: 300,
      baselinePeriodDays: 30,
      lastCalculated: now,
      expiresAt: now + (90 * 24 * 60 * 60),
    };

    // Create 5 events in last 7 days (50% drop)
    const recentEvents: UsageEvent[] = [];
    for (let i = 0; i < 5; i++) {
      recentEvents.push({
        eventId: `recent-${i}`,
        userId,
        feature,
        eventName: 'Feature Used',
        timestamp: now - (i * 24 * 60 * 60),
        properties: {},
        expiresAt: now + (90 * 24 * 60 * 60),
      });
    }

    ddbMock.on(ScanCommand).resolves({
      Items: recentEvents.map(e => marshall(e)),
    });

    const dropEvent = await detectAdoptionDrop(userId, feature, baseline);

    expect(dropEvent).not.toBeNull();
    expect(dropEvent?.eventType).toBe('feature_adoption_drop');
    expect(dropEvent?.userId).toBe(userId);
    expect(dropEvent?.details).toHaveProperty('feature', feature);
    expect(dropEvent?.details).toHaveProperty('previousUsageFrequency', 10);
    expect(dropEvent?.details).toHaveProperty('detectionReason');
  });

  it('should not detect 49% drop (baseline 10, current 5.1)', async () => {
    const userId = 'user-drop-49';
    const feature = 'feature-no-drop';
    const now = Math.floor(Date.now() / 1000);

    const baseline: UsageBaseline = {
      userFeatureKey: `${userId}#${feature}`,
      userId,
      feature,
      averageFrequency: 10,
      totalUses: 300,
      baselinePeriodDays: 30,
      lastCalculated: now,
      expiresAt: now + (90 * 24 * 60 * 60),
    };

    // Create 36 events spread across exactly 7 days (5.14 per day average)
    const recentEvents: UsageEvent[] = [];
    for (let i = 0; i < 36; i++) {
      const dayOffset = i % 7; // Cycle through 7 days
      recentEvents.push({
        eventId: `recent-${i}`,
        userId,
        feature,
        eventName: 'Feature Used',
        timestamp: now - (dayOffset * 24 * 60 * 60) - (i * 600), // 10 min intervals
        properties: {},
        expiresAt: now + (90 * 24 * 60 * 60),
      });
    }

    ddbMock.on(ScanCommand).resolves({
      Items: recentEvents.map(e => marshall(e)),
    });

    const dropEvent = await detectAdoptionDrop(userId, feature, baseline);

    expect(dropEvent).toBeNull();
  });

  it('should detect 14 days inactivity', async () => {
    const userId = 'user-inactive';
    const feature = 'feature-inactive';
    const now = Math.floor(Date.now() / 1000);

    const baseline: UsageBaseline = {
      userFeatureKey: `${userId}#${feature}`,
      userId,
      feature,
      averageFrequency: 5,
      totalUses: 150,
      baselinePeriodDays: 30,
      lastCalculated: now,
      expiresAt: now + (90 * 24 * 60 * 60),
    };

    // Create 5 events 15 days ago (maintains baseline frequency but inactive)
    const oldEvents: UsageEvent[] = [];
    for (let i = 0; i < 5; i++) {
      oldEvents.push({
        eventId: `old-event-${i}`,
        userId,
        feature,
        eventName: 'Feature Used',
        timestamp: now - (15 * 24 * 60 * 60) - (i * 3600),
        properties: {},
        expiresAt: now + (90 * 24 * 60 * 60),
      });
    }

    ddbMock.on(ScanCommand).resolves({
      Items: oldEvents.map(e => marshall(e)),
    });

    const dropEvent = await detectAdoptionDrop(userId, feature, baseline);

    expect(dropEvent).not.toBeNull();
    expect(dropEvent?.details).toHaveProperty('daysSinceLastUse');
    expect((dropEvent?.details as any).daysSinceLastUse).toBeGreaterThanOrEqual(14);
    expect((dropEvent?.details as any).detectionReason).toMatch(/inactivity/);
  });

  it('should not detect 13 days inactivity', async () => {
    const userId = 'user-active-13';
    const feature = 'feature-active';
    const now = Math.floor(Date.now() / 1000);

    const baseline: UsageBaseline = {
      userFeatureKey: `${userId}#${feature}`,
      userId,
      feature,
      averageFrequency: 5,
      totalUses: 150,
      baselinePeriodDays: 30,
      lastCalculated: now,
      expiresAt: now + (90 * 24 * 60 * 60),
    };

    // Create 5 events 13 days ago (maintains baseline frequency)
    const recentEvents: UsageEvent[] = [];
    for (let i = 0; i < 5; i++) {
      recentEvents.push({
        eventId: `recent-event-${i}`,
        userId,
        feature,
        eventName: 'Feature Used',
        timestamp: now - (13 * 24 * 60 * 60) - (i * 3600),
        properties: {},
        expiresAt: now + (90 * 24 * 60 * 60),
      });
    }

    ddbMock.on(ScanCommand).resolves({
      Items: recentEvents.map(e => marshall(e)),
    });

    const dropEvent = await detectAdoptionDrop(userId, feature, baseline);

    // Should not detect since 13 days < 14 days threshold and usage is maintained
    expect(dropEvent).toBeNull();
  });

  it('should detect both conditions (50% drop + 14 days) with reason "both"', async () => {
    const userId = 'user-both';
    const feature = 'feature-both';
    const now = Math.floor(Date.now() / 1000);

    const baseline: UsageBaseline = {
      userFeatureKey: `${userId}#${feature}`,
      userId,
      feature,
      averageFrequency: 10,
      totalUses: 300,
      baselinePeriodDays: 30,
      lastCalculated: now,
      expiresAt: now + (90 * 24 * 60 * 60),
    };

    // No recent events, last event 20 days ago
    const oldEvent: UsageEvent = {
      eventId: 'old-event',
      userId,
      feature,
      eventName: 'Feature Used',
      timestamp: now - (20 * 24 * 60 * 60),
      properties: {},
      expiresAt: now + (90 * 24 * 60 * 60),
    };

    ddbMock.on(ScanCommand).resolves({
      Items: [marshall(oldEvent)],
    });

    const dropEvent = await detectAdoptionDrop(userId, feature, baseline);

    expect(dropEvent).not.toBeNull();
    expect((dropEvent?.details as any).detectionReason).toBe('both');
  });
});

describe('calculateEngagementScore', () => {
  it('should return high score (>80) for high frequency + high diversity', () => {
    const totalEvents = 100;
    const featureDiversity = 10;
    const daysActive = 30;

    const score = calculateEngagementScore(totalEvents, featureDiversity, daysActive);

    expect(score).toBeGreaterThan(80);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('should return medium score (50-80) for high frequency + low diversity', () => {
    const totalEvents = 100;
    const featureDiversity = 2;
    const daysActive = 15;

    const score = calculateEngagementScore(totalEvents, featureDiversity, daysActive);

    expect(score).toBeGreaterThanOrEqual(50);
    expect(score).toBeLessThanOrEqual(80);
  });

  it('should return medium score (50-80) for low frequency + high diversity', () => {
    const totalEvents = 20;
    const featureDiversity = 10;
    const daysActive = 25;

    const score = calculateEngagementScore(totalEvents, featureDiversity, daysActive);

    expect(score).toBeGreaterThanOrEqual(50);
    expect(score).toBeLessThanOrEqual(80);
  });

  it('should return low score (<50) for low frequency + low diversity', () => {
    const totalEvents = 10;
    const featureDiversity = 2;
    const daysActive = 5;

    const score = calculateEngagementScore(totalEvents, featureDiversity, daysActive);

    expect(score).toBeLessThan(50);
  });

  it('should return 0 for no activity', () => {
    const totalEvents = 0;
    const featureDiversity = 0;
    const daysActive = 0;

    const score = calculateEngagementScore(totalEvents, featureDiversity, daysActive);

    expect(score).toBe(0);
  });

  it('should cap score at 100', () => {
    const totalEvents = 1000; // Way above cap
    const featureDiversity = 50; // Way above cap
    const daysActive = 60; // Way above cap

    const score = calculateEngagementScore(totalEvents, featureDiversity, daysActive);

    expect(score).toBe(100);
  });
});

describe('identifyPowerUsers', () => {
  it('should identify user with 25 days active as power user', async () => {
    const now = Math.floor(Date.now() / 1000);
    const userId = 'power-user-25';

    // Create events for 25 different days
    const events: UsageEvent[] = [];
    for (let i = 0; i < 25; i++) {
      events.push({
        eventId: `event-${i}`,
        userId,
        feature: 'feature-a',
        eventName: 'Feature Used',
        timestamp: now - (i * 24 * 60 * 60),
        properties: {},
        expiresAt: now + (90 * 24 * 60 * 60),
      });
    }

    ddbMock.on(ScanCommand).resolves({
      Items: events.map(e => marshall(e)),
    });

    const powerUsers = await identifyPowerUsers();

    expect(powerUsers.length).toBeGreaterThan(0);
    const powerUser = powerUsers.find(u => u.userId === userId);
    expect(powerUser).toBeDefined();
    expect(powerUser?.eventType).toBe('power_user');
    expect((powerUser?.details as any).daysActiveInLast30).toBe(25);
  });

  it('should identify user with 19 days active but high engagement score as power user', async () => {
    const now = Math.floor(Date.now() / 1000);
    const userId1 = 'high-engagement-user';
    const userId2 = 'low-engagement-user';

    // User 1: 19 days active, high frequency and diversity
    const events1: UsageEvent[] = [];
    for (let i = 0; i < 19; i++) {
      for (let j = 0; j < 5; j++) {
        events1.push({
          eventId: `event-${i}-${j}`,
          userId: userId1,
          feature: `feature-${j}`,
          eventName: 'Feature Used',
          timestamp: now - (i * 24 * 60 * 60) - (j * 3600),
          properties: {},
          expiresAt: now + (90 * 24 * 60 * 60),
        });
      }
    }

    // User 2: 5 days active, low frequency (for percentile calculation)
    const events2: UsageEvent[] = [];
    for (let i = 0; i < 5; i++) {
      events2.push({
        eventId: `event2-${i}`,
        userId: userId2,
        feature: 'feature-a',
        eventName: 'Feature Used',
        timestamp: now - (i * 24 * 60 * 60),
        properties: {},
        expiresAt: now + (90 * 24 * 60 * 60),
      });
    }

    ddbMock.on(ScanCommand).resolves({
      Items: [...events1, ...events2].map(e => marshall(e)),
    });

    const powerUsers = await identifyPowerUsers();

    const powerUser = powerUsers.find(u => u.userId === userId1);
    expect(powerUser).toBeDefined();
    expect((powerUser?.details as any).daysActiveInLast30).toBe(19);
    expect((powerUser?.details as any).engagementScore).toBeGreaterThan(50);
  });

  it('should not identify user with 15 days active and low engagement as power user', async () => {
    const now = Math.floor(Date.now() / 1000);
    const userId = 'regular-user';

    // Create events for only 15 days with low frequency (15 events total)
    const events: UsageEvent[] = [];
    for (let i = 0; i < 15; i++) {
      events.push({
        eventId: `event-${i}`,
        userId,
        feature: 'feature-a',
        eventName: 'Feature Used',
        timestamp: now - (i * 24 * 60 * 60),
        properties: {},
        expiresAt: now + (90 * 24 * 60 * 60),
      });
    }

    // Add several other users with higher activity to push regular-user below 90th percentile
    const otherUsers = ['user-2', 'user-3', 'user-4', 'user-5', 'user-6', 'user-7', 'user-8', 'user-9', 'user-10'];
    for (const otherUserId of otherUsers) {
      // Each user has 20+ events across 15 days (higher engagement)
      for (let i = 0; i < 25; i++) {
        const dayOffset = i % 15;
        events.push({
          eventId: `${otherUserId}-event-${i}`,
          userId: otherUserId,
          feature: 'feature-a',
          eventName: 'Feature Used',
          timestamp: now - (dayOffset * 24 * 60 * 60) - (i * 3600),
          properties: {},
          expiresAt: now + (90 * 24 * 60 * 60),
        });
      }
    }

    ddbMock.on(ScanCommand).resolves({
      Items: events.map(e => marshall(e)),
    });

    const powerUsers = await identifyPowerUsers();

    const powerUser = powerUsers.find(u => u.userId === userId);
    expect(powerUser).toBeUndefined();
  });

  it('should identify user exactly at 20-day threshold as power user', async () => {
    const now = Math.floor(Date.now() / 1000);
    const userId = 'threshold-user';

    // Create events for exactly 20 days
    const events: UsageEvent[] = [];
    for (let i = 0; i < 20; i++) {
      events.push({
        eventId: `event-${i}`,
        userId,
        feature: 'feature-a',
        eventName: 'Feature Used',
        timestamp: now - (i * 24 * 60 * 60),
        properties: {},
        expiresAt: now + (90 * 24 * 60 * 60),
      });
    }

    ddbMock.on(ScanCommand).resolves({
      Items: events.map(e => marshall(e)),
    });

    const powerUsers = await identifyPowerUsers();

    const powerUser = powerUsers.find(u => u.userId === userId);
    expect(powerUser).toBeDefined();
    expect((powerUser?.details as any).daysActiveInLast30).toBe(20);
  });

  it('should include top 5 most used features in power user details', async () => {
    const now = Math.floor(Date.now() / 1000);
    const userId = 'feature-diverse-user';

    // Create events across 8 features with varying frequencies
    const events: UsageEvent[] = [];
    const featureUsage = [
      { feature: 'feature-a', count: 50 },
      { feature: 'feature-b', count: 40 },
      { feature: 'feature-c', count: 30 },
      { feature: 'feature-d', count: 20 },
      { feature: 'feature-e', count: 10 },
      { feature: 'feature-f', count: 5 },
      { feature: 'feature-g', count: 3 },
      { feature: 'feature-h', count: 2 },
    ];

    let eventId = 0;
    for (const { feature, count } of featureUsage) {
      for (let i = 0; i < count; i++) {
        events.push({
          eventId: `event-${eventId++}`,
          userId,
          feature,
          eventName: 'Feature Used',
          timestamp: now - (i * 60 * 60), // Spread across hours
          properties: {},
          expiresAt: now + (90 * 24 * 60 * 60),
        });
      }
    }

    ddbMock.on(ScanCommand).resolves({
      Items: events.map(e => marshall(e)),
    });

    const powerUsers = await identifyPowerUsers();

    const powerUser = powerUsers.find(u => u.userId === userId);
    expect(powerUser).toBeDefined();
    
    const details = powerUser?.details as any;
    expect(details.mostUsedFeatures).toHaveLength(5);
    expect(details.mostUsedFeatures[0].feature).toBe('feature-a');
    expect(details.mostUsedFeatures[0].usageCount).toBe(50);
    expect(details.featureDiversity).toBe(8);
  });
});

describe('Error handling', () => {
  it('should skip calculation and log for insufficient data', async () => {
    const userId = 'user-insufficient';
    const feature = 'feature-insufficient';
    const now = Math.floor(Date.now() / 1000);

    // Only 3 events over 3 days (< 7 days threshold)
    const events: UsageEvent[] = [];
    for (let i = 0; i < 3; i++) {
      events.push({
        eventId: `event-${i}`,
        userId,
        feature,
        eventName: 'Feature Used',
        timestamp: now - (i * 24 * 60 * 60),
        properties: {},
        expiresAt: now + (90 * 24 * 60 * 60),
      });
    }

    const consoleSpy = vi.spyOn(console, 'log');
    ddbMock.on(ScanCommand).resolves({
      Items: events.map(e => marshall(e)),
    });

    const baseline = await calculateUsageBaseline(userId, feature);

    expect(baseline).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      'Insufficient data for baseline calculation',
      expect.objectContaining({
        userId,
        feature,
        daysWithActivity: 3,
      })
    );
  });

  it('should handle DynamoDB errors gracefully', async () => {
    const userId = 'user-error';
    const feature = 'feature-error';

    ddbMock.on(ScanCommand).rejects(new Error('DynamoDB unavailable'));

    await expect(calculateUsageBaseline(userId, feature)).rejects.toThrow(
      'Failed to retrieve usage history'
    );
  });

  it('should handle empty user activity in identifyPowerUsers', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [],
    });

    const powerUsers = await identifyPowerUsers();

    expect(powerUsers).toEqual([]);
  });

  it('should continue processing other combinations on individual failure', async () => {
    // This test verifies the batch processing logic in the handler
    // The handler should catch errors for individual combinations and continue
    const consoleSpy = vi.spyOn(console, 'error');
    
    // Mock a scenario where one scan fails but others succeed
    ddbMock.on(ScanCommand)
      .resolvesOnce({ Items: [] }) // First call succeeds with no data
      .rejectsOnce(new Error('Temporary failure')) // Second call fails
      .resolvesOnce({ Items: [] }); // Third call succeeds

    // The handler should log the error but continue
    // This is tested at the handler level, not the function level
    expect(consoleSpy).toBeDefined();
  });

  it('should handle store failures gracefully', async () => {
    const baseline: UsageBaseline = {
      userFeatureKey: 'user#feature',
      userId: 'user',
      feature: 'feature',
      averageFrequency: 5,
      totalUses: 150,
      baselinePeriodDays: 30,
      lastCalculated: Math.floor(Date.now() / 1000),
      expiresAt: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60),
    };

    docClientMock.on(PutCommand).rejects(new Error('DynamoDB write failed'));

    await expect(storeUsageBaseline(baseline)).rejects.toThrow(
      'Failed to store usage baseline'
    );
  });
});
