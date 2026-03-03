/**
 * Core type definitions for Behavioral Senses Mixpanel Connector
 */

/**
 * Details for a feature adoption drop event
 */
export interface FeatureAdoptionDropDetails {
  feature: string;
  previousUsageFrequency: number;
  currentUsageFrequency: number;
  dropPercentage: number;
  daysSinceLastUse: number;
  baselinePeriodDays: number;
  detectionReason: 'percentage_drop' | 'inactivity' | 'both';
}

/**
 * Details for a power user event
 */
export interface PowerUserDetails {
  engagementScore: number;
  daysActiveInLast30: number;
  mostUsedFeatures: Array<{
    feature: string;
    usageCount: number;
  }>;
  totalEventsLast30Days: number;
  featureDiversity: number;
  percentileRank: number;
}

/**
 * Behavioral signal event stored in DynamoDB
 */
export interface BehavioralSignalEvent {
  eventId: string;
  eventType: 'feature_adoption_drop' | 'power_user';
  userId: string;
  timestamp: number;
  processedAt: number;
  details: FeatureAdoptionDropDetails | PowerUserDetails;
  mixpanelEventType?: string;
  rawPayload?: string;
}

/**
 * Usage baseline for a user-feature combination
 */
export interface UsageBaseline {
  userFeatureKey: string;
  userId: string;
  feature: string;
  averageFrequency: number;
  totalUses: number;
  baselinePeriodDays: number;
  lastCalculated: number;
  expiresAt: number;
}

/**
 * Usage event for baseline calculation
 */
export interface UsageEvent {
  eventId: string;
  userId: string;
  feature: string;
  eventName: string;
  timestamp: number;
  properties: Record<string, any>;
  expiresAt: number;
}
