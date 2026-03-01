/**
 * Top customer selection for ICP trait analysis
 * Filters scored customers to identify high-value segments
 */

import { ScoredCustomer } from './types';

/**
 * Select top customers by percentile threshold
 * Sorts customers by idealCustomerScore descending and returns top N%
 * 
 * @param customers - Array of scored customers
 * @param percentile - Percentile threshold (e.g., 10 for top 10%)
 * @returns Top customers by score
 */
export function selectTopCustomers(
  customers: ScoredCustomer[],
  percentile: number
): ScoredCustomer[] {
  // Sort by idealCustomerScore descending
  const sorted = [...customers].sort((a, b) => b.idealCustomerScore - a.idealCustomerScore);
  
  // Calculate number of customers to select: ceil(N * percentile/100)
  const count = Math.ceil(customers.length * (percentile / 100));
  
  // Return top N customers
  return sorted.slice(0, count);
}

/**
 * Validate that sample size is sufficient for reliable analysis
 * Throws error if dataset is too small
 * 
 * @param customers - Array of scored customers
 * @param minSize - Minimum required dataset size
 * @throws Error if validation fails
 */
export function validateSampleSize(
  customers: ScoredCustomer[],
  minSize: number
): void {
  // Check total dataset size
  if (customers.length < minSize) {
    throw new Error(
      `Insufficient sample size: ${customers.length} customers (minimum: ${minSize})`
    );
  }
  
  // Check that top 10% contains at least 5 customers
  const top10Count = Math.ceil(customers.length * 0.1);
  if (top10Count < 5) {
    throw new Error(
      `Top 10% sample too small: ${top10Count} customers (minimum: 5). ` +
      `Need at least 50 total customers for reliable analysis.`
    );
  }
}
