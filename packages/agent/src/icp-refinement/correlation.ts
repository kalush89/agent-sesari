/**
 * Data correlation engine for joining customer records across platforms
 * Performs left join with HubSpot as primary key
 */

import { HubSpotCompany, MixpanelCohort, StripeCustomer, CorrelatedCustomer } from './types.js';

/**
 * Data completeness metrics for correlation analysis
 */
export interface CorrelationCompletenessMetrics {
  totalCustomers: number;
  mixpanelAvailable: number;
  stripeAvailable: number;
  mixpanelCompleteness: number;
  stripeCompleteness: number;
}

/**
 * Correlates customer data from HubSpot, Mixpanel, and Stripe
 * Uses HubSpot company ID as primary key and performs left join
 * 
 * @param hubspotCompanies - Array of HubSpot company records (required)
 * @param mixpanelCohorts - Array of Mixpanel cohort records (may contain nulls)
 * @param stripeCustomers - Array of Stripe customer records (may contain nulls)
 * @returns Array of correlated customer records with exactly one per HubSpot company
 */
export function correlateCustomerData(
  hubspotCompanies: HubSpotCompany[],
  mixpanelCohorts: (MixpanelCohort | null)[],
  stripeCustomers: (StripeCustomer | null)[]
): CorrelatedCustomer[] {
  // Create lookup maps for efficient correlation
  const mixpanelMap = new Map<string, MixpanelCohort>();
  const stripeMap = new Map<string, StripeCustomer>();

  // Build Mixpanel lookup map
  for (const cohort of mixpanelCohorts) {
    if (cohort !== null) {
      mixpanelMap.set(cohort.companyId, cohort);
    }
  }

  // Build Stripe lookup map
  for (const customer of stripeCustomers) {
    if (customer !== null) {
      stripeMap.set(customer.companyId, customer);
    }
  }

  // Perform left join with HubSpot as primary key
  const correlatedCustomers: CorrelatedCustomer[] = hubspotCompanies.map((hubspotCompany) => {
    const companyId = hubspotCompany.companyId;

    return {
      companyId,
      hubspot: hubspotCompany,
      mixpanel: mixpanelMap.get(companyId) || null,
      stripe: stripeMap.get(companyId) || null,
    };
  });

  return correlatedCustomers;
}

/**
 * Calculates data completeness metrics from correlated customers
 * 
 * @param correlatedCustomers - Array of correlated customer records
 * @returns Completeness metrics including percentages
 */
export function calculateCorrelationCompleteness(
  correlatedCustomers: CorrelatedCustomer[]
): CorrelationCompletenessMetrics {
  const totalCustomers = correlatedCustomers.length;
  const mixpanelAvailable = correlatedCustomers.filter(c => c.mixpanel !== null).length;
  const stripeAvailable = correlatedCustomers.filter(c => c.stripe !== null).length;

  return {
    totalCustomers,
    mixpanelAvailable,
    stripeAvailable,
    mixpanelCompleteness: totalCustomers > 0 ? (mixpanelAvailable / totalCustomers) * 100 : 0,
    stripeCompleteness: totalCustomers > 0 ? (stripeAvailable / totalCustomers) * 100 : 0,
  };
}

/**
 * Logs data completeness warnings for customers with incomplete data
 * 
 * @param correlatedCustomers - Array of correlated customer records
 * @param metrics - Completeness metrics
 */
export function logCompletenessWarnings(
  correlatedCustomers: CorrelatedCustomer[],
  metrics: CorrelationCompletenessMetrics
): void {
  console.log('=== Correlation Completeness Metrics ===');
  console.log(`Total customers: ${metrics.totalCustomers}`);
  console.log(`Mixpanel: ${metrics.mixpanelAvailable} (${metrics.mixpanelCompleteness.toFixed(1)}%)`);
  console.log(`Stripe: ${metrics.stripeAvailable} (${metrics.stripeCompleteness.toFixed(1)}%)`);

  // Log warnings for incomplete data
  const customersWithoutMixpanel = correlatedCustomers.filter(c => c.mixpanel === null);
  const customersWithoutStripe = correlatedCustomers.filter(c => c.stripe === null);

  if (customersWithoutMixpanel.length > 0) {
    console.warn(`WARNING: ${customersWithoutMixpanel.length} customers missing Mixpanel data`);
  }

  if (customersWithoutStripe.length > 0) {
    console.warn(`WARNING: ${customersWithoutStripe.length} customers missing Stripe data`);
  }

  // Log specific warnings for low completeness
  if (metrics.mixpanelCompleteness < 50) {
    console.warn('WARNING: Mixpanel data completeness is below 50%');
  }

  if (metrics.stripeCompleteness < 50) {
    console.warn('WARNING: Stripe data completeness is below 50%');
  }
}
