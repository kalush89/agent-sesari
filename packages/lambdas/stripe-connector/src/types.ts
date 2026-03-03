/**
 * Core type definitions for Revenue Senses Stripe Connector
 */

/**
 * Details for expansion revenue signals
 */
export interface ExpansionDetails {
  changeType: 'plan_upgrade' | 'quantity_increase' | 'additional_product';
  oldPlanId?: string;
  newPlanId?: string;
  oldQuantity?: number;
  newQuantity?: number;
  additionalProducts?: string[];
}

/**
 * Details for churn revenue signals
 */
export interface ChurnDetails {
  cancellationType: 'immediate' | 'end_of_period';
  cancellationReason?: string;
  canceledAt: number;
  endsAt?: number;
  mrrLost: number;
}

/**
 * Details for failed payment revenue signals
 */
export interface FailedPaymentDetails {
  failureReason: string;
  failureCode: string;
  failureCategory: 'card_declined' | 'expired_card' | 'insufficient_funds' | 'other';
  attemptCount: number;
  nextRetryAt?: number;
}

/**
 * Revenue impact information
 */
export interface RevenueImpact {
  oldMrr?: number;
  newMrr?: number;
  amount?: number;
  currency: string;
}

/**
 * Main revenue signal event stored in DynamoDB
 */
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
