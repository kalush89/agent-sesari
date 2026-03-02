'use client';

import { useState, useEffect } from 'react';

interface HubSpotOAuthButtonProps {
  onSuccess: () => void;
}

export function HubSpotOAuthButton({ onSuccess }: HubSpotOAuthButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Check for OAuth callback errors in URL
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get('error');
    const errorDescription = params.get('error_description');

    if (errorParam) {
      if (errorParam === 'access_denied') {
        setError('Authorization was cancelled. Please try again.');
      } else {
        setError(errorDescription || 'OAuth authorization failed');
      }
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }

    // Check for success callback
    const success = params.get('success');
    if (success === 'true') {
      onSuccess();
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [onSuccess]);

  const handleConnect = () => {
    setLoading(true);
    setError('');
    // Redirect to OAuth authorization endpoint
    window.location.href = '/api/integrations/oauth/hubspot/authorize';
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-[#FF3D00]/5 border border-[#FF3D00]/20 rounded-lg">
          <p className="text-sm text-[#FF3D00]">{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={handleConnect}
        disabled={loading}
        className="w-full px-6 py-3 bg-[#6B46C1] text-white font-medium rounded-lg hover:bg-[#6B46C1]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Redirecting...' : 'Connect HubSpot'}
      </button>

      <p className="text-sm text-[#1A1A1A]/60">
        You'll be redirected to HubSpot to authorize access to your account
      </p>
    </div>
  );
}
