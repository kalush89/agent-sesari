/**
 * Stripe Signal Translator
 * 
 * Translates Stripe RevenueSignalEvents into Universal_Signal format
 */

import { Signal_Translator } from '../interfaces';
import {
  Universal_Signal,
  EntityMapping,
  EVENT_TAXONOMY,
  UniversalEventType,
  StripeDetails,
  Severity,
} from '../types';
import { randomUUID } from 'crypto';

/**
 * Stripe-specific signal types (from stripe-connector)
 */
interface RevenueImpact {
  oldMrr?: number;
  newMrr?: number;
  amount?: number;
  currency: string;
}

interface ExpansionDetails {
  changeType: 'plan_upgrade' | 'quantity_increase' | 'additional_product';
  oldPlanId?: string;
  newPlanId?: string;
  oldQuantity?: number;
  newQuantity?: number;
  additionalProducts?: string[];
}

interface ChurnDetails {
  cancellationType: 'immediate' | 'end_of_period';
  cancellationReason?: string;
  canceledAt: number;
  endsAt?: number;
  mrrLost: number;
}

interface FailedPaymentDetails {
  failureReason: string;
  failureCode: string;
  failureCategory: 'card_declined' | 'expired_card' | 'insufficient_funds' | 'other';
  attemptCount: number;
  nextRetryAt?: number;
}

export interface RevenueSignalEvent {
  eventId: string;
  eventType: 'expansion' | 'churn' | 'failed_payment';
  customerId: string;
  subscriptionId?: string;
  timestamp: number;
  processedAt: number;
  revenueImpact: RevenueImpact;
  details: ExpansionDetails | ChurnDetails | FailedPaymentDetails;
  stripeEventType: string;
  rawPayload?: string;
}

/**
 * Translator for Stripe revenue signals
 */
export class StripeSignalTranslator implements Signal_Translator<RevenueSignalEvent> {
  /**
   * Translate Stripe signal to Universal_Signal
   */
  async translate(
    signal: RevenueSignalEvent,
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
      category: 'revenue',
      eventType,
      entity: {
        primaryKey: entityMapping?.primaryKey || signal.customerId,
        alternateKeys: entityMapping?.alternateKeys || [],
        platformIds: {
          stripe: signal.customerId,
          ...(entityMapping?.platformIds || {}),
        },
      },
      occurredAt: signal.timestamp,
      processedAt: signal.processedAt,
      source: {
        platform: 'stripe',
        originalEventType: signal.eventType,
        originalEventId: signal.eventId,
      },
      impact: {
        severity,
        metrics: {
          revenue: {
            amount: signal.revenueImpact.amount || 0,
            currency: signal.revenueImpact.currency,
            mrr: signal.revenueImpact.newMrr,
            mrrChange: this.calculateMrrChange(signal.revenueImpact),
          },
        },
      },
      platformDetails,
      ttl,
    };

    return universalSignal;
  }

  /**
   * Validate required fields in Stripe signal
   */
  validate(signal: RevenueSignalEvent): boolean {
    if (!signal.eventId || !signal.eventType || !signal.customerId) {
      return false;
    }

    if (!signal.timestamp || signal.timestamp <= 0) {
      return false;
    }

    if (!signal.revenueImpact || !signal.revenueImpact.currency) {
      return false;
    }

    return true;
  }

  /**
   * Extract correlation keys from Stripe signal
   */
  async extractCorrelationKeys(signal: RevenueSignalEvent): Promise<string[]> {
    const keys: string[] = [signal.customerId];
    
    // Additional correlation keys could be extracted from rawPayload if needed
    // For now, we only have customerId
    
    return keys;
  }

  /**
   * Map Stripe event type to universal taxonomy
   */
  private mapEventType(stripeEventType: string): UniversalEventType {
    const mapped = EVENT_TAXONOMY[stripeEventType];
    if (!mapped) {
      throw new Error(`Unknown Stripe event type: ${stripeEventType}`);
    }
    return mapped;
  }

  /**
   * Calculate severity based on revenue impact
   */
  private calculateSeverity(signal: RevenueSignalEvent): Severity {
    const mrrChange = this.calculateMrrChange(signal.revenueImpact);
    const absMrrChange = Math.abs(mrrChange || 0);

    if (signal.eventType === 'failed_payment') {
      return 'high';
    }

    if (signal.eventType === 'churn') {
      return absMrrChange > 1000 ? 'critical' : 'high';
    }

    if (absMrrChange > 5000) return 'critical';
    if (absMrrChange > 1000) return 'high';
    if (absMrrChange > 100) return 'medium';
    return 'low';
  }

  /**
   * Calculate MRR change
   */
  private calculateMrrChange(impact: RevenueImpact): number | undefined {
    if (impact.oldMrr !== undefined && impact.newMrr !== undefined) {
      return impact.newMrr - impact.oldMrr;
    }
    return undefined;
  }

  /**
   * Extract Stripe-specific details
   */
  private extractPlatformDetails(signal: RevenueSignalEvent): StripeDetails {
    const details: StripeDetails = {
      subscriptionId: signal.subscriptionId,
    };

    if (signal.eventType === 'churn') {
      const churnDetails = signal.details as ChurnDetails;
      details.cancellationType = churnDetails.cancellationType;
    }

    if (signal.eventType === 'failed_payment') {
      const failedDetails = signal.details as FailedPaymentDetails;
      details.failureCode = failedDetails.failureCode;
      details.nextRetryAt = failedDetails.nextRetryAt;
    }

    if (signal.eventType === 'expansion') {
      const expansionDetails = signal.details as ExpansionDetails;
      details.planId = expansionDetails.newPlanId;
      details.quantity = expansionDetails.newQuantity;
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
