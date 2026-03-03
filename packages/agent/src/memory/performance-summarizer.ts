/**
 * Performance Summarizer Module
 * 
 * Generates weekly performance summaries by aggregating business metrics.
 * Summaries include revenue changes, usage by segment, and churn indicators.
 */

import { PerformanceSummary } from './types';

/**
 * Input metrics for generating a weekly performance summary
 */
export interface WeeklyMetricsInput {
  weekStart: string; // ISO 8601 date
  weekEnd: string; // ISO 8601 date
  currentRevenue: number;
  previousRevenue: number;
  usageBySegment: Record<string, number>;
  atRiskCount: number;
  churnedCount: number;
}

/**
 * Generates a weekly performance summary document
 * 
 * @param metrics - Weekly business metrics to aggregate
 * @returns PerformanceSummary document ready for storage
 */
export function generateWeeklySummary(
  metrics: WeeklyMetricsInput
): PerformanceSummary {
  // Calculate revenue change percentage
  const revenueChangePercent = calculateRevenueChange(
    metrics.currentRevenue,
    metrics.previousRevenue
  );

  // Generate unique ID based on week start date
  const weekId = metrics.weekStart.split('T')[0]; // Extract YYYY-MM-DD

  return {
    id: `performance-${weekId}`,
    type: 'performance',
    timestamp: new Date().toISOString(),
    version: 1,
    weekStart: metrics.weekStart,
    weekEnd: metrics.weekEnd,
    metrics: {
      revenueChangePercent,
      usageBySegment: metrics.usageBySegment,
      churnIndicators: {
        atRiskCount: metrics.atRiskCount,
        churnedCount: metrics.churnedCount,
      },
    },
  };
}

/**
 * Calculates revenue change percentage from previous week
 * 
 * @param current - Current week revenue
 * @param previous - Previous week revenue
 * @returns Percentage change (e.g., 15.5 for 15.5% increase)
 */
function calculateRevenueChange(current: number, previous: number): number {
  // Handle edge case: previous revenue is zero
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }

  const change = ((current - previous) / previous) * 100;
  
  // Round to 2 decimal places
  return Math.round(change * 100) / 100;
}
