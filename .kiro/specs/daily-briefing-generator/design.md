# Design Document: Daily Briefing Generator

## Overview

The Daily Briefing Generator transforms raw business signals into a narrative-driven morning memo that feels like reading a well-crafted editorial rather than interpreting dashboards. It bridges the execution gap by proactively surfacing insights and actionable recommendations in a calm, editorial aesthetic.

The system operates on a scheduled basis (8:00 AM UTC daily) to retrieve signals from the past 24 hours, prioritize them by business impact, generate human-readable narratives using Amazon Nova Lite, and present them in a clean Next.js UI that follows the "Agentic Editorial" design philosophy.

Key design goals:
1. **Proactive Intelligence**: Push insights to users rather than requiring dashboard exploration
2. **Narrative-First**: Transform data into stories that explain what's happening and why
3. **High Agency**: Every insight includes a one-click action (Growth Play)
4. **Explainability**: Show the source signals (Thought Trace) behind each insight for trust
5. **AWS Free Tier Compliance**: Optimize for minimal costs while maintaining reliability
6. **Theme Flexibility**: Support both light and dark themes for user preference

The architecture consists of three main components:
- **Backend Pipeline**: Lambda functions for signal retrieval, prioritization, and narrative generation
- **Storage Layer**: DynamoDB for briefing storage with 90-day retention
- **Frontend UI**: Next.js components with editorial styling and theme switching

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    EventBridge Scheduler                        │
│              (Triggers daily at 8:00 AM UTC)                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              Briefing Generator Lambda                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  1. Retrieve signals from past 24 hours                  │  │
│  │  2. Prioritize signals by impact                         │  │
│  │  3. Generate narratives with Nova Lite                   │  │
│  │  4. Store briefing in DynamoDB                           │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────┬────────────────────────────────────────────────────┘
             │
             │ Reads from
             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Universal Signals Store (DynamoDB)                 │
│  - Revenue signals from Stripe                                  │
│  - Relationship signals from HubSpot                            │
│  - Behavioral signals from Mixpanel                             │
└────────────┬────────────────────────────────────────────────────┘
             │
             │ Writes to
             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Briefing Store (DynamoDB)                          │
│  - Generated briefings with metadata                            │
│  - 90-day retention via TTL                                     │
│  - Cached for same-day requests                                 │
└────────────┬────────────────────────────────────────────────────┘
             │
             │ Fetched by
             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Next.js Frontend (apps/web)                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Briefing UI Components:                                 │  │
│  │  - Editorial layout with theme switching                 │  │
│  │  - Insight cards with collapsible Thought Trace          │  │
│  │  - Growth Play action buttons                            │  │
│  │  - Date navigation for briefing history                  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

**Briefing Generator Lambda**:
- Triggered by EventBridge on schedule (8:00 AM UTC daily)
- Retrieves signals from UniversalSignals table (past 24 hours)
- Invokes Signal Prioritizer to rank signals by importance
- Calls Narrative Engine to generate human-readable text
- Stores completed briefing in Briefing Store
- Handles errors gracefully with fallback strategies
- Completes within 30 seconds to optimize Lambda costs

**Signal Prioritizer**:
- Ranks signals by combining urgency score and business impact
- Assigns priority weights based on severity (critical=10, warning=5, info=1)
- Returns top 10 highest-priority signals
- Pure function with no side effects (easily testable)

**Narrative Engine**:
- Transforms structured signals into narrative sentences
- Uses Amazon Nova Lite for cost-effective text generation
- Includes entity name, observation, and recommended action
- Limits narratives to 150 words maximum
- Formats currency values and behavioral metrics appropriately
- Falls back to template-based generation if AI fails

**Briefing Store**:
- DynamoDB table storing generated briefings
- Key format: `briefing/{user_id}/{YYYY-MM-DD}`
- Includes metadata: generation timestamp, signal count, priority level
- Compresses content to minimize storage costs
- 90-day TTL for automatic cleanup

**Briefing UI (Next.js)**:
- Server-side rendering for initial page load
- Client-side components for interactivity
- Theme context provider for light/dark mode switching
- Skeleton loaders during data fetching
- Responsive design following Sesari UI standards
- Full keyboard navigation and screen reader support

### Integration Points

**With Universal Signal Schema**:
- Reads from UniversalSignals DynamoDB table
- Queries by time range using GSI2 (CategoryIndex)
- Accesses all three signal categories (revenue, relationship, behavioral)
- Uses Universal_Signal schema for consistent data structure

**With Amazon Bedrock**:
- Invokes Nova Lite model for narrative generation
- Sends structured prompt with signal data
- Receives narrative text response
- Implements retry logic for transient failures

**With Next.js App Router**:
- API route `/api/briefings/[date]` for fetching briefings
- Server components for initial render
- Client components for theme switching and interactions
- Streaming responses for large briefings

### Data Flow

1. **Scheduled Trigger**: EventBridge triggers Briefing Generator Lambda at 8:00 AM UTC
2. **Signal Retrieval**: Lambda queries UniversalSignals table for past 24 hours
3. **Prioritization**: Signal Prioritizer ranks signals by impact and urgency
4. **Narrative Generation**: Narrative Engine transforms top 10 signals into stories
5. **Storage**: Completed briefing stored in Briefing Store with metadata
6. **User Request**: User visits briefing page in Next.js app
7. **Fetch**: API route retrieves briefing from Briefing Store
8. **Render**: UI components display briefing with editorial styling
9. **Interaction**: User expands Thought Trace, clicks Growth Play buttons

## Components and Interfaces

### Briefing Generator Lambda

**Entry Point**: `packages/lambdas/briefing-generator/src/index.ts`

```typescript
/**
 * Lambda handler for daily briefing generation
 * Triggered by EventBridge scheduler at 8:00 AM UTC
 */
export async function handler(event: ScheduledEvent): Promise<void> {
  const startTime = Date.now();
  const userId = 'default'; // TODO: Multi-tenant support
  const now = Date.now();
  const yesterday = now - 24 * 60 * 60 * 1000;
  
  try {
    // 1. Retrieve signals from past 24 hours
    const signals = await retrieveSignals(yesterday, now);
    
    // 2. Prioritize signals
    const prioritized = prioritizeSignals(signals);
    
    // 3. Generate narratives
    const insights = await generateNarratives(prioritized);
    
    // 4. Store briefing
    await storeBriefing(userId, insights, signals.length);
    
    const duration = Date.now() - startTime;
    console.log(`Briefing generated in ${duration}ms`);
  } catch (error) {
    console.error('Briefing generation failed:', error);
    // Retry once after 5 minutes (handled by EventBridge)
    throw error;
  }
}
```

**Environment Variables**:
```
UNIVERSAL_SIGNALS_TABLE=UniversalSignals
BRIEFING_STORE_TABLE=Briefings
BEDROCK_MODEL_ID=amazon.nova-lite-v1:0
AWS_REGION=us-east-1
MAX_INSIGHTS=10
NARRATIVE_MAX_WORDS=150
```

### Signal Retrieval

```typescript
/**
 * Retrieve signals from UniversalSignals table for time range
 * @param startTime - Unix timestamp for start of range
 * @param endTime - Unix timestamp for end of range
 * @returns Array of Universal_Signals
 */
async function retrieveSignals(
  startTime: number,
  endTime: number
): Promise<Universal_Signal[]> {
  const client = new DynamoDBClient({ region: process.env.AWS_REGION });
  const signals: Universal_Signal[] = [];
  
  // Query all three categories
  for (const category of ['revenue', 'relationship', 'behavioral']) {
    const command = new QueryCommand({
      TableName: process.env.UNIVERSAL_SIGNALS_TABLE,
      IndexName: 'CategoryIndex',
      KeyConditionExpression: 'GSI2PK = :category AND GSI2SK BETWEEN :start AND :end',
      ExpressionAttributeValues: {
        ':category': { S: `category#${category}` },
        ':start': { S: `${startTime}#` },
        ':end': { S: `${endTime}#zzz` }
      }
    });
    
    const response = await client.send(command);
    if (response.Items) {
      signals.push(...response.Items.map(unmarshallSignal));
    }
  }
  
  return signals;
}
```

### Signal Prioritizer

```typescript
/**
 * Priority weights by severity level
 */
