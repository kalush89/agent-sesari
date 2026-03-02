'use client';

import { useState } from 'react';

interface ConnectedService {
  service_name: string;
  display_name: string;
  credential_type: string;
  masked_value: string;
  connected_at: string;
}

interface ConnectedServicesListProps {
  services: ConnectedService[];
  onDisconnect: (serviceName: string) => void;
}

export function ConnectedServicesList({ services, onDisconnect }: ConnectedServicesListProps) {
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);
  const [error, setError] = useState('');

  const handleDisconnectClick = (serviceName: string) => {
    setConfirmDisconnect(serviceName);
    setError('');
  };

  const handleConfirmDisconnect = async (serviceName: string) => {
    setDisconnecting(serviceName);
    setError('');

    try {
      const response = await fetch(`/api/integrations/disconnect/${serviceName}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setConfirmDisconnect(null);
        onDisconnect(serviceName);
      } else {
        const data = await response.json();
        setError(data.error_message || 'Failed to disconnect service');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setDisconnecting(null);
    }
  };

  const handleCancelDisconnect = () => {
    setConfirmDisconnect(null);
    setError('');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-[#FF3D00]/5 border border-[#FF3D00]/20 rounded-lg">
          <p className="text-sm text-[#FF3D00]">{error}</p>
        </div>
      )}

      {services.map((service) => (
        <div
          key={service.service_name}
          className="bg-white rounded-lg p-6 shadow-sm border border-[#1A1A1A]/5"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-lg font-bold text-[#1A1A1A]">
                  {service.display_name}
                </h3>
                <span className="px-2 py-1 bg-[#00C853]/10 text-[#00C853] text-xs font-medium rounded-full">
                  Connected
                </span>
              </div>

              <div className="space-y-1">
                <p className="text-sm text-[#1A1A1A]/60">
                  <span className="font-medium">Credential:</span> {service.masked_value}
                </p>
                <p className="text-sm text-[#1A1A1A]/60">
                  <span className="font-medium">Connected:</span> {formatDate(service.connected_at)}
                </p>
              </div>
            </div>

            <div>
              {confirmDisconnect === service.service_name ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleConfirmDisconnect(service.service_name)}
                    disabled={disconnecting === service.service_name}
                    className="px-4 py-2 bg-[#FF3D00] text-white text-sm font-medium rounded-lg hover:bg-[#FF3D00]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {disconnecting === service.service_name ? 'Disconnecting...' : 'Confirm'}
                  </button>
                  <button
                    onClick={handleCancelDisconnect}
                    disabled={disconnecting === service.service_name}
                    className="px-4 py-2 bg-[#1A1A1A]/10 text-[#1A1A1A] text-sm font-medium rounded-lg hover:bg-[#1A1A1A]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleDisconnectClick(service.service_name)}
                  className="px-4 py-2 text-[#FF3D00] text-sm font-medium hover:bg-[#FF3D00]/5 rounded-lg transition-colors"
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
