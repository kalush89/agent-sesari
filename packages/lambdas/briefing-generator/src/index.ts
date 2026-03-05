/**
 * Daily Briefing Generator Lambda Handler
 * 
 * Triggered by EventBridge at 8:00 AM UTC daily to generate narrative briefings
 * from business signals collected over the past 24 hours.
 */

import { retrieveSignals } from './signal-retrieval.js';
import { prioritizeSignals } from './signal-prioritization.js';
import { generateNarrative } from './narrative-generation.js';
import { determineGrowthPlay } from './growth-play.js';
import { constructBriefing } from './briefing-construction.js';
import { storeBriefing } from './briefing-storage.js';
import type { EventBridgeEvent, Insight, Universal_Signal } from './types.js';

/**
 * Default user ID (TODO: Multi-tenant support)
 */
const DEFAULT_USER_ID = 'default';

/**
 * Lambda handler for daily briefing generation
 * Triggered by EventBridge scheduler at 8:00 AM UTC
 * 
 * Orchestrates the full pipeline:
 * 1. Retrieve signals from past 24 hours
 * 2. Prioritize signals by impact
 * 3. Generate narratives using Amazon Nova Lite
 * 4. Construct briefing with metadata
 * 5. Store briefing in DynamoDB
 * 
 * @param event - EventBridge scheduled event
 */
export async function handler(event: EventBridgeEvent): Promise<void> {
  const startTime = Date.now();
  
  try {
    console.log('Briefing generation started', { eventId: event.id, time: event.time });
    
    // 1. Retrieve signals from past 24 hours
    const signals = await retrieveSignals();
    console.log('Signals retrieved', { count: signals.length });
    
    // Handle empty signals case
    if (signals.length === 0) {
      console.log('No signals found, generating empty briefing');
      await storeEmptyBriefing(DEFAULT_USER_ID);
      logMetrics(startTime, 0, 0);
      return;
    }
    
    // 2. Prioritize signals by impact
    const prioritized = prioritizeSignals(signals);
    console.log('Signals prioritized', { prioritizedCount: prioritized.length });
    
    // 3. Generate narratives using Amazon Nova Lite
    const insights = await generateInsights(prioritized);
    console.log('Narratives generated', { insightCount: insights.length });
    
    // 4. Construct briefing with metadata
    const briefing = constructBriefing(insights, signals);
    console.log('Briefing constructed', { 
      date: briefing.date, 
      priorityLevel: briefing.metadata.priorityLevel 
    });
    
    // 5. Store briefing in DynamoDB
    await storeBriefing(DEFAULT_USER_ID, briefing);
    console.log('Briefing stored successfully');
    
    // Log final metrics
    logMetrics(startTime, signals.length, insights.length);
    
  } catch (error) {
    console.error('Briefing generation failed', { error });
    throw error;
  }
}

/**
 * Generate insights from prioritized signals
 * 
 * Transforms each signal into a narrative insight with:
 * - AI-generated or template-based narrative
 * - Thought trace showing source signals
 * - Growth play action button
 * 
 * @param signals - Prioritized signals
 * @returns Array of insights
 */
async function generateInsights(signals: Universal_Signal[]): Promise<Insight[]> {
  const insights: Insight[] = [];
  
  for (const signal of signals) {
    try {
      const narrative = await generateNarrative(signal);
      const growthPlay = determineGrowthPlay(signal);
      
      insights.push({
        id: signal.signalId,
        narrative,
        severity: signal.impact.severity,
        category: signal.category,
        thoughtTrace: {
          signals: [{
            source: signal.source.platform,
            eventType: signal.eventType,
            timestamp: signal.occurredAt,
            severity: signal.impact.severity
          }]
        },
        growthPlay
      });
    } catch (error) {
      console.error('Failed to generate insight for signal', { 
        signalId: signal.signalId, 
        error 
      });
      // Continue with other signals even if one fails
    }
  }
  
  return insights;
}

/**
 * Store empty briefing when no signals are found
 * 
 * @param userId - User identifier
 */
async function storeEmptyBriefing(userId: string): Promise<void> {
  const now = Date.now();
  const date = new Date(now).toISOString().split('T')[0];
  
  const emptyBriefing = {
    date,
    generatedAt: now,
    insights: [],
    metadata: {
      signalCount: 0,
      priorityLevel: 'low' as const,
      categories: {
        revenue: 0,
        relationship: 0,
        behavioral: 0
      }
    }
  };
  
  await storeBriefing(userId, emptyBriefing);
}

/**
 * Log execution metrics
 * 
 * @param startTime - Execution start timestamp
 * @param signalCount - Number of signals processed
 * @param insightCount - Number of insights generated
 */
function logMetrics(startTime: number, signalCount: number, insightCount: number): void {
  const duration = Date.now() - startTime;
  
  console.log('Briefing generation completed', {
    duration,
    signalCount,
    insightCount,
    durationSeconds: (duration / 1000).toFixed(2)
  });
}
