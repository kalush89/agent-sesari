/**
 * Revenue signal extraction from Stripe webhook events
 * Maps Stripe events to revenue signals (expansion, churn, failed payments)
 */

import Stripe from 'stripe';
import {
  RevenueSignalEvent,
  ExpansionDetails,
  ChurnDetails,
  FailedPaymentDetails,
} from './types.js';

/**
 * Extracts revenue signal from Stripe webhook event
 * Returns null for non-revenue event types
 */
export function extractRevenueSignal(
  stripeEvent: Stripe.Event
): RevenueSignalEvent | null {
  const eventType = stripeEvent.type;

  // Filter revenue-related events
  if (eventType === 'customer.subscription.updated') {
    return extractExpansionSignal(stripeEvent);
  }

  if (eventType === 'customer.subscription.deleted') {
    return extractChurnSignal(stripeEvent);
  }

  if (eventType === 'invoice.payment_failed') {
    return extractFailedPaymentSignal(stripeEvent);
  }

  // Log ignored event types for monitoring
  console.log(`Ignored non-revenue event type: ${eventType}`, {
    eventId: stripeEvent.id,
    eventType,
  });

  return null;
}

/**
 * Extracts expansion signal from subscription.updated events
 * Detects plan upgrades, quantity increases, and additional products
 */
export function extractExpansionSignal(
  stripeEvent: Stripe.Event
): RevenueSignalEvent | null {
  const subscription = stripeEvent.data.object as Stripe.Subscription;
  const previousAttributes = stripeEvent.data
    .previous_attributes as Partial<Stripe.Subscription>;

  // No previous attributes means no change
  if (!previousAttributes) {
    return null;
  }

  const oldMrr = calculateMRR(previousAttributes);
  const newMrr = calculateMRR(subscription);

  // No MRR change means not an expansion event
  if (oldMrr >= newMrr) {
    return null;
  }

  // Determine change type
  const details = determineExpansionType(subscription, previousAttributes);

  return {
    eventId: stripeEvent.id,
    eventType: 'expansion',
    customerId: subscription.customer as string,
    subscriptionId: subscription.id,
    timestamp: stripeEvent.created,
    processedAt: Math.floor(Date.now() / 1000),
    revenueImpact: {
      oldMrr,
      newMrr,
      currency: subscription.currency,
    },
    details,
    stripeEventType: stripeEvent.type,
  };
}

/**
 * Extracts churn signal from subscription.deleted events
 * Distinguishes between immediate and end-of-period cancellations
 */
export function extractChurnSignal(
  stripeEvent: Stripe.Event
): RevenueSignalEvent {
  const subscription = stripeEvent.data.object as Stripe.Subscription;

  const mrrLost = calculateMRR(subscription);
  const canceledAt = subscription.canceled_at || stripeEvent.created;
  const endsAt = subscription.current_period_end;

  // Determine cancellation type
  // If cancel_at_period_end is true, it's end_of_period
  // If canceled_at equals current_period_end, it's immediate
  const cancellationType: 'immediate' | 'end_of_period' =
    subscription.cancel_at_period_end
      ? 'end_of_period'
      : 'immediate';

  const details: ChurnDetails = {
    cancellationType,
    cancellationReason: subscription.cancellation_details?.reason || undefined,
    canceledAt,
    endsAt,
    mrrLost,
  };

  return {
    eventId: stripeEvent.id,
    eventType: 'churn',
    customerId: subscription.customer as string,
    subscriptionId: subscription.id,
    timestamp: stripeEvent.created,
    processedAt: Math.floor(Date.now() / 1000),
    revenueImpact: {
      oldMrr: mrrLost,
      newMrr: 0,
      currency: subscription.currency,
    },
    details,
    stripeEventType: stripeEvent.type,
  };
}

/**
 * Extracts failed payment signal from invoice.payment_failed events
 * Categorizes failure reasons and tracks retry attempts
 */
