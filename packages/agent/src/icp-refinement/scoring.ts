/**
 * Customer scoring engine for ICP refinement
 * Calculates Ideal Customer Score based on LTV, engagement, and retention
 */

import { CorrelatedCustomer, ScoredCustomer, ScoreBreakdown } from './types';

/**
 * Normalize LTV using percentile ranking
 * Maps revenue values to 0-100 scale based on position in distribution
 */
export function normalizeLTV(revenue: number, allRevenues: number[]): number {
  if (allRevenues.length === 0) return 0;
  if (allRevenues.length === 1) return revenue > 0 ? 100 : 0;
  
  // Handle edge cases
  if (!isFinite(revenue) || revenue < 0) return 0;
  
  // Count how many revenues are less than or equal to current revenue
  const rank = allRevenues.filter(r => r <= revenue).length;
  
  // Calculate percentile (0-100)
  const percentile = ((rank - 1) / (allRevenues.length - 1)) * 100;
  
  return Math.max(0, Math.min(100, percentile));
}

/**
 * Normalize engagement using percentile ranking
 * Maps event counts to 0-100 scale based on position in distribution
 */
export function normalizeEngagement(eventCount: number, allEventCounts: number[]): number {
  if (allEventCounts.length === 0) return 0;
  if (allEventCounts.length === 1) return eventCount > 0 ? 100 : 0;
  
  // Handle edge cases
  if (!isFinite(eventCount) || eventCount < 0) return 0;
  
  // If all values are zero, return 0 for everyone
  const hasNonZero = allEventCounts.some(c => c > 0);
  if (!hasNonZero && eventCount === 0) return 0;
  
  // Count how many event counts are less than or equal to current count
  const rank = allEventCounts.filter(c => c <= eventCount).length;
  
  // Calculate percentile (0-100)
  const percentile = ((rank - 1) / (allEventCounts.length - 1)) * 100;
  
  return Math.max(0, Math.min(100, percentile));
}

/**
 * Calculate retention score combining retention rate with churn signal penalty
 * Retention rate is already 0-100, apply 50% penalty if churn signal present
 */
export function calculateRetentionScore(retentionRate: number, hasChurnSignal: boolean): number {
  // Handle edge cases
  if (!isFinite(retentionRate) || retentionRate < 0) return 0;
  
  // Clamp retention rate to 0-100
  const clampedRate = Math.max(0, Math.min(100, retentionRate));
  
  // Apply 50% penalty if churn signal detected
  return hasChurnSignal ? clampedRate * 0.5 : clampedRate;
}

/**
 * Calculate Ideal Customer Score for a single customer
 * Uses weighted average: LTV (40%), Engagement (30%), Retention (30%)
 */
export function calculateIdealCustomerScore(
  customer: CorrelatedCustomer,
  allCustomers: CorrelatedCustomer[]
): ScoredCustomer {
  // Extract all revenues and event counts for normalization
  const allRevenues = allCustomers.map(c => c.hubspot.totalRevenue);
  const allEventCounts = allCustomers.map(c => c.mixpanel?.ahaEventCount || 0);
  
  // Calculate component scores
  const ltvScore = normalizeLTV(customer.hubspot.totalRevenue, allRevenues);
  const engagementScore = normalizeEngagement(
    customer.mixpanel?.ahaEventCount || 0,
    allEventCounts
  );
  const retentionScore = calculateRetentionScore(
    customer.mixpanel?.retentionRate || 0,
    customer.stripe?.hasChurnSignal || false
  );
  
  // Calculate weighted average
  const idealCustomerScore = (ltvScore * 0.4) + (engagementScore * 0.3) + (retentionScore * 0.3);
  
  const scoreBreakdown: ScoreBreakdown = {
    ltvScore,
    engagementScore,
    retentionScore
  };
  
  return {
    ...customer,
    idealCustomerScore,
    scoreBreakdown
  };
}
