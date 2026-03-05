/**
 * Type definitions for Daily Briefing Generator
 */

/**
 * A single insight in the daily briefing
 */
export interface Insight {
  id: string;
  narrative: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'revenue' | 'relationship' | 'behavioral';
  thoughtTrace: ThoughtTrace;
  growthPlay: GrowthPlay;
}

/**
 * Source signals that led to an insight
 */
export interface ThoughtTrace {
  signals: Array<{
    source: string;
    eventType: string;
    timestamp: number;
    severity: string;
  }>;
}

/**
 * Actionable recommendation
 */
export interface GrowthPlay {
  label: string;
  action: 'navigate' | 'external';
  target: string;
}

/**
 * Complete daily briefing
 */
export interface Briefing {
  date: string;
  generatedAt: number;
  signalCount: number;
  insightCount: number;
  priorityLevel: 'critical' | 'high' | 'normal';
  insights: Insight[];
}
