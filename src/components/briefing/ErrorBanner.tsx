'use client';

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';

interface ErrorBannerProps {
  message: string;
  onRetry: () => void | Promise<void>;
}

/**
 * ErrorBanner Component
 * 
 * Displays error messages with retry functionality.
 * Implements exponential backoff for retry attempts.
 */
export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  const [retrying, setRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  
  const handleRetry = async () => {
    setRetrying(true);
    
    // Calculate exponential backoff delay: 1s, 2s, 4s, 8s, etc.
    const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
    
    // Wait for backoff delay
    await new Promise(resolve => setTimeout(resolve, delay));
    
    try {
      await onRetry();
      setRetryCount(0); // Reset on success
    } catch (error) {
      setRetryCount(prev => prev + 1);
    } finally {
      setRetrying(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-md">
        <div className="bg-alert/10 border border-alert/20 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-alert flex-shrink-0 mt-0.5" size={20} />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-primary mb-2">
                Something went wrong
              </h3>
              <p className="text-muted text-sm mb-4">
                {message}
              </p>
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="bg-primary text-white px-4 py-2 rounded hover:bg-primary/90 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {retrying ? 'Retrying...' : 'Retry'}
              </button>
              {retryCount > 0 && (
                <p className="text-xs text-muted mt-2">
                  Retry attempt {retryCount}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