const SEVERITY_WEIGHTS = {
  critical: 10,
  high: 5,
  medium: 2,
  low: 1
} as const;

/**
 * Prioritize signals by combining severity and recency
 * @param signals - Array of Universal_Signals
 * @returns Top 10 signals sorted by priority
 */
export function prioritizeSignals(
  signals: Universal_Signal[]
): Universal_Signal[] {
  const now = Date.now();
  
  const scored = signals.map(signal => {
    const severityWeight = SEVERITY_WEIGHTS[signal.impact.severity];
    const ageHours = (now - signal.occurredAt) / (1000 * 60 * 60);
    const recencyWeight = Math.max(1, 24 - ageHours); // Newer = higher weight
    const priorityScore = severityWeight * recencyWeight;
    
    return { signal, priorityScore };
  });
  
  // Sort by priority score descending
  scored.sort((a, b) => b.priorityScore - a.priorityScore);
  
  // Return top 10
  return scored.slice(0, 10).map(item => item.signal);
}
```

### Narrative Engine

```typescript
/**
 * Generate narrative text for a signal using Amazon Nova Lite
 * @param signal - Universal_Signal to narrate
 * @returns Narrative text (max 150 words)
 */
async function generateNarrative(
  signal: Universal_Signal
): Promise<string> {
  const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
  
  const prompt = buildPrompt(signal);
  
  try {
    const command = new InvokeModelCommand({
      modelId: process.env.BEDROCK_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        prompt,
        max_tokens: 200,
        temperature: 0.7
      })
    });
    
    const response = await client.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.body));
    
    return result.completion.trim();
  } catch (error) {
    console.error('Narrative generation failed:', error);
    // Fallback to template-based generation
    return generateTemplateNarrative(signal);
  }
}

/**
 * Build prompt for narrative generation
 */
function buildPrompt(signal: Universal_Signal): string {
  return `You are a business analyst writing a daily briefing for a SaaS founder.
Transform this signal into a clear, actionable narrative sentence.

Signal:
- Entity: ${signal.entity.primaryKey}
- Event: ${signal.eventType}
- Severity: ${signal.impact.severity}
- Metrics: ${JSON.stringify(signal.impact.metrics)}

Write a narrative that includes:
1. The entity name
2. What happened
3. Why it matters
4. What action to take

Keep it under 150 words. Use plain English, no jargon.`;
}

/**
 * Fallback template-based narrative generator
 */
function generateTemplateNarrative(signal: Universal_Signal): string {
  const entity = signal.entity.primaryKey;
  const eventType = signal.eventType.replace(/\./g, ' ');
  const severity = signal.impact.severity;
  
  return `${entity} triggered a ${severity} ${eventType} event. Review the details and take appropriate action.`;
}
```

### Briefing Storage

```typescript
/**
 * Store generated briefing in DynamoDB
 * @param userId - User identifier
 * @param insights - Array of generated insights
 * @param signalCount - Total number of signals processed
 */
async function storeBriefing(
  userId: string,
  insights: Insight[],
  signalCount: number
): Promise<void> {
  const client = new DynamoDBClient({ region: process.env.AWS_REGION });
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const now = Date.now();
  const ttl = now + (90 * 24 * 60 * 60 * 1000); // 90 days
  
  // Compress content to minimize storage
  const content = JSON.stringify(insights);
  const compressed = compressContent(content);
  
  const command = new PutItemCommand({
    TableName: process.env.BRIEFING_STORE_TABLE,
    Item: marshall({
      PK: `briefing#${userId}`,
      SK: `date#${date}`,
      generatedAt: now,
      signalCount,
      insightCount: insights.length,
      priorityLevel: calculatePriorityLevel(insights),
      content: compressed,
      ttl: Math.floor(ttl / 1000)
    })
  });
  
  await client.send(command);
}

/**
 * Calculate overall priority level for briefing
 */
function calculatePriorityLevel(insights: Insight[]): string {
  const hasCritical = insights.some(i => i.severity === 'critical');
  const hasHigh = insights.some(i => i.severity === 'high');
  
  if (hasCritical) return 'critical';
  if (hasHigh) return 'high';
  return 'normal';
}
```

### Data Models

**Insight Interface**:
```typescript
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
    source: string;           // 'Stripe', 'HubSpot', 'Mixpanel'
    eventType: string;
    timestamp: number;
    severity: string;
  }>;
}

/**
 * Actionable recommendation
 */
export interface GrowthPlay {
  label: string;              // Button text
  action: 'navigate' | 'external';
  target: string;             // URL or route
}
```

**Briefing Interface**:
```typescript
/**
 * Complete daily briefing
 */
export interface Briefing {
  date: string;               // YYYY-MM-DD
  generatedAt: number;        // Unix timestamp
  signalCount: number;        // Total signals processed
  insightCount: number;       // Number of insights generated
  priorityLevel: 'critical' | 'high' | 'normal';
  insights: Insight[];
}
```

### Next.js API Route

**File**: `apps/web/src/app/api/briefings/[date]/route.ts`

```typescript
/**
 * API route for fetching daily briefings
 * GET /api/briefings/[date]
 */
export async function GET(
  request: Request,
  { params }: { params: { date: string } }
): Promise<Response> {
  const { date } = params;
  
  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json(
      { error: 'Invalid date format. Use YYYY-MM-DD' },
      { status: 400 }
    );
  }
  
  try {
    const briefing = await fetchBriefing('default', date);
    
    if (!briefing) {
      return Response.json(
        { error: 'No briefing available for this date' },
        { status: 404 }
      );
    }
    
    return Response.json(briefing);
  } catch (error) {
    console.error('Failed to fetch briefing:', error);
    return Response.json(
      { error: 'Failed to fetch briefing' },
      { status: 500 }
    );
  }
}

/**
 * Fetch briefing from DynamoDB
 */
async function fetchBriefing(
  userId: string,
  date: string
): Promise<Briefing | null> {
  const client = new DynamoDBClient({ region: process.env.AWS_REGION });
  
  const command = new GetItemCommand({
    TableName: process.env.BRIEFING_STORE_TABLE,
    Key: marshall({
      PK: `briefing#${userId}`,
      SK: `date#${date}`
    })
  });
  
  const response = await client.send(command);
  
  if (!response.Item) {
    return null;
  }
  
  const item = unmarshall(response.Item);
  const content = decompressContent(item.content);
  const insights = JSON.parse(content);
  
  return {
    date,
    generatedAt: item.generatedAt,
    signalCount: item.signalCount,
    insightCount: item.insightCount,
    priorityLevel: item.priorityLevel,
    insights
  };
}
```

### Frontend Components

**Theme Context Provider**:

**File**: `apps/web/src/contexts/ThemeContext.tsx`

```typescript
'use client';

import { createContext, useContext, useState, useEffect } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  
  // Load theme from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme;
    if (stored) {
      setTheme(stored);
      document.documentElement.classList.toggle('dark', stored === 'dark');
    }
  }, []);
  
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };
  
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
```

**Briefing Page Component**:

**File**: `apps/web/src/app/briefing/page.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import { BriefingHeader } from '@/components/briefing/BriefingHeader';
import { InsightCard } from '@/components/briefing/InsightCard';
import { EmptyState } from '@/components/briefing/EmptyState';
import { ErrorBanner } from '@/components/briefing/ErrorBanner';
import { SkeletonLoader } from '@/components/briefing/SkeletonLoader';
import type { Briefing } from '@/types/briefing';

