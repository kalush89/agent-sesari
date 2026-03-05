/**
 * Signal Prioritization Module
 * 
 * Prioritizes Universal_Signals by combining severity and recency factors.
 * Returns the top 10 highest-priority signals for briefing generation.
 */

import type { Universal_Signal, Severity } from './types.js';

/**
 * Priority weights by severity level
 * Maps severity to numeric weight for scoring
 */
const SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 10,
  high: 5,
  medium: 2,
  low: 1
} as const;

/**
 * Maximum number of signals to return
 */
const MAX_SIGNALS = 10;

/**
 * Signal with calculated priority score
 */
interface ScoredSignal {
  signal: Universal_Signal;
  priorityScore: number;
}

/**
 * Prioritize signals by combining severity and recency
 * 
 * Algorithm:
 * 1. Calculate severity weight from signal.impact.severity
 * 2. Calculate recency weight: newer signals get higher weight (24 - ageHours)
 * 3. Multiply severity weight by recency weight for priority score
 * 4. Sort by priority score descending
 * 5. Return top 10 signals
 * 
 * @param signals - Array of Universal_Signals to prioritize
 * @returns Top 10 signals sorted by priority score (highest first)
 */
export function prioritizeSignals(signals: Universal_Signal[]): Universal_Signal[] {
  // Handle empty input
  if (signals.length === 0) {
    return [];
  }
  
  const now = Date.now();
  
  // Calculate priority score for each signal
  const scored: ScoredSignal[] = signals.map(signal => {
    const severityWeight = SEVERITY_WEIGHTS[signal.impact.severity];
    const ageHours = (now - signal.occurredAt) / (1000 * 60 * 60);
    const recencyWeight = Math.max(1, 24 - ageHours);
    const priorityScore = severityWeight * recencyWeight;
    
    return { signal, priorityScore };
  });
  
  // Sort by priority score descending
  scored.sort((a, b) => b.priorityScore - a.priorityScore);
  
  // Return top 10 signals
  return scored.slice(0, MAX_SIGNALS).map(item => item.signal);
}
