'use client';

import { useEffect, useState } from 'react';
import { StripeConnectionForm } from '@/components/integrations/StripeConnectionForm';
import { MixpanelConnectionForm } from '@/components/integrations/MixpanelConnectionForm';
import { HubSpotOAuthButton } from '@/components/integrations/HubSpotOAuthButton';
import { ConnectedServicesList } from '@/components/integrations/ConnectedServicesList';

interface Integration {
  service_name: string;
  display_name: string;
  credential_type: string;
  masked_value: string;
  connected_at: string;
}

export default function IntegrationsPage() {
  const [connectedServices, setConnectedServices] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConnectedServices = async () => {
    try {
      const response = await fetch('/api/integrations/list');
      if (response.ok) {
        const data = await response.json();
        setConnectedServices(data.integrations || []);
      }
    } catch (error) {
      console.error('Failed to fetch connected services:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnectedServices();
  }, []);

  const handleConnectionSuccess = () => {
    fetchConnectedServices();
  };

  const handleDisconnect = async (serviceName: string) => {
    await fetchConnectedServices();
  };

  const isConnected = (serviceName: string) => {
    return connectedServices.some(s => s.service_name === serviceName);
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-[#1A1A1A] mb-3">
            Integrations
          </h1>
          <p className="text-lg text-[#1A1A1A]/60">
            Connect your business tools to enable autonomous growth actions
          </p>
        </div>

        {/* Connected Services */}
        {connectedServices.length > 0 && (
          <div className="mb-16">
            <h2 className="text-2xl font-bold text-[#1A1A1A] mb-6">
              Connected Services
            </h2>
            <ConnectedServicesList
              services={connectedServices}
              onDisconnect={handleDisconnect}
            />
          </div>
        )}

        {/* Available Integrations */}
        <div>
          <h2 className="text-2xl font-bold text-[#1A1A1A] mb-6">
            {connectedServices.length > 0 ? 'Add More Services' : 'Available Integrations'}
          </h2>

          <div className="space-y-6">
            {/* HubSpot */}
            <div className="bg-white rounded-lg p-8 shadow-sm border border-[#1A1A1A]/5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold text-[#1A1A1A] mb-2">
                    HubSpot
                  </h3>
                  <p className="text-[#1A1A1A]/60">
                    Connect your CRM to track deals and customer interactions
                  </p>
                </div>
                {isConnected('hubspot') && (
                  <span className="px-3 py-1 bg-[#00C853]/10 text-[#00C853] text-sm font-medium rounded-full">
                    Connected
                  </span>
                )}
              </div>
              {!isConnected('hubspot') && (
                <HubSpotOAuthButton onSuccess={handleConnectionSuccess} />
              )}
            </div>

            {/* Stripe */}
            <div className="bg-white rounded-lg p-8 shadow-sm border border-[#1A1A1A]/5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold text-[#1A1A1A] mb-2">
                    Stripe
                  </h3>
                  <p className="text-[#1A1A1A]/60">
                    Monitor payments, subscriptions, and revenue metrics
                  </p>
                </div>
                {isConnected('stripe') && (
                  <span className="px-3 py-1 bg-[#00C853]/10 text-[#00C853] text-sm font-medium rounded-full">
                    Connected
                  </span>
                )}
              </div>
              {!isConnected('stripe') && (
                <StripeConnectionForm onSuccess={handleConnectionSuccess} />
              )}
            </div>

            {/* Mixpanel */}
            <div className="bg-white rounded-lg p-8 shadow-sm border border-[#1A1A1A]/5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold text-[#1A1A1A] mb-2">
                    Mixpanel
                  </h3>
                  <p className="text-[#1A1A1A]/60">
                    Analyze user behavior and product analytics
                  </p>
                </div>
                {isConnected('mixpanel') && (
                  <span className="px-3 py-1 bg-[#00C853]/10 text-[#00C853] text-sm font-medium rounded-full">
                    Connected
                  </span>
                )}
              </div>
              {!isConnected('mixpanel') && (
                <MixpanelConnectionForm onSuccess={handleConnectionSuccess} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