export default function BriefingPage() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(getTodayDate());
  
  useEffect(() => {
    fetchBriefing(selectedDate);
  }, [selectedDate]);
  
  async function fetchBriefing(date: string) {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/briefings/${date}`);
      
      if (response.status === 404) {
        setBriefing(null);
        return;
      }
      
      if (!response.ok) {
        throw new Error('Failed to fetch briefing');
      }
      
      const data = await response.json();
      setBriefing(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }
  
  if (loading) {
    return <SkeletonLoader />;
  }
  
  if (error) {
    return (
      <ErrorBanner
        message={error}
        onRetry={() => fetchBriefing(selectedDate)}
      />
    );
  }
  
  if (!briefing || briefing.insights.length === 0) {
    return <EmptyState />;
  }
  
  return (
    <div className="min-h-screen bg-background">
      <BriefingHeader
        date={selectedDate}
        onDateChange={setSelectedDate}
        insightCount={briefing.insightCount}
      />
      
      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="space-y-6">
          {briefing.insights.map(insight => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      </main>
    </div>
  );
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}
```

**Insight Card Component**:

**File**: `apps/web/src/components/briefing/InsightCard.tsx`

```typescript
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { Insight } from '@/types/briefing';

interface InsightCardProps {
  insight: Insight;
}

export function InsightCard({ insight }: InsightCardProps) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <article
      className="bg-card rounded-lg p-4 border border-border shadow-sm"
      aria-labelledby={`insight-${insight.id}`}
    >
      {/* Severity indicator */}
      {insight.severity === 'critical' && (
        <div className="w-2 h-2 rounded-full bg-alert mb-3" aria-label="Critical severity" />
      )}
      
      {/* Narrative text */}
      <p
        id={`insight-${insight.id}`}
        className="text-primary text-base leading-relaxed mb-4"
      >
        {insight.narrative}
      </p>
      
      {/* Thought Trace toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-muted hover:text-primary transition-colors mb-4"
        aria-expanded={expanded}
        aria-controls={`thought-trace-${insight.id}`}
      >
        <span>Why?</span>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      
      {/* Thought Trace content */}
      {expanded && (
        <div
          id={`thought-trace-${insight.id}`}
          className="bg-muted/50 rounded p-3 mb-4 space-y-2"
        >
          {insight.thoughtTrace.signals.map((signal, idx) => (
            <div key={idx} className="text-sm">
              <span className="font-medium">{signal.source}</span>
              {' • '}
              <span className="text-muted">{signal.eventType}</span>
              {' • '}
              <span className="text-muted">{formatRelativeTime(signal.timestamp)}</span>
              {' • '}
              <span className={`badge badge-${signal.severity}`}>
                {signal.severity}
              </span>
            </div>
          ))}
        </div>
      )}
      
      {/* Growth Play button */}
      <button
        onClick={() => handleGrowthPlay(insight.growthPlay)}
        className="bg-growth text-white px-4 py-2 rounded hover:bg-growth-hover transition-colors font-medium"
      >
        {insight.growthPlay.label}
      </button>
    </article>
  );
}

function handleGrowthPlay(growthPlay: GrowthPlay) {
  if (growthPlay.action === 'navigate') {
    window.location.href = growthPlay.target;
  } else {
    window.open(growthPlay.target, '_blank');
  }
}

function formatRelativeTime(timestamp: number): string {
  const hours = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60));
  if (hours < 1) return 'Just now';
  if (hours === 1) return '1 hour ago';
  return `${hours} hours ago`;
}
```

## Data Models

### DynamoDB Table: Briefings

**Table Design**:
- Stores generated daily briefings
- Supports queries by user and date
- 90-day TTL for automatic cleanup
- Compressed content to minimize storage costs

**Primary Key Structure**:
```
PK: briefing#{userId}
SK: date#{YYYY-MM-DD}
```

**Attributes**:
```typescript
{
  // Keys
  PK: string;                    // briefing#{userId}
  SK: string;                    // date#{YYYY-MM-DD}
  
  // Metadata
  generatedAt: number;           // Unix timestamp
  signalCount: number;           // Total signals processed
  insightCount: number;          // Number of insights
  priorityLevel: string;         // critical, high, normal
  
  // Content
  content: string;               // Compressed JSON of insights
  
  // TTL
  ttl: number;                   // Unix timestamp for expiration
}
```

**Access Patterns**:
1. Get briefing for specific date: Query by PK and SK
2. Get all briefings for user: Query by PK
3. Automatic cleanup: TTL handles deletion after 90 days

### Tailwind Theme Configuration

**File**: `apps/web/tailwind.config.ts`

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Light theme
        background: '#FAFAFA',
        card: '#FFFFFF',
        primary: '#1A1A1A',
        muted: '#6B7280',
        border: '#E5E7EB',
        growth: '#00C853',
        'growth-hover': '#00A844',
        alert: '#FF3D00',
        agent: '#6B46C1',
        
        // Dark theme (via CSS variables)
        dark: {
          background: '#0F0F0F',
          card: '#1A1A1A',
          primary: '#F5F5F5',
          muted: '#9CA3AF',
          border: '#2D2D2D',
          growth: '#00C853',
          'growth-hover': '#00A844',
          alert: '#FF3D00',
          agent: '#8B5CF6',
        }
      },
      fontFamily: {
        sans: ['Inter', 'Geist', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
```

**Global CSS** (`apps/web/src/app/globals.css`):
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #FAFAFA;
  --card: #FFFFFF;
  --primary: #1A1A1A;
  --muted: #6B7280;
  --border: #E5E7EB;
  --growth: #00C853;
  --growth-hover: #00A844;
  --alert: #FF3D00;
  --agent: #6B46C1;
}

.dark {
  --background: #0F0F0F;
  --card: #1A1A1A;
  --primary: #F5F5F5;
  --muted: #9CA3AF;
  --border: #2D2D2D;
  --growth: #00C853;
  --growth-hover: #00A844;
  --alert: #FF3D00;
  --agent: #8B5CF6;
}

body {
  background-color: var(--background);
  color: var(--primary);
}
```: Daily Briefing Generator

## Overview

The Daily Briefing Generator transforms raw business signals into a proactive, narrative-driven morning summary that feels like reading a well-crafted newspaper article rather than interpreting dashboards. It runs automatically at 8:00 AM UTC via EventBridge, retrieves signals from the past 24 hours, prioritizes them by business impact, generates human-readable narratives using Amazon Nova Lite, and presents them in a clean editorial UI.

This feature bridges the execution gap by surfacing what matters most and recommending specific actions. Instead of forcing users to check Stripe, HubSpot, and Mixpanel separately, they receive a single cohesive story that highlights critical insights and provides one-click "Growth Play" actions.

The system is designed for AWS Free Tier compliance with serverless architecture (Lambda, DynamoDB, S3, EventBridge), optimized for cost efficiency while maintaining high reliability and user experience quality.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    EventBridge Scheduler                        │
│              (Daily trigger at 8:00 AM UTC)                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Briefing Generator Lambda                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  1. Retrieve signals from past 24 hours                  │  │
│  │  2. Prioritize by severity and impact                    │  │
│  │  3. Generate narratives via Amazon Nova Lite             │  │
│  │  4. Store briefing in S3                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────┬────────────────────────────────┬───────────────────┘
             │                                │
             ▼                                ▼
┌────────────────────────┐      ┌────────────────────────────────┐
│  UniversalSignals      │      │  Briefings S3 Bucket           │
│  DynamoDB Table        │      │  briefing/{userId}/{date}.json │
│  (Read signals)        │      │  (90-day lifecycle policy)     │
└────────────────────────┘      └────────────┬───────────────────┘
                                             │
                                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js Frontend                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  /briefing page                                          │  │
│  │  - Fetch briefing from API route                        │  │
│  │  - Display in editorial layout                          │  │
│  │  - Insight Cards with Thought Traces                    │  │
│  │  - Growth Play action buttons                           │  │
│  │  - Date navigation (previous/next)                      │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
             ▲
             │
┌────────────┴────────────┐
│  API Route              │
│  /api/briefing          │
│  - Fetch from S3        │
│  - Return JSON          │
└─────────────────────────┘
```

### Component Responsibilities

**EventBridge Scheduler**:
- Triggers Briefing_Generator Lambda daily at 8:00 AM UTC
- Provides reliable, serverless scheduling
- No cost (within Free Tier limits)

**Briefing Generator Lambda**:
- Retrieves Universal_Signals from DynamoDB (past 24 hours)
- Prioritizes signals using weighted scoring algorithm
- Generates narratives via Amazon Bedrock (Nova Lite model)
- Constructs briefing JSON with metadata
- Stores briefing in S3 with compression
- Handles errors gracefully with fallback strategies

**UniversalSignals DynamoDB Table**:
- Source of truth for all business signals
- Queried by category and time range
- Provides signals for narrative generation

**Briefings S3 Bucket**:
- Stores generated briefings as JSON files
- Key format: `briefing/{userId}/{YYYY-MM-DD}.json`
- 90-day lifecycle policy for automatic deletion
- Serves as cache to avoid regeneration

**Next.js API Route** (`/api/briefing`):
- Fetches briefing from S3 for requested date
- Returns JSON to frontend
- Handles missing briefings gracefully

**Briefing UI** (`/briefing` page):
- Displays briefing in editorial layout
- Renders Insight_Cards with collapsible Thought_Traces
- Provides Growth_Play action buttons
- Supports date navigation (previous/next)
- Shows skeleton loaders during fetch

### Data Flow

1. **Generation Flow** (Daily at 8:00 AM UTC):
   - EventBridge triggers Lambda
   - Lambda queries UniversalSignals table (past 24 hours)
   - Signal_Prioritizer ranks signals by weighted score
   - Narrative_Engine generates text via Nova Lite
   - Briefing stored in S3 with metadata
   - CloudWatch logs capture metrics

2. **Display Flow** (User visits /briefing):
   - Frontend calls `/api/briefing?date=YYYY-MM-DD`
   - API route fetches from S3
   - Frontend renders Insight_Cards
   - User clicks Growth_Play button → navigates to detail page

3. **Error Flow**:
   - If signal query fails → empty signal list, generate "No activity" briefing
   - If Nova Lite fails → retry once, then fall back to template-based narrative
   - If S3 fetch fails → display error banner with retry button

## Components and Interfaces

### Briefing Generator Lambda

**Function Name:** `briefing-generator`

**Runtime:** Node.js 20.x

**Memory:** 512MB

**Timeout:** 30 seconds

**Environment Variables:**
```typescript
{
  UNIVERSAL_SIGNALS_TABLE: string;  // DynamoDB table name
  BRIEFINGS_BUCKET: string;         // S3 bucket name
  BEDROCK_MODEL_ID: string;         // "amazon.nova-lite-v1:0"
  AWS_REGION: string;               // "us-east-1"
  BRIEFING_TTL_DAYS: string;        // "90"
  MAX_INSIGHTS: string;             // "10"
}
```

**IAM Permissions:**
- `dynamodb:Query` on UniversalSignals table
- `s3:PutObject` on Briefings bucket
- `bedrock:InvokeModel` for Nova Lite
- `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`

**Handler Function:**
```typescript
/**
 * Lambda handler for daily briefing generation
 * Triggered by EventBridge at 8:00 AM UTC
 */
export async function handler(event: EventBridgeEvent): Promise<void> {
  const startTime = Date.now();
  
  try {
    // 1. Retrieve signals from past 24 hours
    const signals = await retrieveSignals();
    
    // 2. Prioritize signals
    const prioritized = prioritizeSignals(signals);
    
    // 3. Generate narratives
    const insights = await generateInsights(prioritized);
    
    // 4. Construct briefing
    const briefing = constructBriefing(insights, signals);
    
    // 5. Store in S3
    await storeBriefing(briefing);
    
    // 6. Log metrics
    logMetrics(startTime, signals.length, insights.length);
    
  } catch (error) {
    console.error('Briefing generation failed:', error);
    throw error;
  }
}
```

### Signal Retrieval

**Function:** `retrieveSignals()`

```typescript
/**
 * Retrieve all signals from the past 24 hours
 * Queries UniversalSignals table by time range
 */
async function retrieveSignals(): Promise<Universal_Signal[]> {
  const now = Date.now();
  const yesterday = now - (24 * 60 * 60 * 1000);
  
  const client = new DynamoDBClient({ region: process.env.AWS_REGION });
  
  // Query all three categories
  const categories: SignalCategory[] = ['revenue', 'relationship', 'behavioral'];
  const allSignals: Universal_Signal[] = [];
  
  for (const category of categories) {
    const command = new QueryCommand({
      TableName: process.env.UNIVERSAL_SIGNALS_TABLE,
      IndexName: 'CategoryIndex',
      KeyConditionExpression: 'GSI2PK = :pk AND GSI2SK BETWEEN :start AND :end',
      ExpressionAttributeValues: {
        ':pk': { S: `category#${category}` },
        ':start': { S: `${yesterday}#` },
        ':end': { S: `${now}#` }
      }
    });
    
    const response = await client.send(command);
    if (response.Items) {
      allSignals.push(...response.Items.map(unmarshallSignal));
    }
  }
  
  return allSignals;
}
```

### Signal Prioritization

**Function:** `prioritizeSignals()`

```typescript
/**
 * Priority weights by severity
 */
const SEVERITY_WEIGHTS = {
  critical: 10,
  high: 5,
  medium: 3,
  low: 1
} as const;

/**
 * Prioritize signals by weighted score
 * Returns top N signals (default 10)
 */
function prioritizeSignals(
  signals: Universal_Signal[],
  maxInsights: number = 10
): Universal_Signal[] {
  // Calculate priority score for each signal
  const scored = signals.map(signal => ({
    signal,
    score: calculatePriorityScore(signal)
  }));
  
  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  
  // Return top N
  return scored.slice(0, maxInsights).map(s => s.signal);
}

/**
 * Calculate priority score for a signal
 * Combines severity weight with recency and impact
 */
function calculatePriorityScore(signal: Universal_Signal): number {
  const severityWeight = SEVERITY_WEIGHTS[signal.impact.severity];
  
  // Recency factor (more recent = higher score)
  const ageHours = (Date.now() - signal.occurredAt) / (1000 * 60 * 60);
  const recencyFactor = Math.max(0, 1 - (ageHours / 24));
  
  // Impact factor based on metrics
  const impactFactor = calculateImpactFactor(signal);
  
  return severityWeight * (1 + recencyFactor + impactFactor);
}

/**
 * Calculate impact factor from signal metrics
 */
function calculateImpactFactor(signal: Universal_Signal): number {
  const metrics = signal.impact.metrics;
  
  if (metrics.revenue) {
    // Revenue impact: normalize MRR change
    const mrrChange = Math.abs(metrics.revenue.mrrChange || 0);
    return Math.min(mrrChange / 1000, 2); // Cap at 2x
  }
  
  if (metrics.relationship) {
    // Relationship impact: deal value and sentiment
    const dealValue = metrics.relationship.dealValue || 0;
    const sentimentScore = Math.abs(metrics.relationship.sentimentScore || 0);
    return Math.min((dealValue / 10000) + sentimentScore, 2);
  }
  
  if (metrics.behavioral) {
    // Behavioral impact: engagement score
    const engagementScore = metrics.behavioral.engagementScore || 0;
    return Math.min(engagementScore / 50, 2);
  }
  
  return 0;
}
```

### Narrative Generation

**Function:** `generateInsights()`

```typescript
/**
 * Insight with narrative and source signals
 */
interface Insight {
  narrative: string;
  severity: Severity;
  category: SignalCategory;
  thoughtTrace: ThoughtTrace;
  growthPlay: GrowthPlay;
}

/**
 * Thought trace showing source signals
 */
interface ThoughtTrace {
  signals: Array<{
    source: Platform;
    eventType: UniversalEventType;
    timestamp: number;
    severity: Severity;
  }>;
}

/**
 * Growth play action
 */
interface GrowthPlay {
  label: string;
  action: 'navigate' | 'external';
  target: string;
}

/**
 * Generate narrative insights from prioritized signals
 * Uses Amazon Nova Lite for text generation
 */
async function generateInsights(
  signals: Universal_Signal[]
): Promise<Insight[]> {
  const insights: Insight[] = [];
  
  for (const signal of signals) {
    try {
      const narrative = await generateNarrative(signal);
      const growthPlay = determineGrowthPlay(signal);
      
      insights.push({
        narrative,
        severity: signal.impact.severity,
        category: signal.category,
        thoughtTrace: {
          signals: [{
            source: signal.source.platform,
            eventType: signal.eventType,
            timestamp: signal.occurredAt,
            severity: signal.impact.severity
          }]
        },
        growthPlay
      });
    } catch (error) {
      console.error('Failed to generate insight:', error);
      // Fall back to template-based narrative
      insights.push(generateTemplateInsight(signal));
    }
  }
  
  return insights;
}

/**
 * Generate narrative text using Amazon Nova Lite
 */
async function generateNarrative(signal: Universal_Signal): Promise<string> {
  const prompt = constructPrompt(signal);
  
  const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
  
  const command = new InvokeModelCommand({
    modelId: process.env.BEDROCK_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      messages: [{
        role: 'user',
        content: prompt
      }],
      max_tokens: 150,
      temperature: 0.7
    })
  });
  
  const response = await client.send(command);
  const result = JSON.parse(new TextDecoder().decode(response.body));
  
  return result.content[0].text;
}

