/**
 * Usage Baseline Calculator Lambda
 * 
 * Scheduled Lambda function that:
 * - Calculates rolling 30-day usage baselines for user-feature combinations
 * - Detects feature adoption drops (50%+ decrease or 14+ days inactivity)
 * - Identifies power users (20+ days active OR 90th percentile engagement)
 * - Processes in batches to handle large datasets within 5-minute timeout
 */

import { EventBridgeEvent } from 'aws-lambda';
import {
  BehavioralSignalEvent,
  FeatureAdoptionDropDetails,
  PowerUserDetails,
  UsageBaseline,
  UsageEvent,
} from './types';
import {
  getUserFeatureCombinations,
  calculateUsageBaseline,
  detectAdoptionDrop,
  identifyPowerUsers,
  storeUsageBaseline,
  storeBehavioralSignal,
} from './baseline-functions.js';
import { logInfo, logError } from './logger.js';
import { emitSuccessMetric, emitFailureMetric, emitLatencyMetric } from './metrics.js';

/**
 * Validates required environment variables
 * @throws Error if required variables are missing
 */
function validateEnvironment(): void {
  const required = ['DYNAMODB_SIGNALS_TABLE', 'DYNAMODB_BASELINES_TABLE', 'AWS_REGION'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Lambda handler for scheduled baseline calculation
 * Triggered daily by EventBridge
 */
export async function handler(event: EventBridgeEvent<string, any>): Promise<void> {
  // Validate environment variables at startup
  validateEnvironment();

  logInfo('Starting usage baseline calculation', undefined, { event });

  const startTime = Date.now();
  let processedCount = 0;
  let dropEventsCreated = 0;
  let powerUserEventsCreated = 0;
  let failedCount = 0;

  try {
    // Get all unique user-feature combinations from last 30 days
    const combinations = await getUserFeatureCombinations();
    logInfo('Retrieved user-feature combinations', undefined, {
      combinationCount: combinations.length,
    });

    // Process each combination
    for (const { userId, feature } of combinations) {
      try {
        // Calculate usage baseline
        const baseline = await calculateUsageBaseline(userId, feature);
        
        if (!baseline) {
          // Insufficient data (< 7 days), skip
          logInfo('Insufficient data for baseline calculation', undefined, {
            userId,
            feature,
            reason: 'Less than 7 days of data',
          });
          continue;
        }

        // Store the baseline
        await storeUsageBaseline(baseline);

        // Detect adoption drops
        const dropEvent = await detectAdoptionDrop(userId, feature, baseline);
        if (dropEvent) {
          await storeBehavioralSignal(dropEvent);
          dropEventsCreated++;
          const details = dropEvent.details as FeatureAdoptionDropDetails;
          logInfo('Feature adoption drop detected', dropEvent.eventId, {
            userId,
            feature,
            dropPercentage: details.dropPercentage,
          });
        }

        processedCount++;
      } catch (error) {
        logError('Failed to process user-feature combination', undefined, {
          userId,
          feature,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        failedCount++;
        // Continue processing other combinations
      }
    }

    // Identify power users
    logInfo('Starting power user identification', undefined);
    const powerUserEvents = await identifyPowerUsers();
    
    for (const event of powerUserEvents) {
      try {
        await storeBehavioralSignal(event);
        powerUserEventsCreated++;
        const details = event.details as PowerUserDetails;
        logInfo('Power user identified', event.eventId, {
          userId: event.userId,
          engagementScore: details.engagementScore,
          daysActive: details.daysActiveInLast30,
        });
      } catch (error) {
        logError('Failed to store power user event', event.eventId, {
          userId: event.userId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        failedCount++;
      }
    }

    const duration = Date.now() - startTime;
    
    logInfo('Baseline calculation completed', undefined, {
      duration,
      processedCount,
      dropEventsCreated,
      powerUserEventsCreated,
      failedCount,
    });

    // Emit success metrics
    await emitSuccessMetric('baseline_calculation');
    await emitLatencyMetric(duration, 'baseline_calculation');
    
    if (dropEventsCreated > 0) {
      await emitSuccessMetric('adoption_drop_detected');
    }
    
    if (powerUserEventsCreated > 0) {
      await emitSuccessMetric('power_user_identified');
    }
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logError('Baseline calculation failed', undefined, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration,
      processedCount,
      dropEventsCreated,
      powerUserEventsCreated,
      failedCount,
    });

    // Emit failure metrics
    await emitFailureMetric('baseline_calculation_error');
    await emitLatencyMetric(duration, 'baseline_calculation_error');
    
    throw error;
  }
}
