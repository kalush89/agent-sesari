'use client';

/**
 * GrowthPlayFeed Component
 * 
 * Displays a feed of pending Growth Plays with loading and error states.
 */

import { useEffect, useState } from 'react';
import { GrowthPlayCard } from './GrowthPlayCard';
import type { GrowthPlay } from '@/types/growth-plays';

export function GrowthPlayFeed() {
  const [growthPlays, setGrowthPlays] = useState<GrowthPlay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGrowthPlays();
  }, []);

  const fetchGrowthPlays = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch('/api/growth-plays');
      
      if (!response.ok) {
        throw new Error('Failed to fetch Growth Plays');
      }
      
      const data = await response.json();
      setGrowthPlays(data.growthPlays || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (id: string, editedContent?: string) => {
    try {
      const response = await fetch(`/api/growth-plays/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'current-user',
          editedContent,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to approve Growth Play');
      }

      // Remove from list
      setGrowthPlays((prev) => prev.filter((gp) => gp.id !== id));
    } catch (err) {
      console.error('Approve failed:', err);
      alert('Failed to approve Growth Play');
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      const response = await fetch(`/api/growth-plays/${id}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'current-user',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to dismiss Growth Play');
      }

      // Remove from list
      setGrowthPlays((prev) => prev.filter((gp) => gp.id !== id));
    } catch (err) {
      console.error('Dismiss failed:', err);
      alert('Failed to dismiss Growth Play');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white rounded-lg p-8 border border-gray-200 animate-pulse"
          >
            <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-800 font-medium mb-2">Failed to load Growth Plays</p>
        <p className="text-red-600 text-sm mb-4">{error}</p>
        <button
          onClick={fetchGrowthPlays}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (growthPlays.length === 0) {
    return (
      <div className="bg-white rounded-lg p-12 text-center border border-gray-200">
        <div className="text-6xl mb-4">✨</div>
        <h3 className="text-xl font-semibold text-[#1A1A1A] mb-2">
          All caught up!
        </h3>
        <p className="text-gray-600">
          No pending Growth Plays at the moment. Check back later.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {growthPlays.map((growthPlay) => (
        <GrowthPlayCard
          key={growthPlay.id}
          growthPlay={growthPlay}
          onApprove={handleApprove}
          onDismiss={handleDismiss}
        />
      ))}
    </div>
  );
}
