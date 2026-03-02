'use client';

import { useState } from 'react';

interface MixpanelConnectionFormProps {
  onSuccess: () => void;
}

export function MixpanelConnectionForm({ onSuccess }: MixpanelConnectionFormProps) {
  const [username, setUsername] = useState('');
  const [secret, setSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [maskedValue, setMaskedValue] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  const validateNonEmpty = (value: string): boolean => {
    return value.trim().length > 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMaskedValue('');

    // Client-side non-empty validation
    if (!validateNonEmpty(username)) {
      setError('Username is required');
      return;
    }

    if (!validateNonEmpty(secret)) {
      setError('Secret is required');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/integrations/connect/mixpanel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, secret })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setMaskedValue(data.masked_value);
        setIsConnected(true);
        setUsername('');
        setSecret('');
        onSuccess();
      } else {
        setError(data.error_message || 'Failed to connect Mixpanel');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (isConnected) {
    return (
      <div className="p-4 bg-[#00C853]/5 border border-[#00C853]/20 rounded-lg">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-[#00C853]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-[#1A1A1A] font-medium">
            Connected: {maskedValue}
          </span>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="mixpanel-username" className="block text-sm font-medium text-[#1A1A1A] mb-2">
          Service Account Username
        </label>
        <input
          id="mixpanel-username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="service-account-username"
          className="w-full px-4 py-2 border border-[#1A1A1A]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6B46C1] focus:border-transparent text-[#1A1A1A] placeholder:text-[#1A1A1A]/40"
          disabled={loading}
        />
      </div>

      <div>
        <label htmlFor="mixpanel-secret" className="block text-sm font-medium text-[#1A1A1A] mb-2">
          Service Account Secret
        </label>
        <input
          id="mixpanel-secret"
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Enter your service account secret"
          className="w-full px-4 py-2 border border-[#1A1A1A]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6B46C1] focus:border-transparent text-[#1A1A1A] placeholder:text-[#1A1A1A]/40"
          disabled={loading}
        />
        <p className="mt-1 text-sm text-[#1A1A1A]/60">
          Find your service account credentials in Mixpanel under Project Settings → Service Accounts
        </p>
      </div>

      {error && (
        <div className="p-3 bg-[#FF3D00]/5 border border-[#FF3D00]/20 rounded-lg">
          <p className="text-sm text-[#FF3D00]">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !username || !secret}
        className="w-full px-6 py-3 bg-[#6B46C1] text-white font-medium rounded-lg hover:bg-[#6B46C1]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Connecting...' : 'Connect Mixpanel'}
      </button>
    </form>
  );
}
