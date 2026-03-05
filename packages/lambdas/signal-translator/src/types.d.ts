/**
 * Universal Signal Schema - Core Types
 *
 * This module defines the unified "Sesari Language" format that all platform-specific
 * signals (Stripe, HubSpot, Mixpanel) are translated into.
 */
/**
 * Universal event types organized by category
 */
export type UniversalEventType = 'revenue.expansion' | 'revenue.contraction' | 'revenue.churn' | 'revenue.payment_failed' | 'revenue.payment_recovered' | 'relationship.deal_advanced' | 'relationship.deal_regressed' | 'relationship.engagement_gap' | 'relationship.sentiment_positive' | 'relationship.sentiment_negative' | 'behavioral.power_user' | 'behavioral.feature_adoption_drop' | 'behavioral.engagement_spike' | 'behavioral.inactivity';
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
    mostUsedFeatures?: Array<{
        feature: string;
        usageCount: number;
    }>;
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
    platformDetails: PlatformDetails;
    ttl: number;
}
/**
 * Mapping from platform-specific events to universal types
 */
export declare const EVENT_TAXONOMY: Record<string, UniversalEventType>;
/**
 * Entity mapping across platforms
 */
export interface EntityMapping {
    primaryKey: string;
    alternateKeys: string[];
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
//# sourceMappingURL=types.d.ts.map