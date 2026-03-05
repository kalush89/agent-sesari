'use client';

import { useState, useEffect } from 'react';
import { BriefingHeader } from '@/components/briefing/BriefingHeader';
import { InsightCard } from '@/components/briefing/InsightCard';
import { EmptyState } from '@/components/briefing/EmptyState';
import { ErrorBanner } from '@/components/briefing/ErrorBanner';
import { SkeletonLoader } from '@/components/briefing/SkeletonLoader';
import type { Briefing } from '@/types/briefing';

/**
 * Briefing Page Component
 * 
 * Main page for displaying daily briefings with:
 * - State management for briefing data, loading, and errors
 * - Date navigation with caching
 * - Loading states with skeleton loaders
 * - Error handling with retry functionality
 * - Empty states for new users and quiet days
 * 
 * Follows Sesari's Agentic Editorial aesthetic with single-column layout.
 */
export default function BriefingPage() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(getTodayDate());
  const [cache, setCache] = useState<Map<string, Briefing>>(new Map());
  
  useEffect(() => {
    fetchBriefing(selectedDate);
  }, [selectedDate]);
  
  /**
   * Fetch briefing for a specific date
   * Uses cache if available for same-day requests
   */
  async function fetchBriefing(date: string) {
    // Check cache first
    if (cache.has(date)) {
      setBriefing(cache.get(date)!);
      setLoading(false);
      setError(null);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/briefing?date=${date}`);
      
      if (response.status === 404) {
        setBriefing(null);
        setLoading(false);
        return;
      }
      
      if (!response.ok) {
        throw new Error('Failed to fetch briefing');
      }
      
      const data: Briefing = await response.json();
      setBriefing(data);
      
      // Cache the briefing
      setCache(prev => new Map(prev).set(date, data));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setBriefing(null);
    } finally {
      setLoading(false);
    }
  }
  
  /**
   * Handle date change from navigation
   * Invalidates cache for new date
   */
  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
  };
  
  /**
   * Handle retry after error
   */
  const handleRetry = () => {
    fetchBriefing(selectedDate);
  };
  
  // Loading state
  if (loading) {
    return <SkeletonLoader />;
  }
  
  // Error state
  if (error) {
    return (
      <ErrorBanner
        message={error}
        onRetry={handleRetry}
      />
    );
  }
  
  // Empty state - no briefing available
  if (!briefing) {
    return <EmptyState isNewUser={false} />;
  }
  
  // Empty state - briefing exists but no insights
  if (briefing.insights.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <BriefingHeader
          date={selectedDate}
          insightCount={0}
          onDateChange={handleDateChange}
        />
        <EmptyState isNewUser={false} />
      </div>
    );
  }
  
  // Main briefing display
  return (
    <div className="min-h-screen bg-background">
      <BriefingHeader
        date={selectedDate}
        insightCount={briefing.insightCount}
        onDateChange={handleDateChange}
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

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}
