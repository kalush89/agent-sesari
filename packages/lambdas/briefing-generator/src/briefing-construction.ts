/**
 * Briefing Construction Module
 * 
 * Assembles insights into a complete briefing document with metadata.
 * Calculates category counts, priority levels, and formats the date.
 */

import type { Briefing, Insight, Universal_Signal } from './types.js';

/**
 * Construct a complete briefing document from insights
 * 
 * Assembles insights with metadata including:
 * - Signal count (total signals processed)
 * - Priority level (based on insight severities)
 * - Category counts (revenue, relationship, behavioral)
 * - Generation timestamp
 * - Formatted date (YYYY-MM-DD)
 * 
 * @param insights - Array of generated insights
 * @param allSignals - All signals that were processed
 * @returns Complete briefing document
 */
export function constructBriefing(
  insights: Insight[],
  allSignals: Universal_Signal[]
): Briefing {
  const now = Date.now();
  const date = formatDate(now);
  
  // Calculate category counts from all signals
  const categories = {
    revenue: allSignals.filter(s => s.category === 'revenue').length,
    relationship: allSignals.filter(s => s.category === 'relationship').length,
    behavioral: allSignals.filter(s => s.category === 'behavioral').length
  };
  
  // Determine overall priority level based on insight severities
  const priorityLevel = calculatePriorityLevel(insights);
  
  return {
    date,
    generatedAt: now,
    insights,
    metadata: {
      signalCount: allSignals.length,
      priorityLevel,
      categories
    }
  };
}

/**
 * Calculate overall priority level for the briefing
 * 
 * Priority determination:
 * - High: Contains at least one critical insight
 * - Medium: Contains at least one high severity insight, or more than 5 insights
 * - Low: All other cases
 * 
 * @param insights - Array of insights
 * @returns Priority level (high, medium, or low)
 */
export function calculatePriorityLevel(
  insights: Insight[]
): 'high' | 'medium' | 'low' {
  // Check for critical insights
  const hasCritical = insights.some(i => i.severity === 'critical');
  if (hasCritical) {
    return 'high';
  }
  
  // Check for high severity insights or many insights
  const hasHigh = insights.some(i => i.severity === 'high');
  if (hasHigh || insights.length > 5) {
    return 'medium';
  }
  
  return 'low';
}

/**
 * Format timestamp as YYYY-MM-DD date string
 * 
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Date string in YYYY-MM-DD format
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}
