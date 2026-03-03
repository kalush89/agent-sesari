/**
 * Baseline calculation functions for usage monitoring
 */

import { DynamoDBClient, ScanCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import {
  BehavioralSignalEvent,
  FeatureAdoptionDropDetails,
  PowerUserDetails,
  UsageBaseline,
  UsageEvent,
} from './types';

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const SIGNALS_TABLE = process.env.DYNAMODB_SIGNALS_TABLE || 'behavioral-signals';
const BASELINES_TABLE = process.env.DYNAMODB_BASELINES_TABLE || 'usage-baselines';
const ADOPTION_DROP_THRESHOLD = Number(process.env.ADOPTION_DROP_THRESHOLD) || 50;
const INACTIVITY_THRESHOLD_DAYS = Number(process.env.INACTIVITY_THRESHOLD_DAYS) || 14;
const POWER_USER_DAYS_THRESHOLD = Number(process.env.POWER_USER_DAYS_THRESHOLD) || 20;
const POWER_USER_PERCENTILE = Number(process.env.POWER_USER_PERCENTILE) || 90;

/**
 * Retrieves all unique user-feature combinations from last 30 days
 */
export async function getUserFeatureCombinations(): Promise<Array<{ userId: string; feature: string }>> {
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
  const combinations = new Map<string, { userId: string; feature: string }>();

  try {
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
      const command = new ScanCommand({
        TableName: SIGNALS_TABLE,
        FilterExpression: 'attribute_exists(feature) AND #ts > :thirtyDaysAgo',
        ExpressionAttributeNames: {
          '#ts': 'timestamp',
        },
        ExpressionAttributeValues: {
          ':thirtyDaysAgo': { N: String(thirtyDaysAgo) },
        },
        ExclusiveStartKey: lastEvaluatedKey,
      });

      const response = await client.send(command);

      if (response.Items) {
        for (const item of response.Items) {
          const unmarshalled = unmarshall(item) as UsageEvent;
          const key = `${unmarshalled.userId}#${unmarshalled.feature}`;
          if (!combinations.has(key)) {
            combinations.set(key, {
              userId: unmarshalled.userId,
              feature: unmarshalled.feature,
            });
          }
        }
      }

      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return Array.from(combinations.values());
  } catch (error) {
    console.error('Failed to get user-feature combinations', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(`Failed to retrieve user-feature combinations: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Calculates rolling 30-day usage baseline for a user-feature combination
 * Returns null if insufficient data (< 7 days)
 */
export async function calculateUsageBaseline(
  userId: string,
  feature: string
): Promise<UsageBaseline | null> {
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
  const usageHistory = await getUsageHistory(userId, feature, 30);

  if (usageHistory.length === 0) {
    return null;
  }

  // Calculate unique days with activity
  const uniqueDays = new Set(
    usageHistory.map(event => {
      const date = new Date(event.timestamp * 1000);
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    })
  );

  const daysWithActivity = uniqueDays.size;

  // Skip if less than 7 days of data
  if (daysWithActivity < 7) {
    console.log('Insufficient data for baseline calculation', {
      userId,
      feature,
      daysWithActivity,
    });
    return null;
  }

  const totalUses = usageHistory.length;
  const averageFrequency = totalUses / daysWithActivity;
  const now = Math.floor(Date.now() / 1000);

  return {
    userFeatureKey: `${userId}#${feature}`,
    userId,
    feature,
    averageFrequency,
    totalUses,
    baselinePeriodDays: daysWithActivity,
    lastCalculated: now,
    expiresAt: now + (90 * 24 * 60 * 60), // 90 days TTL
  };
}

/**
 * Retrieves usage history for a user-feature combination
 */
async function getUsageHistory(
  userId: string,
  feature: string,
  days: number
): Promise<UsageEvent[]> {
  const startTime = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
  const events: UsageEvent[] = [];

  try {
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
      const command = new ScanCommand({
        TableName: SIGNALS_TABLE,
        FilterExpression: 'userId = :userId AND feature = :feature AND #ts > :startTime',
        ExpressionAttributeNames: {
          '#ts': 'timestamp',
        },
        ExpressionAttributeValues: {
          ':userId': { S: userId },
          ':feature': { S: feature },
          ':startTime': { N: String(startTime) },
        },
        ExclusiveStartKey: lastEvaluatedKey,
      });

      const response = await client.send(command);

      if (response.Items) {
        events.push(...response.Items.map(item => unmarshall(item) as UsageEvent));
      }

      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return events;
  } catch (error) {
    console.error('Failed to get usage history', {
      userId,
      feature,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(`Failed to retrieve usage history: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Detects feature adoption drop by comparing current usage to baseline
 * Returns event if drop detected, null otherwise
 */
export async function detectAdoptionDrop(
  userId: string,
  feature: string,
  baseline: UsageBaseline
): Promise<BehavioralSignalEvent | null> {
  // Get recent usage (last 7 days)
  const recentHistory = await getUsageHistory(userId, feature, 7);
  const now = Math.floor(Date.now() / 1000);

  // Calculate days since last use
  let daysSinceLastUse = 0;
  if (recentHistory.length > 0) {
    const lastUseTimestamp = Math.max(...recentHistory.map(e => e.timestamp));
    daysSinceLastUse = Math.floor((now - lastUseTimestamp) / (24 * 60 * 60));
  } else {
    // No recent usage, check baseline period
    const baselineHistory = await getUsageHistory(userId, feature, 30);
    if (baselineHistory.length > 0) {
      const lastUseTimestamp = Math.max(...baselineHistory.map(e => e.timestamp));
      daysSinceLastUse = Math.floor((now - lastUseTimestamp) / (24 * 60 * 60));
    }
  }

  // Calculate current usage frequency
  const uniqueDays = new Set(
    recentHistory.map(event => {
      const date = new Date(event.timestamp * 1000);
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    })
  );
  const currentFrequency = recentHistory.length > 0 ? recentHistory.length / Math.max(uniqueDays.size, 1) : 0;

  // Calculate drop percentage
  const dropPercentage = baseline.averageFrequency > 0
    ? ((baseline.averageFrequency - currentFrequency) / baseline.averageFrequency) * 100
    : 0;

  // Determine if drop detected
  const hasPercentageDrop = dropPercentage >= ADOPTION_DROP_THRESHOLD;
  const hasInactivity = daysSinceLastUse >= INACTIVITY_THRESHOLD_DAYS;

  if (!hasPercentageDrop && !hasInactivity) {
    return null;
  }

  const detectionReason = hasPercentageDrop && hasInactivity
    ? 'both'
    : hasPercentageDrop
    ? 'percentage_drop'
    : 'inactivity';

  const details: FeatureAdoptionDropDetails = {
    feature,
    previousUsageFrequency: baseline.averageFrequency,
    currentUsageFrequency: currentFrequency,
    dropPercentage,
    daysSinceLastUse,
    baselinePeriodDays: baseline.baselinePeriodDays,
    detectionReason,
  };

  return {
    eventId: `drop_${userId}_${feature}_${now}`,
    eventType: 'feature_adoption_drop',
    userId,
    timestamp: now,
    processedAt: now,
    details,
  };
}

/**
 * Calculates engagement score (0-100) based on frequency and diversity
 */
export function calculateEngagementScore(
  totalEvents: number,
  featureDiversity: number,
  daysActive: number
): number {
  // Normalize metrics to 0-1 scale
  const frequencyScore = Math.min(totalEvents / 100, 1); // Cap at 100 events
  const diversityScore = Math.min(featureDiversity / 10, 1); // Cap at 10 features
  const consistencyScore = Math.min(daysActive / 30, 1); // Cap at 30 days

  // Weighted combination: 40% frequency, 30% diversity, 30% consistency
  const score = (frequencyScore * 0.4 + diversityScore * 0.3 + consistencyScore * 0.3) * 100;

  return Math.round(score);
}

/**
 * Identifies power users based on activity and engagement
 */
export async function identifyPowerUsers(): Promise<BehavioralSignalEvent[]> {
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
  const userActivity = new Map<string, UsageEvent[]>();

  try {
    // Collect all user activity from last 30 days
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
      const command = new ScanCommand({
        TableName: SIGNALS_TABLE,
        FilterExpression: 'attribute_exists(userId) AND #ts > :thirtyDaysAgo',
        ExpressionAttributeNames: {
          '#ts': 'timestamp',
        },
        ExpressionAttributeValues: {
          ':thirtyDaysAgo': { N: String(thirtyDaysAgo) },
        },
        ExclusiveStartKey: lastEvaluatedKey,
      });

      const response = await client.send(command);

      if (response.Items) {
        for (const item of response.Items) {
          const event = unmarshall(item) as UsageEvent;
          if (!userActivity.has(event.userId)) {
            userActivity.set(event.userId, []);
          }
          userActivity.get(event.userId)!.push(event);
        }
      }

      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    // Calculate engagement scores for all users
    const userScores: Array<{ userId: string; score: number; daysActive: number; events: UsageEvent[] }> = [];

    for (const [userId, events] of userActivity.entries()) {
      const uniqueDays = new Set(
        events.map(event => {
          const date = new Date(event.timestamp * 1000);
          return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        })
      );
      const daysActive = uniqueDays.size;
      const featureDiversity = new Set(events.map(e => e.feature)).size;
      const score = calculateEngagementScore(events.length, featureDiversity, daysActive);

      userScores.push({ userId, score, daysActive, events });
    }

    // Calculate 90th percentile threshold
    const sortedScores = userScores.map(u => u.score).sort((a, b) => a - b);
    const percentileIndex = Math.floor(sortedScores.length * (POWER_USER_PERCENTILE / 100));
    const percentileThreshold = sortedScores[percentileIndex] || 0;

    // Identify power users
    const powerUserEvents: BehavioralSignalEvent[] = [];
    const now = Math.floor(Date.now() / 1000);

    for (const user of userScores) {
      const isPowerUser = user.daysActive >= POWER_USER_DAYS_THRESHOLD || user.score >= percentileThreshold;

      if (isPowerUser) {
        // Get top 5 most used features
        const featureUsage = new Map<string, number>();
        for (const event of user.events) {
          featureUsage.set(event.feature, (featureUsage.get(event.feature) || 0) + 1);
        }

        const mostUsedFeatures = Array.from(featureUsage.entries())
          .map(([feature, usageCount]) => ({ feature, usageCount }))
          .sort((a, b) => b.usageCount - a.usageCount)
          .slice(0, 5);

        const featureDiversity = featureUsage.size;
        const percentileRank = (sortedScores.filter(s => s <= user.score).length / sortedScores.length) * 100;

        const details: PowerUserDetails = {
          engagementScore: user.score,
          daysActiveInLast30: user.daysActive,
          mostUsedFeatures,
          totalEventsLast30Days: user.events.length,
          featureDiversity,
          percentileRank: Math.round(percentileRank),
        };

        powerUserEvents.push({
          eventId: `power_${user.userId}_${now}`,
          eventType: 'power_user',
          userId: user.userId,
          timestamp: now,
          processedAt: now,
          details,
        });
      }
    }

    return powerUserEvents;
  } catch (error) {
    console.error('Failed to identify power users', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(`Failed to identify power users: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Stores usage baseline in DynamoDB with 90-day TTL
 */
export async function storeUsageBaseline(baseline: UsageBaseline): Promise<void> {
  try {
    const command = new PutCommand({
      TableName: BASELINES_TABLE,
      Item: baseline,
    });

    await docClient.send(command);
  } catch (error) {
    console.error('Failed to store usage baseline', {
      userFeatureKey: baseline.userFeatureKey,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(`Failed to store usage baseline: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Stores behavioral signal event in DynamoDB
 */
export async function storeBehavioralSignal(event: BehavioralSignalEvent): Promise<void> {
  try {
    const command = new PutCommand({
      TableName: SIGNALS_TABLE,
      Item: {
        ...event,
        expiresAt: event.timestamp + (90 * 24 * 60 * 60), // 90 days TTL
      },
    });

    await docClient.send(command);
  } catch (error) {
    console.error('Failed to store behavioral signal', {
      eventId: event.eventId,
      eventType: event.eventType,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(`Failed to store behavioral signal: ${error instanceof Error ? error.message : String(error)}`);
  }
}
