'use client';

import { useRouter } from 'next/navigation';

interface EmptyStateProps {
  isNewUser?: boolean;
}

/**
 * EmptyState Component
 * 
 * Displays a helpful message when no briefing data is available.
 * Shows different messages for new users vs. quiet days.
 */
export function EmptyState({ isNewUser = false }: EmptyStateProps) {
  const router = useRouter();
  
  const handleConnectIntegration = () => {
    router.push('/integrations');
  };
  
  if (isNewUser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h2 className="text-2xl font-bold text-primary mb-4">
            Welcome to Sesari!
          </h2>
          <p className="text-muted mb-6">
            Connect your first integration to start receiving daily briefings with insights from your business signals.
          </p>
          <button
            onClick={handleConnectIntegration}
            className="bg-growth text-white px-6 py-3 rounded hover:bg-growth-hover transition-colors font-medium"
          >
            Connect Integration
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h2 className="text-2xl font-bold text-primary mb-4">
          All quiet today
        </h2>
        <p className="text-muted">
          No new signals detected. Check back tomorrow for your next briefing.
        </p>
      </div>
    </div>
  );
}