/**
 * Construct prompt for narrative generation
 */
function constructPrompt(signal: Universal_Signal): string {
  const entityName = signal.entity.primaryKey;
  const eventType = signal.eventType;
  const metrics = formatMetrics(signal.impact.metrics);
  
  return `Write a concise business insight (max 150 words) for this signal:
  
Entity: ${entityName}
Event: ${eventType}
Severity: ${signal.impact.severity}
Metrics: ${metrics}

Format: Start with the entity name, describe what happened, include the key metric, and suggest a specific action.
Tone: Professional but conversational, like a trusted advisor.
Example: "Acme Corp's MRR dropped by $500 this month due to a downgrade. This is their first contraction in 6 months. Consider reaching out to understand their needs and explore upsell opportunities."`;
}

/**
 * Format metrics for prompt
 */
function formatMetrics(metrics: NormalizedMetrics): string {
  if (metrics.revenue) {
    return `Revenue: ${metrics.revenue.amount} ${metrics.revenue.currency}, MRR Change: ${metrics.revenue.mrrChange}`;
  }
  if (metrics.relationship) {
    return `Deal Value: ${metrics.relationship.dealValue}, Days Since Contact: ${metrics.relationship.daysSinceContact}`;
  }
  if (metrics.behavioral) {
    return `Engagement Score: ${metrics.behavioral.engagementScore}, Usage Frequency: ${metrics.behavioral.usageFrequency}`;
  }
  return 'No metrics available';
}

