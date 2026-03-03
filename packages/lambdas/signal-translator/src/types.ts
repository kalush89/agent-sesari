/**
 * Universal Signal Schema - Core Types
 * 
 * This module defines the unified "Sesari Language" format that all platform-specific
 * signals (Stripe, HubSpot, Mixpanel) are translated into.
 */

/**
 * Universal event types organized by category
 */
export type UniversalEventType =
  // Revenue category
  | 'revenue.expansion'
  | 'revenue.contraction'
  | 'revenue.churn'
  | 'revenue.payment_failed'
  | 'revenue.payment_recovered'
  
  // Relationship category
  | 'relationship.deal_advanced'
  | 'relationship.deal_regressed'
  | 'relationship.engagement_gap'
  | 'relationship.sentiment_positive'
  | 'relationship.sentiment_negative'
  
  // Behavioral category
  | 'behavioral.power_user'
  | 'behavioral.feature_adoption_drop'
  | 'behavioral.engagement_spike'
  | 'behavioral.inactivity';

/**
 * Signal category
 */
export type SignalCategory = 'revenue' | 'relationship' | 'behavioral';

/**
 * Platform identifier
 */
export type Platform = 'stripe' | 'hubspot' | 'mixpanel';

/**
 * Severity level for signal impact
 */
export type Severity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Confidence level for entity resolution
 */
export type Confidence = 'high' | 'medium' | 'low';

/**
 * Normalized metrics that work across all signal types
 */
export interface NormalizedMetrics {
  // Financial metrics (for revenue signals)
  revenue?: {
    amount: number;
    currency: string;
    mrr?: number;
    mrrChange?: number;
  };
  
  // Relationship metrics (for relationship signals)
  relationship?: {
    dealValue?: number;
    daysSinceContact?: number;
    sentimentScore?: number;  // -1 to 1 normalized
  };
  
  // Behavioral metrics (for behavioral signals)
  behavioral?: {
    engagementScore?: number;  // 0 to 100 normalized
    usageFrequency?: number;
    featureCount?: number;
  };
}

/**
 * Stripe-specific details preserved in Universal_Signal
 */
export interface StripeDetails {
  subscriptionId?: string;
  planId?: string;
  quantity?: number;
  cancellationType?: 'immediate' | 'end_of_period';
  failureCode?: string;
  nextRetryAt?: number;
}

/**
 * HubSpot-specific details preserved in Universal_Signal
 */
export interface HubSpotDetails {
  dealId?: string;
  dealStage?: string;
  dealName?: string;
  contactId?: string;
  sourceType?: 'note' | 'email' | 'call';
  keywords?: string[];
}

/**
 * Mixpanel-specific details preserved in Universal_Signal
 */
export interface MixpanelDetails {
  feature?: string;
  usageCount?: number;
  mostUsedFeatures?: Array<{ feature: string; usageCount: number }>;
  dropPercentage?: number;
  percentileRank?: number;
}

/**
 * Platform-specific details union type
 */
export type PlatformDetails = StripeDetails | HubSpotDetails | MixpanelDetails;

/**
 * Universal signal schema - the "Sesari Language" format
 */
export interface Universal_Signal {
  // Unique identifier
  signalId: string;
  
  // Event classification
  category: SignalCategory;
  eventType: UniversalEventType;
  
  // Entity identification with correlation
  entity: {
    primaryKey: string;        // Email or primary identifier
    alternateKeys: string[];   // Additional identifiers
    platformIds: {
      stripe?: string;         // Stripe customer ID
      hubspot?: string;        // HubSpot company/contact ID
      mixpanel?: string;       // Mixpanel distinct_id
    };
  };
  
  // Temporal information
  occurredAt: number;          // Unix timestamp when event occurred
  processedAt: number;         // Unix timestamp when signal was created
  
  // Source tracking
  source: {
    platform: Platform;
    originalEventType: string;
    originalEventId: string;
  };
  
  // Normalized impact metrics
  impact: {
    severity: Severity;
    metrics: NormalizedMetrics;
  };
  
  // Platform-specific details (preserved for context)
  platformDetails: PlatformDetails;
  
  // Storage metadata
  ttl: number;                 // DynamoDB TTL for automatic expiration
}

/**
 * Mapping from platform-specific events to universal types
 */
export const EVENT_TAXONOMY: Record<string, UniversalEventType> = {
  // Stripe mappings
  'expansion': 'revenue.expansion',
  'churn': 'revenue.churn',
  'failed_payment': 'revenue.payment_failed',
  'contraction': 'revenue.contraction',
  'payment_recovered': 'revenue.payment_recovered',
  
  // HubSpot mappings
  'deal_progression': 'relationship.deal_advanced',
  'deal_regression': 'relationship.deal_regressed',
  'communication_gap': 'relationship.engagement_gap',
  'sentiment_positive': 'relationship.sentiment_positive',
  'sentiment_negative': 'relationship.sentiment_negative',
  
  // Mixpanel mappings
  'power_user': 'behavioral.power_user',
  'feature_adoption_drop': 'behavioral.feature_adoption_drop',
  'engagement_spike': 'behavioral.engagement_spike',
  'inactivity': 'behavioral.inactivity',
};

/**
 * Entity mapping across platforms
 */
export interface EntityMapping {
  primaryKey: string;          // Email or primary identifier
  alternateKeys: string[];     // Additional identifiers
  platformIds: {
    stripe?: string;
    hubspot?: string;
    mixpanel?: string;
  };
  lastUpdated: number;
  confidence: Confidence;
}

/**
 * Query options for signal retrieval
 */
export interface QueryOptions {
  startTime?: number;
  endTime?: number;
  limit?: number;
  sortOrder?: 'asc' | 'desc';
}