export function extractFailedPaymentSignal(
  stripeEvent: Stripe.Event
): RevenueSignalEvent {
  const invoice = stripeEvent.data.object as Stripe.Invoice;

  const failureCode = invoice.last_finalization_error?.code || 'unknown';
  const failureReason =
    invoice.last_finalization_error?.message || 'Payment failed';

  const details: FailedPaymentDetails = {
    failureReason,
    failureCode,
    failureCategory: categorizeFailureReason(failureCode),
    attemptCount: invoice.attempt_count || 1,
    nextRetryAt: invoice.next_payment_attempt || undefined,
  };

  return {
    eventId: stripeEvent.id,
    eventType: 'failed_payment',
    customerId: invoice.customer as string,
    subscriptionId: invoice.subscription as string | undefined,
    timestamp: stripeEvent.created,
    processedAt: Math.floor(Date.now() / 1000),
    revenueImpact: {
      amount: invoice.amount_due,
      currency: invoice.currency,
    },
    details,
    stripeEventType: stripeEvent.type,
  };
}

/**
 * Calculates monthly recurring revenue from subscription data
 */
function calculateMRR(
  subscription: Partial<Stripe.Subscription>
): number {
  if (!subscription.items?.data) {
    return 0;
  }

  let totalMrr = 0;

  for (const item of subscription.items.data) {
    const price = item.price;
    if (!price) continue;

    const quantity = item.quantity || 1;
    const unitAmount = price.unit_amount || 0;

    // Convert to monthly amount based on interval
    let monthlyAmount = unitAmount * quantity;

    if (price.recurring?.interval === 'year') {
      monthlyAmount = monthlyAmount / 12;
    } else if (price.recurring?.interval === 'day') {
      monthlyAmount = monthlyAmount * 30;
    } else if (price.recurring?.interval === 'week') {
      monthlyAmount = monthlyAmount * 4;
    }

    totalMrr += monthlyAmount;
  }

  // Convert from cents to dollars
  return totalMrr / 100;
}

/**
 * Determines the type of expansion from subscription changes
 */
function determineExpansionType(
  subscription: Stripe.Subscription,
  previousAttributes: Partial<Stripe.Subscription>
): ExpansionDetails {
  // Check for quantity increase
  if (previousAttributes.items?.data) {
    const oldQuantity = previousAttributes.items.data[0]?.quantity || 0;
    const newQuantity = subscription.items.data[0]?.quantity || 0;

    if (newQuantity > oldQuantity) {
      return {
        changeType: 'quantity_increase',
        oldQuantity,
        newQuantity,
      };
    }
  }

  // Check for plan upgrade
  if (previousAttributes.items?.data) {
    const oldPlanId = previousAttributes.items.data[0]?.price?.id;
    const newPlanId = subscription.items.data[0]?.price?.id;

    if (oldPlanId && newPlanId && oldPlanId !== newPlanId) {
      return {
        changeType: 'plan_upgrade',
        oldPlanId,
        newPlanId,
      };
    }
  }

  // Check for additional products
  const oldItemCount = previousAttributes.items?.data?.length || 0;
  const newItemCount = subscription.items.data.length;

  if (newItemCount > oldItemCount) {
    const additionalProducts = subscription.items.data
      .slice(oldItemCount)
      .map((item) => item.price?.id || 'unknown');

    return {
      changeType: 'additional_product',
      additionalProducts,
    };
  }

  // Default to plan upgrade if MRR increased but we can't determine why
  return {
    changeType: 'plan_upgrade',
  };
}

/**
 * Categorizes payment failure reason into standard categories
 */
function categorizeFailureReason(
  failureCode: string
): 'card_declined' | 'expired_card' | 'insufficient_funds' | 'other' {
  const code = failureCode.toLowerCase();

  if (code.includes('card_declined') || code.includes('declined')) {
    return 'card_declined';
  }

  if (code.includes('expired')) {
    return 'expired_card';
  }

  if (code.includes('insufficient_funds') || code.includes('insufficient')) {
    return 'insufficient_funds';
  }

  return 'other';
}