/**
 * Determine growth play action for signal
 */
function determineGrowthPlay(signal: Universal_Signal): GrowthPlay {
  switch (signal.category) {
    case 'revenue':
      return {
        label: 'View Customer Details',
        action: 'navigate',
        target: `/customers/${signal.entity.platformIds.stripe}`
      };
    case 'relationship':
      return {
        label: 'Open in HubSpot',
        action: 'external',
        target: `https://app.hubspot.com/contacts/${signal.entity.platformIds.hubspot}`
      };
    case 'behavioral':
      return {
        label: 'View User Activity',
        action: 'navigate',
        target: `/users/${signal.entity.platformIds.mixpanel}`
      };
  }
}

/**
 * Generate template-based insight (fallback)
 */
function generateTemplateInsight(signal: Universal_Signal): Insight {
  const templates = {
    'revenue.expansion': `${signal.entity.primaryKey} upgraded their subscription. MRR increased by $${signal.impact.metrics.revenue?.mrrChange || 0}.`,
    'revenue.churn': `${signal.entity.primaryKey} cancelled their subscription. Consider reaching out to understand why.`,
    'relationship.engagement_gap': `No contact with ${signal.entity.primaryKey} for ${signal.impact.metrics.relationship?.daysSinceContact || 0} days. Time to check in.`,
    'behavioral.power_user': `${signal.entity.primaryKey} is a power user with engagement score ${signal.impact.metrics.behavioral?.engagementScore || 0}. Great upsell candidate.`
  };
  
  const narrative = templates[signal.eventType] || `New signal detected for ${signal.entity.primaryKey}.`;
  
  return {
    narrative,
    severity: signal.impact.severity,
    category: signal.category,
    thoughtTrace: {
      signals: [{
        source: signal.source.platform,
        eventType: signal.eventType,
        timestamp: signal.occurredAt,
        severity: signal.impact.severity
      }]
    },
    growthPlay: determineGrowthPlay(signal)
  };
}
```

### Briefing Construction and Storage

**Briefing Data Model:**
```typescript
/**
 * Complete briefing document
 */
interface Briefing {
  date: string;                    // YYYY-MM-DD
  generatedAt: number;             // Unix timestamp
  insights: Insight[];
  metadata: {
    signalCount: number;
    priorityLevel: 'high' | 'medium' | 'low';
    categories: {
      revenue: number;
      relationship: number;
      behavioral: number;
    };
  };
}
```

**Function:** `constructBriefing()`

```typescript
/**
 * Construct briefing document from insights
 */
function constructBriefing(
  insights: Insight[],
  allSignals: Universal_Signal[]
): Briefing {
  const date = new Date().toISOString().split('T')[0];
  
  // Calculate category counts
  const categories = {
    revenue: allSignals.filter(s => s.category === 'revenue').length,
    relationship: allSignals.filter(s => s.category === 'relationship').length,
    behavioral: allSignals.filter(s => s.category === 'behavioral').length
  };
  
  // Determine priority level
  const criticalCount = insights.filter(i => i.severity === 'critical').length;
  const priorityLevel = criticalCount > 0 ? 'high' : 
                       insights.length > 5 ? 'medium' : 'low';
  
  return {
    date,
    generatedAt: Date.now(),
    insights,
    metadata: {
      signalCount: allSignals.length,
      priorityLevel,
      categories
    }
  };
}
```

**Function:** `storeBriefing()`

```typescript
/**
 * Store briefing in S3 with compression
 */
async function storeBriefing(briefing: Briefing): Promise<void> {
  const userId = 'default'; // TODO: Multi-tenant support
  const key = `briefing/${userId}/${briefing.date}.json`;
  
  const client = new S3Client({ region: process.env.AWS_REGION });
  
  // Compress briefing JSON
  const json = JSON.stringify(briefing);
  const compressed = gzipSync(json);
  
  const command = new PutObjectCommand({
    Bucket: process.env.BRIEFINGS_BUCKET,
    Key: key,
    Body: compressed,
    ContentType: 'application/json',
    ContentEncoding: 'gzip',
    Metadata: {
      signalCount: briefing.metadata.signalCount.toString(),
      priorityLevel: briefing.metadata.priorityLevel
    }
  });
  
  await client.send(command);
  
  console.log(`Briefing stored: ${key}`);
}
```

### Next.js API Route

**File:** `src/app/api/briefing/route.ts`

```typescript
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { gunzipSync } from 'zlib';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/briefing?date=YYYY-MM-DD
 * Fetch briefing for specified date
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
  
  try {
    const briefing = await fetchBriefing(date);
    return NextResponse.json(briefing);
  } catch (error) {
    if (error.name === 'NoSuchKey') {
      return NextResponse.json(
        { error: 'No briefing available for this date' },
        { status: 404 }
      );
    }
    
    console.error('Failed to fetch briefing:', error);
    return NextResponse.json(
      { error: 'Failed to fetch briefing' },
      { status: 500 }
    );
  }
}

