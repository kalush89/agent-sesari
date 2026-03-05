'use client';

import { useState } from 'react';
import { formatRelativeTime } from '@/lib/format';

/**
 * Insight interface for the daily briefing
 */
interface Insight {
  id: string;
  narrative: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'revenue' | 'relationship' | 'behavioral';
  thoughtTrace: {
    signals: Array<{
      source: string;
      eventType: string;
      timestamp: number;
      severity: string;
    }>;
  };
  growthPlay: {
    label: string;
    action: 'navigate' | 'external';
    target: string;
  };
}

interface InsightCardProps {
  insight: Insight;
}

/**
 * InsightCard Component
 * 
 * Displays a single insight in the daily briefing with:
 * - Narrative text
 * - Severity indicator (red dot for critical)
 * - Collapsible Thought Trace section
 * - Growth Play action button
 * 
 * Follows Sesari's Agentic Editorial aesthetic with high whitespace
 * and minimal borders.
 */
export function InsightCard({ insight }: InsightCardProps) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <article
      className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
      aria-labelledby={`insight-${insight.id}`}
    >
      {/* Severity indicator - red dot for critical */}
      {insight.severity === 'critical' && (
        <div 
          className="w-2 h-2 rounded-full bg-[#FF3D00] mb-4" 
          aria-label="Critical severity"
          role="status"
        />
      )}
      
      {/* Narrative text */}
      <p
        id={`insight-${insight.id}`}
        className="text-[#1A1A1A] text-base leading-relaxed mb-6"
      >
        {insight.narrative}
      </p>
      
      {/* Thought Trace toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-gray-600 hover:text-[#1A1A1A] transition-colors mb-4 focus:outline-none focus:ring-2 focus:ring-[#6B46C1] focus:ring-offset-2 rounded"
        aria-expanded={expanded}
        aria-controls={`thought-trace-${insight.id}`}
        aria-label={expanded ? 'Hide source signals' : 'Show source signals'}
      >
        <span className="font-medium">Why?</span>
        {expanded ? (
          <ChevronUpIcon />
        ) : (
          <ChevronDownIcon />
        )}
      </button>
      
      {/* Thought Trace content */}
      {expanded && (
        <ThoughtTrace
          signals={insight.thoughtTrace.signals}
          insightId={insight.id}
        />
      )}
      
      {/* Growth Play button */}
      <button
        onClick={() => handleGrowthPlay(insight.growthPlay)}
        className="bg-[#00C853] text-white px-5 py-2.5 rounded-md hover:bg-[#00A844] transition-colors font-medium text-sm focus:outline-none focus:ring-2 focus:ring-[#00C853] focus:ring-offset-2"
        aria-label={insight.growthPlay.label}
      >
        {insight.growthPlay.label}
      </button>
    </article>
  );
}

/**
 * ChevronDown Icon Component
 */
function ChevronDownIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/**
 * ChevronUp Icon Component
 */
function ChevronUpIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

/**
 * ThoughtTrace Component
 * 
 * Displays source signals that led to an insight.
 * Shows up to 5 signals with system, event type, timestamp, and severity.
 */
interface ThoughtTraceProps {
  signals: Array<{
    source: string;
    eventType: string;
    timestamp: number;
    severity: string;
  }>;
  insightId: string;
}

function ThoughtTrace({ signals, insightId }: ThoughtTraceProps) {
  // Limit to 5 signals maximum
  const displaySignals = signals.slice(0, 5);
  
  return (
    <div
      id={`thought-trace-${insightId}`}
      className="bg-gray-50 rounded-md p-4 mb-6 space-y-3"
      role="region"
      aria-label="Source signals"
    >
      {displaySignals.map((signal, idx) => (
        <div key={idx} className="text-sm flex flex-wrap items-center gap-2">
          <span className="font-semibold text-[#1A1A1A] capitalize">
            {signal.source}
          </span>
          <span className="text-gray-400">•</span>
          <span className="text-gray-600">
            {formatEventType(signal.eventType)}
          </span>
          <span className="text-gray-400">•</span>
          <span className="text-gray-500">
            {formatRelativeTime(signal.timestamp)}
          </span>
          <span className="text-gray-400">•</span>
          <SeverityBadge severity={signal.severity} />
        </div>
      ))}
    </div>
  );
}

/**
 * SeverityBadge Component
 * 
 * Displays a colored badge for signal severity.
 */
interface SeverityBadgeProps {
  severity: string;
}

function SeverityBadge({ severity }: SeverityBadgeProps) {
  const colors = {
    critical: 'bg-red-100 text-red-800',
    high: 'bg-orange-100 text-orange-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-gray-100 text-gray-800',
  };
  
  const colorClass = colors[severity as keyof typeof colors] || colors.low;
  
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}
      role="status"
      aria-label={`${severity} severity`}
    >
      {severity}
    </span>
  );
}

/**
 * Handle Growth Play button click
 * 
 * Navigates to internal route or opens external URL in new tab.
 */
function handleGrowthPlay(growthPlay: Insight['growthPlay']) {
  if (growthPlay.action === 'navigate') {
    window.location.href = growthPlay.target;
  } else {
    window.open(growthPlay.target, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Format event type for display
 * 
 * Converts dot-notation event types to readable format.
 * Example: "revenue.expansion" -> "Revenue Expansion"
 */
function formatEventType(eventType: string): string {
  return eventType
    .split('.')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
