/**
 * Daily Briefing Generator - Core Types
 * 
 * This module defines the types for the Daily Briefing Generator feature,
 * which transforms raw business signals into narrative-driven morning summaries.
 */

// Note: These types are re-exported from signal-translator
// In production, signal-translator types should be imported from a shared package
// For now, we define the essential types locally to avoid circular dependencies

export type SignalCategory = 'revenue' | 'relationship' | 'behavioral';
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Platform = 'stripe' | 'hubspot' | 'mixpanel';
export type UniversalEventType =
  | 'revenue.expansion'
  | 'revenue.contraction'
  | 'revenue.churn'
  | 'revenue.payment_failed'
  | 'revenue.payment_recovered'
  | 'relationship.deal_advanced'
  | 'relationship.deal_regressed'
  | 'relationship.engagement_gap'
  | 'relationship.sentiment_positive'
  | 'relationship.sentiment_negative'
  | 'behavioral.power_user'
  | 'behavioral.feature_adoption_drop'
  | 'behavioral.engagement_spike'
  | 'behavioral.inactivity';

/**
 * Normalized metrics from Universal Signal schema
 */
export interface NormalizedMetrics {
  revenue?: {
    amount: number;
    currency: string;
    mrr?: number;
    mrrChange?: number;
  };
  relationship?: {
    dealValue?: number;
    daysSinceContact?: number;
    sentimentScore?: number;
  };
  behavioral?: {
    engagementScore?: number;
    usageFrequency?: number;
    featureCount?: number;
  };
}

/**
 * Universal Signal structure (simplified for briefing generator)
 */
export interface Universal_Signal {
  signalId: string;
  category: SignalCategory;
  eventType: UniversalEventType;
  entity: {
    primaryKey: string;
    alternateKeys: string[];
    platformIds: {
      stripe?: string;
      hubspot?: string;
      mixpanel?: string;
    };
  };
  occurredAt: number;
  processedAt: number;
  source: {
    platform: Platform;
    originalEventType: string;
    originalEventId: string;
  };
  impact: {
    severity: Severity;
    metrics: NormalizedMetrics;
  };
  platformDetails: Record<string, unknown>;
  ttl: number;
}



/**
 * Thought trace showing source signals that led to an insight
 */
export interface ThoughtTrace {
  signals: Array<{
    source: Platform;
    eventType: UniversalEventType;
    timestamp: number;
    severity: Severity;
  }>;
}

/**
 * Growth play action button
 */
export interface GrowthPlay {
  label: string;
  action: 'navigate' | 'external';
  target: string;
}

/**
 * A single insight in the daily briefing
 */
export interface Insight {
  id: string;
  narrative: string;
  severity: Severity;
  category: SignalCategory;
  thoughtTrace: ThoughtTrace;
  growthPlay: GrowthPlay;
}

/**
 * Complete daily briefing document
 */
export interface Briefing {
  date: string;                    // YYYY-MM-DD
  generatedAt: number;             // Unix timestamp
  insights: Insight[];
  metadata: {
    signalCount: number;
    priorityLevel: 'high' | 'medium' | 'low';
    categories: {
      revenue: number;
      relationship: number;
      behavioral: number;
    };
  };
}

/**
 * EventBridge scheduled event
 */
export interface EventBridgeEvent {
  version: string;
  id: string;
  'detail-type': string;
  source: string;
  account: string;
  time: string;
  region: string;
  resources: string[];
  detail: Record<string, unknown>;
}

/**
 * Environment variables configuration
 */
export interface EnvironmentConfig {
  UNIVERSAL_SIGNALS_TABLE: string;
  BRIEFING_STORE_TABLE: string;
  BEDROCK_MODEL_ID: string;
  AWS_REGION: string;
  MAX_INSIGHTS: string;
  NARRATIVE_MAX_WORDS: string;
}