/**
 * Fetch briefing from S3
 */
async function fetchBriefing(date: string): Promise<Briefing> {
  const userId = 'default'; // TODO: Multi-tenant support
  const key = `briefing/${userId}/${date}.json`;
  
  const client = new S3Client({ region: process.env.AWS_REGION });
  
  const command = new GetObjectCommand({
    Bucket: process.env.BRIEFINGS_BUCKET,
    Key: key
  });
  
  const response = await client.send(command);
  const compressed = await response.Body.transformToByteArray();
  const json = gunzipSync(Buffer.from(compressed)).toString();
  
  return JSON.parse(json);
}
```

## Data Models

### Briefing Storage (S3)

**Bucket Name:** `sesari-briefings-{accountId}`

**Key Structure:** `briefing/{userId}/{YYYY-MM-DD}.json`

**Lifecycle Policy:**
- Delete objects older than 90 days
- Transition to Intelligent-Tiering after 30 days (optional)

**Object Metadata:**
- `Content-Type`: `application/json`
- `Content-Encoding`: `gzip`
- `signalCount`: Number of signals processed
- `priorityLevel`: `high`, `medium`, or `low`

**Example Briefing JSON:**
```json
{
  "date": "2024-01-15",
  "generatedAt": 1705305600000,
  "insights": [
    {
      "narrative": "Acme Corp's MRR dropped by $500 this month due to a downgrade. This is their first contraction in 6 months. Consider reaching out to understand their needs and explore upsell opportunities.",
      "severity": "critical",
      "category": "revenue",
      "thoughtTrace": {
        "signals": [
          {
            "source": "stripe",
            "eventType": "revenue.contraction",
            "timestamp": 1705219200000,
            "severity": "critical"
          }
        ]
      },
      "growthPlay": {
        "label": "View Customer Details",
        "action": "navigate",
        "target": "/customers/cus_123"
      }
    }
  ],
  "metadata": {
    "signalCount": 15,
    "priorityLevel": "high",
    "categories": {
      "revenue": 5,
      "relationship": 7,
      "behavioral": 3
    }
  }
}
```

### EventBridge Rule

**Rule Name:** `daily-briefing-trigger`

**Schedule Expression:** `cron(0 8 * * ? *)`  (8:00 AM UTC daily)

**Target:** Briefing Generator Lambda

**Input:** Empty (no input needed)

### DynamoDB Query Patterns

The Briefing Generator queries the existing `UniversalSignals` table:

**Query 1: Get signals by category and time range**
```typescript
{
  TableName: 'UniversalSignals',
  IndexName: 'CategoryIndex',
  KeyConditionExpression: 'GSI2PK = :pk AND GSI2SK BETWEEN :start AND :end',
  ExpressionAttributeValues: {
    ':pk': 'category#revenue',
    ':start': '1705219200000#',
    ':end': '1705305600000#'
  }
}
```

This query is repeated for each category (revenue, relationship, behavioral).

## Correctness Properties



## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property Reflection

After analyzing all acceptance criteria, I identified several areas of redundancy:

1. **Time Range Query Properties (1.1, 1.2)**: These both test that signals are retrieved within a 24-hour window. They can be combined into a single property.

2. **Prioritization Weight Properties (2.1-2.5)**: All of these test aspects of the prioritization algorithm. Rather than separate properties for each severity weight, we can have one comprehensive property that validates the complete prioritization behavior including ordering and weight assignments.

3. **Narrative Content Properties (3.3, 3.5, 3.6)**: These all test that narratives contain specific information. We can combine these into properties that validate content completeness for different signal types.

4. **Storage Key Format Properties (4.1, 4.2)**: Both test the storage mechanism and key format. These can be combined into a round-trip property.

5. **Briefing Metadata Properties (4.4)**: This tests that specific fields are present, which is part of the storage round-trip property.

6. **Thought Trace Display Properties (7.1, 7.2, 7.3, 7.5)**: These all test aspects of thought trace rendering. We can combine these into comprehensive properties about thought trace structure.

7. **Caching Properties (12.3, 12.4)**: Both test caching behavior and can be combined.

8. **Performance Properties (1.4, 12.6)**: These are duplicate performance requirements that aren't suitable for property testing.

The consolidated properties below eliminate redundancy while maintaining comprehensive coverage.

### Property 1: Signal Retrieval Time Window

For any set of signals with various timestamps, querying for signals within a 24-hour time window must return only signals where occurredAt is within the range [startTime, endTime], and all signals within that range must be returned.

**Validates: Requirements 1.1, 1.2**

### Property 2: Signal Prioritization Ordering

For any set of signals with different severity levels (critical, high, medium, low) and timestamps, the Signal_Prioritizer must return signals in descending priority order where critical signals rank higher than high, high ranks higher than medium, and medium ranks higher than low, with more recent signals ranking higher than older signals of the same severity.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

### Property 3: Prioritization Result Limit

For any set of signals with more than 10 items, the Signal_Prioritizer must return exactly 10 signals, and those 10 must be the highest-priority signals from the input set.

**Validates: Requirements 2.6, 12.2**

### Property 4: Narrative Generation Completeness

For any signal, the Narrative_Engine must generate a non-empty narrative string that contains the entity identifier from the signal.

**Validates: Requirements 3.1, 3.3**

### Property 5: Narrative Word Limit

For any signal, the generated narrative must contain 150 words or fewer.

**Validates: Requirements 3.4**

### Property 6: Revenue Signal Currency Formatting

For any revenue signal with a monetary amount, the generated narrative must format currency values in USD with exactly two decimal places (e.g., "$1,234.56").

**Validates: Requirements 3.5**

### Property 7: Behavioral Signal Content

For any behavioral signal, the generated narrative must include the specific user action (feature name or event type) and a frequency or usage metric.

**Validates: Requirements 3.6**

### Property 8: Briefing Storage Round-Trip

For any briefing with insights, storing it and then retrieving it by user ID and date must return a briefing with all insights preserved, including narrative text, severity, category, thought trace, and growth play.

**Validates: Requirements 4.1, 4.2, 4.4**

### Property 9: Briefing TTL Configuration

For any stored briefing, the TTL field must be set to a timestamp approximately 90 days (±1 day) after the generation timestamp.

**Validates: Requirements 4.3**

### Property 10: Briefing Compression Round-Trip

For any briefing content, compressing it and then decompressing it must produce the original content with all data preserved.

**Validates: Requirements 4.5**

### Property 11: Date Formatting Consistency

For any valid date string in YYYY-MM-DD format, formatting it for display must produce a string in the format "DayOfWeek, Month Day, Year" (e.g., "Monday, January 15, 2024").

**Validates: Requirements 5.3**

### Property 12: Thought Trace Completeness

For any insight with source signals, the thought trace must include all source signals with their source system, event type, and timestamp.

**Validates: Requirements 7.1, 7.2, 7.3**

### Property 13: Thought Trace Length Limit

For any insight with more than 5 source signals, the displayed thought trace must show exactly 5 signals, prioritized by recency or severity.

**Validates: Requirements 7.5**

### Property 14: Growth Play Label Presence

For any insight, the growth play must have a non-empty label string that describes the action.

**Validates: Requirements 8.1**

### Property 15: Briefing Caching Consistency

For any date, requesting the briefing multiple times within the same day must return the same briefing content without regeneration (same generatedAt timestamp).

**Validates: Requirements 12.3, 12.4**

### Property 16: Relative Time Formatting

For any timestamp within the past 24 hours, formatting it as relative time must produce a string in the format "X hours ago" or "Just now" for timestamps less than 1 hour old.

**Validates: Requirements 7.3**

## Error Handling

### Lambda Execution Errors

**Scheduled Trigger Failures**:
- When EventBridge trigger fails, CloudWatch alarm triggers on missed executions
- Lambda has automatic retry configured (2 attempts with exponential backoff)
- Failed executions are logged to CloudWatch Logs for investigation
- Dead Letter Queue (DLQ) captures events after all retries exhausted

**Signal Retrieval Failures**:
- When DynamoDB query fails, log error with query parameters
- Return empty signal list to allow briefing generation to continue
- Generate briefing with "Unable to retrieve signals" message
- CloudWatch alarm triggers on query error rate > 5%

**Narrative Generation Failures**:
- When Bedrock API call fails, retry once after 10 seconds
- If retry fails, fall back to template-based narrative generation
- Template uses signal data to construct basic narrative: "{entity} triggered {eventType}"
- Log all AI failures for monitoring and cost analysis

### Storage Errors

**DynamoDB Write Failures**:
- Failed writes are retried automatically by AWS SDK (exponential backoff)
- After max retries, log error and throw exception
- EventBridge will retry the entire Lambda execution
- CloudWatch alarm triggers on write error rate > 1%

**Compression Failures**:
- When compression fails, store uncompressed content
- Log warning about compression failure
- Continue with briefing storage to ensure availability

### Frontend Errors

**API Request Failures**:
- Display error banner with user-friendly message
- Provide "Retry" button to refetch briefing
- Log error details to browser console for debugging
- Implement exponential backoff for retries (1s, 2s, 4s)

**Missing Briefing**:
- When briefing doesn't exist for selected date, show appropriate message
- For dates in the past: "No briefing available for this date"
- For new users: Show welcome state with onboarding message
- Provide action button to connect integrations

**Theme Switching Errors**:
- When localStorage is unavailable, fall back to light theme
- Log warning about storage unavailability
- Theme preference won't persist across sessions

### Validation Errors

**Invalid Date Format**:
- API route validates date format (YYYY-MM-DD)
- Return 400 Bad Request with error message
- Frontend validates date before making API call

**Invalid User ID**:
- When user ID is missing or invalid, return 401 Unauthorized
- Redirect to login page
- Log authentication failure

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests for comprehensive coverage:

**Unit Tests** focus on:
- Specific examples (empty state, welcome briefing, error states)
- Edge cases (no signals, single signal, exactly 10 signals)
- Error conditions (API failures, invalid dates, missing data)
- Integration points (DynamoDB operations, Bedrock API calls)
- UI interactions (button clicks, date selection, theme switching)

**Property-Based Tests** focus on:
- Universal properties that hold for all inputs (the 16 properties defined above)
- Comprehensive input coverage through randomization
- Round-trip properties (storage, compression, formatting)
- Invariants (ordering, length limits, data preservation)

Both approaches are complementary and necessary. Unit tests catch concrete bugs in specific scenarios, while property tests verify general correctness across all possible inputs.

### Property-Based Testing Configuration

**Library**: fast-check (TypeScript property-based testing library)

**Configuration**:
- Minimum 100 iterations per property test (due to randomization)
- Each test must reference its design document property in a comment
- Tag format: `// Feature: daily-briefing-generator, Property {number}: {property_text}`

