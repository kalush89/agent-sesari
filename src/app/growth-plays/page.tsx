/**
 * Growth Plays Dashboard Page
 * 
 * Displays pending Growth Plays for user review and approval.
 * Follows Sesari's Agentic Editorial aesthetic with calm design and high whitespace.
 */

import { GrowthPlayFeed } from '@/components/growth-plays/GrowthPlayFeed';

export default function GrowthPlaysPage() {
  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-[#1A1A1A] mb-3">
            Growth Plays
          </h1>
          <p className="text-lg text-gray-600">
            Review and approve automated customer outreach recommendations
          </p>
        </div>

        {/* Feed */}
        <GrowthPlayFeed />
      </div>
    </div>
  );
}
