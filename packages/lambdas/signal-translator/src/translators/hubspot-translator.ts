/**
 * HubSpot Signal Translator
 * 
 * Translates HubSpot RelationshipSignalEvents into Universal_Signal format
 */

import { Signal_Translator } from '../interfaces';
import {
  Universal_Signal,
  EntityMapping,
  EVENT_TAXONOMY,
  UniversalEventType,
  HubSpotDetails,
  Severity,
} from '../types';
import { randomUUID } from 'crypto';

/**
 * HubSpot-specific signal types (from hubspot-connector)
 */
interface DealProgressionDetails {
  oldStage: string;
  newStage: string;
  isRegression: boolean;
  dealValue: number;
  currency: string;
  closeDate?: number;
  dealName: string;
}

interface CommunicationGapDetails {
  lastCommunicationDate: number;
  daysSinceLastContact: number;
  importanceLevel: 'high' | 'medium' | 'low';
  relationshipType: 'active_deal' | 'existing_customer';
  dealValue?: number;
  customerLifetimeValue?: number;
}

interface SentimentDetails {
  sentimentScore: number;
  sentimentCategory: 'positive' | 'neutral' | 'negative';
  sourceType: 'note' | 'email' | 'call';
  sourceId: string;
  textExcerpt: string;
  keywords: string[];
}

export interface RelationshipSignalEvent {
  eventId: string;
  eventType: 'deal_progression' | 'communication_gap' | 'sentiment';
  companyId: string;
  contactId?: string;
  dealId?: string;
  timestamp: number;
  processedAt: number;
  details: DealProgressionDetails | CommunicationGapDetails | SentimentDetails;
  hubspotEventType?: string;
  rawPayload?: string;
}

/**
 * Translator for HubSpot relationship signals
 */
export class HubSpotSignalTranslator implements Signal_Translator<RelationshipSignalEvent> {
  /**
   * Translate HubSpot signal to Universal_Signal
   */
  async translate(
    signal: RelationshipSignalEvent,
    entityMapping?: EntityMapping
  ): Promise<Universal_Signal | null> {
    if (!this.validate(signal)) {
      return null;
    }

    const eventType = this.mapEventType(signal);
    const severity = this.calculateSeverity(signal);
    const platformDetails = this.extractPlatformDetails(signal);
    const ttl = this.calculateTTL(signal.processedAt);

    const universalSignal: Universal_Signal = {
      signalId: randomUUID(),
      category: 'relationship',
      eventType,
      entity: {
        primaryKey: entityMapping?.primaryKey || signal.companyId,
        alternateKeys: entityMapping?.alternateKeys || [],
        platformIds: {
          hubspot: signal.companyId,
          ...(entityMapping?.platformIds || {}),
        },
      },
      occurredAt: signal.timestamp,
      processedAt: signal.processedAt,
      source: {
        platform: 'hubspot',
        originalEventType: signal.eventType,
        originalEventId: signal.eventId,
      },
      impact: {
        severity,
        metrics: {
          relationship: this.extractRelationshipMetrics(signal),
        },
      },
      platformDetails,
      ttl,
    };

    return universalSignal;
  }

  /**
   * Validate required fields in HubSpot signal
   */
  validate(signal: RelationshipSignalEvent): boolean {
    if (!signal.eventId || !signal.eventType || !signal.companyId) {
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
   * Extract correlation keys from HubSpot signal
   */
  async extractCorrelationKeys(signal: RelationshipSignalEvent): Promise<string[]> {
    const keys: string[] = [signal.companyId];
    
    if (signal.contactId) {
      keys.push(signal.contactId);
    }
    
    return keys;
  }

  /**
   * Map HubSpot event type to universal taxonomy
   */
  private mapEventType(signal: RelationshipSignalEvent): UniversalEventType {
    if (signal.eventType === 'deal_progression') {
      const details = signal.details as DealProgressionDetails;
      return details.isRegression 
        ? EVENT_TAXONOMY['deal_regression']
        : EVENT_TAXONOMY['deal_progression'];
    }

    if (signal.eventType === 'communication_gap') {
      return EVENT_TAXONOMY['communication_gap'];
    }

    if (signal.eventType === 'sentiment') {
      const details = signal.details as SentimentDetails;
      return details.sentimentCategory === 'positive'
        ? EVENT_TAXONOMY['sentiment_positive']
        : EVENT_TAXONOMY['sentiment_negative'];
    }

    throw new Error(`Unknown HubSpot event type: ${signal.eventType}`);
  }

  /**
   * Calculate severity based on relationship impact
   */
  private calculateSeverity(signal: RelationshipSignalEvent): Severity {
    if (signal.eventType === 'deal_progression') {
      const details = signal.details as DealProgressionDetails;
      if (details.isRegression) {
        return details.dealValue > 50000 ? 'critical' : 'high';
      }
      return details.dealValue > 50000 ? 'high' : 'medium';
    }

    if (signal.eventType === 'communication_gap') {
      const details = signal.details as CommunicationGapDetails;
      if (details.importanceLevel === 'high') {
        return 'high';
      }
      return details.importanceLevel === 'medium' ? 'medium' : 'low';
    }

    if (signal.eventType === 'sentiment') {
      const details = signal.details as SentimentDetails;
      if (details.sentimentCategory === 'negative') {
        return 'high';
      }
      return details.sentimentCategory === 'positive' ? 'medium' : 'low';
    }

    return 'medium';
  }

  /**
   * Extract relationship metrics
   */
  private extractRelationshipMetrics(signal: RelationshipSignalEvent) {
    if (signal.eventType === 'deal_progression') {
      const details = signal.details as DealProgressionDetails;
      return {
        dealValue: details.dealValue,
      };
    }

    if (signal.eventType === 'communication_gap') {
      const details = signal.details as CommunicationGapDetails;
      return {
        daysSinceContact: details.daysSinceLastContact,
      };
    }

    if (signal.eventType === 'sentiment') {
      const details = signal.details as SentimentDetails;
      return {
        sentimentScore: details.sentimentScore,
      };
    }

    return {};
  }

  /**
   * Extract HubSpot-specific details
   */
  private extractPlatformDetails(signal: RelationshipSignalEvent): HubSpotDetails {
    const details: HubSpotDetails = {
      contactId: signal.contactId,
      dealId: signal.dealId,
    };

    if (signal.eventType === 'deal_progression') {
      const dealDetails = signal.details as DealProgressionDetails;
      details.dealStage = dealDetails.newStage;
      details.dealName = dealDetails.dealName;
    }

    if (signal.eventType === 'sentiment') {
      const sentimentDetails = signal.details as SentimentDetails;
      details.sourceType = sentimentDetails.sourceType;
      details.keywords = sentimentDetails.keywords;
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