**Example Property Test Structure**:

```typescript
import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { prioritizeSignals } from '../signal-prioritizer';

describe('Signal Prioritization Properties', () => {
  // Feature: daily-briefing-generator, Property 2: Signal Prioritization Ordering
  it('should return signals in descending priority order', () => {
    fc.assert(
      fc.property(
        fc.array(universalSignalArbitrary(), { minLength: 1, maxLength: 50 }),
        (signals) => {
          const prioritized = prioritizeSignals(signals);
          
          // Verify ordering: each signal should have priority >= next signal
          for (let i = 0; i < prioritized.length - 1; i++) {
            const currentPriority = calculatePriority(prioritized[i]);
            const nextPriority = calculatePriority(prioritized[i + 1]);
            expect(currentPriority).toBeGreaterThanOrEqual(nextPriority);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
  
  // Feature: daily-briefing-generator, Property 3: Prioritization Result Limit
  it('should return exactly 10 signals when input has more than 10', () => {
    fc.assert(
      fc.property(
        fc.array(universalSignalArbitrary(), { minLength: 11, maxLength: 100 }),
        (signals) => {
          const prioritized = prioritizeSignals(signals);
          expect(prioritized).toHaveLength(10);
          
          // Verify these are the top 10 by priority
          const allScored = signals.map(s => ({
            signal: s,
            priority: calculatePriority(s)
          }));
          allScored.sort((a, b) => b.priority - a.priority);
          const expectedTop10 = allScored.slice(0, 10).map(x => x.signal);
          
          expect(prioritized).toEqual(expectedTop10);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Test Generators (Arbitraries)

Property-based tests require generators for random test data:

**Signal Generators**:
```typescript
/**
 * Generate random Universal_Signal for testing
 */
function universalSignalArbitrary(): fc.Arbitrary<Universal_Signal> {
  return fc.record({
    signalId: fc.uuid(),
    category: fc.constantFrom('revenue', 'relationship', 'behavioral'),
    eventType: fc.string(),
    entity: fc.record({
      primaryKey: fc.emailAddress(),
      alternateKeys: fc.array(fc.string()),
      platformIds: fc.record({
        stripe: fc.option(fc.string()),
        hubspot: fc.option(fc.string()),
        mixpanel: fc.option(fc.string())
      })
    }),
    occurredAt: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
    processedAt: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
    source: fc.record({
      platform: fc.constantFrom('stripe', 'hubspot', 'mixpanel'),
      originalEventType: fc.string(),
      originalEventId: fc.string()
    }),
    impact: fc.record({
      severity: fc.constantFrom('critical', 'high', 'medium', 'low'),
      metrics: fc.object()
    }),
    platformDetails: fc.object(),
    ttl: fc.integer({ min: Date.now(), max: Date.now() + 86400000 * 90 })
  });
}

/**
 * Generate random Insight for testing
 */
function insightArbitrary(): fc.Arbitrary<Insight> {
  return fc.record({
    id: fc.uuid(),
    narrative: fc.string({ minLength: 10, maxLength: 500 }),
    severity: fc.constantFrom('critical', 'high', 'medium', 'low'),
    category: fc.constantFrom('revenue', 'relationship', 'behavioral'),
    thoughtTrace: fc.record({
      signals: fc.array(
        fc.record({
          source: fc.constantFrom('Stripe', 'HubSpot', 'Mixpanel'),
          eventType: fc.string(),
          timestamp: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
          severity: fc.string()
        }),
        { maxLength: 10 }
      )
    }),
    growthPlay: fc.record({
      label: fc.string({ minLength: 5, maxLength: 50 }),
      action: fc.constantFrom('navigate', 'external'),
      target: fc.webUrl()
    })
  });
}

/**
 * Generate random Briefing for testing
 */
