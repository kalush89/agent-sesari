/**
 * Mixpanel Signal Translator
 * 
 * Translates Mixpanel BehavioralSignalEvents into Universal_Signal format
 */

import { Signal_Translator } from '../interfaces';
import {
  Universal_Signal,
  EntityMapping,
  EVENT_TAXONOMY,
  UniversalEventType,
  MixpanelDetails,
  Severity,
} from '../types';
import { randomUUID } from 'crypto';

/**
 * Mixpanel-specific signal types (from mixpanel-connector)
 */
interface FeatureAdoptionDropDetails {
  feature: string;
  previousUsageFrequency: number;
  currentUsageFrequency: number;
  dropPercentage: number;
  daysSinceLastUse: number;
  baselinePeriodDays: number;
  detectionReason: 'percentage_drop' | 'inactivity' | 'both';
}

interface PowerUserDetails {
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
 * Translator for Mixpanel behavioral signals
 */
export class MixpanelSignalTranslator implements Signal_Translator<BehavioralSignalEvent> {
  /**
   * Translate Mixpanel signal to Universal_Signal
   */
  async translate(
    signal: BehavioralSignalEvent,
    entityMapping?: EntityMapping
  ): Promise<Universal_Signal | null> {
    if (!this.validate(signal)) {
      return null;
    }

    const eventType = this.mapEventType(signal.eventType);
    const severity = this.calculateSeverity(signal);
    const platformDetails = this.extractPlatformDetails(signal);
    const ttl = this.calculateTTL(signal.processedAt);

    const universalSignal: Universal_Signal = {
      signalId: randomUUID(),
      category: 'behavioral',
      eventType,
      entity: {
        primaryKey: entityMapping?.primaryKey || signal.userId,
        alternateKeys: entityMapping?.alternateKeys || [],
        platformIds: {
          mixpanel: signal.userId,
          ...(entityMapping?.platformIds || {}),
        },
      },
      occurredAt: signal.timestamp,
      processedAt: signal.processedAt,
      source: {
        platform: 'mixpanel',
        originalEventType: signal.eventType,
        originalEventId: signal.eventId,
      },
      impact: {
        severity,
        metrics: {
          behavioral: this.extractBehavioralMetrics(signal),
        },
      },
      platformDetails,
      ttl,
    };

    return universalSignal;
  }

  /**
   * Validate required fields in Mixpanel signal
   */
  validate(signal: BehavioralSignalEvent): boolean {
    if (!signal.eventId || !signal.eventType || !signal.userId) {
      return false;
    }

    if (!signal.timestamp || signal.timestamp <= 0) {
      return false;
    }

    if (!signal.details) {
      return false;
    }

    return true;
  }

  /**
   * Extract correlation keys from Mixpanel signal
   */
  async extractCorrelationKeys(signal: BehavioralSignalEvent): Promise<string[]> {
    const keys: string[] = [signal.userId];
    return keys;
  }

  /**
   * Map Mixpanel event type to universal taxonomy
   */
  private mapEventType(mixpanelEventType: string): UniversalEventType {
    const mapped = EVENT_TAXONOMY[mixpanelEventType];
    if (!mapped) {
      throw new Error(`Unknown Mixpanel event type: ${mixpanelEventType}`);
    }
    return mapped;
  }

  /**
   * Calculate severity based on behavioral impact
   */
  private calculateSeverity(signal: BehavioralSignalEvent): Severity {
    if (signal.eventType === 'power_user') {
      const details = signal.details as PowerUserDetails;
      return details.percentileRank >= 95 ? 'high' : 'medium';
    }

    if (signal.eventType === 'feature_adoption_drop') {
      const details = signal.details as FeatureAdoptionDropDetails;
      if (details.dropPercentage >= 80) return 'high';
      if (details.dropPercentage >= 50) return 'medium';
      return 'low';
    }

    return 'medium';
  }

  /**
   * Extract behavioral metrics
   */
  private extractBehavioralMetrics(signal: BehavioralSignalEvent) {
    if (signal.eventType === 'power_user') {
      const details = signal.details as PowerUserDetails;
      return {
        engagementScore: details.engagementScore,
        usageFrequency: details.totalEventsLast30Days,
        featureCount: details.mostUsedFeatures.length,
      };
    }

    if (signal.eventType === 'feature_adoption_drop') {
      const details = signal.details as FeatureAdoptionDropDetails;
      return {
        usageFrequency: details.currentUsageFrequency,
      };
    }

    return {};
  }

  /**
   * Extract Mixpanel-specific details
   */
  private extractPlatformDetails(signal: BehavioralSignalEvent): MixpanelDetails {
    const details: MixpanelDetails = {};

    if (signal.eventType === 'power_user') {
      const powerUserDetails = signal.details as PowerUserDetails;
      details.mostUsedFeatures = powerUserDetails.mostUsedFeatures;
      details.percentileRank = powerUserDetails.percentileRank;
    }

    if (signal.eventType === 'feature_adoption_drop') {
      const dropDetails = signal.details as FeatureAdoptionDropDetails;
      details.feature = dropDetails.feature;
      details.dropPercentage = dropDetails.dropPercentage;
      details.usageCount = dropDetails.currentUsageFrequency;
    }

    return details;
  }

  /**
   * Calculate TTL for signal expiration
   */
  private calculateTTL(processedAt: number): number {
    const ttlDays = parseInt(process.env.SIGNAL_TTL_DAYS || '90', 10);
    const ttlSeconds = ttlDays * 24 * 60 * 60;
    return Math.floor(processedAt / 1000) + ttlSeconds;
  }
}