function briefingArbitrary(): fc.Arbitrary<Briefing> {
  return fc.record({
    date: fc.date().map(d => d.toISOString().split('T')[0]),
    generatedAt: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
    signalCount: fc.integer({ min: 0, max: 100 }),
    insightCount: fc.integer({ min: 0, max: 10 }),
    priorityLevel: fc.constantFrom('critical', 'high', 'normal'),
    insights: fc.array(insightArbitrary(), { maxLength: 10 })
  });
}
```

### Unit Test Coverage

**Backend Tests** (`packages/lambdas/briefing-generator/src/__tests__/`):
- `index.test.ts`: Lambda handler execution, error handling, retries
- `signal-retrieval.test.ts`: DynamoDB queries, time range filtering
- `signal-prioritizer.test.ts`: Priority calculation, ordering, limit
- `narrative-engine.test.ts`: Bedrock API calls, template fallback, formatting
- `briefing-storage.test.ts`: DynamoDB writes, compression, TTL
- `integration.test.ts`: End-to-end flow from trigger to storage

**Frontend Tests** (`apps/web/src/__tests__/`):
- `briefing-page.test.tsx`: Page rendering, data fetching, error states
- `insight-card.test.tsx`: Card rendering, thought trace toggle, growth play clicks
- `theme-context.test.tsx`: Theme switching, localStorage persistence
- `date-navigation.test.tsx`: Date picker, previous/next buttons, today detection
- `empty-state.test.tsx`: Welcome message, no signals message
- `error-banner.test.tsx`: Error display, retry button

**Property Tests** (`packages/lambdas/briefing-generator/src/__tests__/properties/`):
- `signal-prioritizer.properties.test.ts`: Properties 2, 3
- `narrative-engine.properties.test.ts`: Properties 4, 5, 6, 7
- `briefing-storage.properties.test.ts`: Properties 8, 9, 10, 15
- `formatting.properties.test.ts`: Properties 11, 16
- `thought-trace.properties.test.ts`: Properties 12, 13

### Integration Testing

**Local Testing**:
- Use LocalStack for DynamoDB and S3 emulation
- Mock Bedrock API calls with predefined responses
- Test complete flow from signal retrieval to briefing display

**Staging Environment**:
- Deploy to AWS with test data
- Trigger Lambda manually to verify EventBridge integration
- Test frontend against real API endpoints
- Verify theme switching persists across sessions

### Accessibility Testing

**Automated Tests**:
- Use axe-core for automated accessibility scanning
- Verify ARIA labels and roles
- Check color contrast ratios
- Validate keyboard navigation

**Manual Tests**:
- Test with screen reader (NVDA or JAWS)
- Verify keyboard-only navigation
- Test with high contrast mode
- Verify focus indicators are visible

## AWS Infrastructure

### Lambda Function Configuration

**Function Name**: `briefing-generator`

**Runtime**: Node.js 20.x

**Memory**: 512 MB

**Timeout**: 30 seconds

**Environment Variables**:
```
UNIVERSAL_SIGNALS_TABLE=UniversalSignals
BRIEFING_STORE_TABLE=Briefings
BEDROCK_MODEL_ID=amazon.nova-lite-v1:0
AWS_REGION=us-east-1
MAX_INSIGHTS=10
NARRATIVE_MAX_WORDS=150
```

**IAM Permissions**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:Query",
        "dynamodb:GetItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/UniversalSignals*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/Briefings"
    },
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": "arn:aws:bedrock:*::foundation-model/amazon.nova-lite-v1:0"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```

### EventBridge Scheduler

**Rule Name**: `daily-briefing-trigger`

**Schedule Expression**: `cron(0 8 * * ? *)` (8:00 AM UTC daily)

**Target**: Lambda function `briefing-generator`

**Retry Policy**:
- Maximum retry attempts: 2
- Maximum event age: 1 hour
- Dead Letter Queue: `briefing-generator-dlq`

### DynamoDB Table: Briefings

**Table Name**: `Briefings`

**Billing Mode**: On-Demand (pay per request)

**Primary Key**:
- Partition Key: `PK` (String) - Format: `briefing#{userId}`
- Sort Key: `SK` (String) - Format: `date#{YYYY-MM-DD}`

**Attributes**:
- `generatedAt` (Number) - Unix timestamp
- `signalCount` (Number) - Total signals processed
- `insightCount` (Number) - Number of insights
- `priorityLevel` (String) - critical, high, normal
- `content` (String) - Compressed JSON of insights
- `ttl` (Number) - Unix timestamp for expiration

**TTL Configuration**:
- TTL Attribute: `ttl`
- Enabled: Yes

**Estimated Costs** (AWS Free Tier):
- Storage: ~1 KB per briefing × 90 days = 90 KB per user (well within free tier)
- Reads: ~10 per day per user (within 25 GB free tier)
- Writes: 1 per day per user (within 25 GB free tier)

### CloudWatch Alarms

**Alarm 1: Lambda Errors**
- Metric: `Errors`
- Threshold: > 0 in 5 minutes
- Action: SNS notification to ops team

**Alarm 2: Lambda Duration**
- Metric: `Duration`
- Threshold: > 25 seconds (approaching 30s timeout)
- Action: SNS notification to ops team

**Alarm 3: DynamoDB Throttling**
- Metric: `UserErrors`
- Threshold: > 5 in 5 minutes
- Action: SNS notification to ops team

**Alarm 4: Bedrock API Errors**
- Metric: Custom metric from Lambda logs
- Threshold: > 10% error rate
- Action: SNS notification to ops team

### Cost Optimization

**Lambda**:
- 512 MB memory × 30 seconds = 15 GB-seconds per execution
- 1 execution per day = 450 GB-seconds per month
- AWS Free Tier: 400,000 GB-seconds per month (well within limit)

**DynamoDB**:
- On-Demand pricing: Pay per request
- ~11 requests per day (1 write + 10 reads) = 330 requests per month
- AWS Free Tier: 25 GB storage + 25 read/write capacity units (within limit)

**Bedrock**:
- Nova Lite: ~$0.0008 per 1K input tokens, ~$0.0032 per 1K output tokens
- 10 narratives × 200 tokens each = 2,000 tokens per day
- ~$0.006 per day = ~$2 per month (minimal cost)

**Total Estimated Cost**: ~$2-3 per month (primarily Bedrock usage)

## Deployment

### Infrastructure Setup

**Prerequisites**:
- AWS CLI configured with appropriate credentials
- Node.js 20.x installed
- Terraform or AWS CDK (optional, for infrastructure as code)

**Setup Steps**:

1. Create DynamoDB table:
```bash
cd packages/lambdas/briefing-generator/infrastructure
npm run setup-dynamodb
```

2. Deploy Lambda function:
```bash
cd packages/lambdas/briefing-generator
npm run build
npm run deploy
```

3. Create EventBridge rule:
```bash
cd packages/lambdas/briefing-generator/infrastructure
npm run setup-eventbridge
```

4. Configure CloudWatch alarms:
```bash
npm run setup-alarms
```

### Frontend Deployment

**Next.js Build**:
```bash
cd apps/web
npm run build
```

**Environment Variables** (`.env.local`):
```
NEXT_PUBLIC_API_URL=https://api.sesari.com
AWS_REGION=us-east-1
BRIEFING_STORE_TABLE=Briefings
```

**Deployment Options**:
- Vercel (recommended for Next.js)
- AWS Amplify
- Self-hosted on EC2 (not recommended due to cost)

### Verification

**Test Lambda Execution**:
```bash
aws lambda invoke \
  --function-name briefing-generator \
  --payload '{}' \
  response.json
```

**Test EventBridge Trigger**:
```bash
aws events put-events \
  --entries '[{"Source":"test","DetailType":"test","Detail":"{}"}]'
```

**Test Frontend**:
1. Navigate to `/briefing` page
2. Verify briefing loads
3. Test theme switching
4. Test date navigation
5. Test growth play buttons

## Future Enhancements

### Multi-Tenant Support

Currently, the system uses a single `default` user ID. Future versions should:
- Add user authentication and authorization
- Store user ID in session/JWT token
- Query briefings by authenticated user ID
- Support team/organization-level briefings

### Personalization

- Learn user preferences for insight types
- Adjust narrative tone based on user feedback
- Prioritize signals based on user's role (founder vs. growth lead)
- Allow users to customize briefing schedule

### Advanced Narratives

- Multi-signal insights that correlate across platforms
- Trend analysis (week-over-week, month-over-month)
- Predictive insights using historical patterns
- Actionable recommendations with confidence scores

### Mobile Support

- Responsive design for mobile devices
- Push notifications for critical insights
- Mobile app with native UI
- Offline support for viewing cached briefings

### Export and Sharing

- Export briefings as PDF
- Share briefings with team members
- Email delivery of daily briefings
- Slack/Teams integration for notifications
