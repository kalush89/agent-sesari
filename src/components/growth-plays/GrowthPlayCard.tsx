'use client';

/**
 * GrowthPlayCard Component
 * 
 * Displays a single Growth Play with Thought Trace and action buttons.
 * Follows Sesari's Agentic Editorial aesthetic.
 */

import { useState } from 'react';
import type { GrowthPlay } from '@/types/growth-plays';

interface GrowthPlayCardProps {
  growthPlay: GrowthPlay;
  onApprove: (id: string, editedContent?: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
}

export function GrowthPlayCard({ growthPlay, onApprove, onDismiss }: GrowthPlayCardProps) {
  const [isThoughtTraceOpen, setIsThoughtTraceOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(growthPlay.draftContent);
  const [isLoading, setIsLoading] = useState(false);

  const handleApprove = async () => {
    setIsLoading(true);
    try {
      await onApprove(
        growthPlay.id,
        isEditing ? editedContent : undefined
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = async () => {
    setIsLoading(true);
    try {
      await onDismiss(growthPlay.id);
    } finally {
      setIsLoading(false);
    }
  };

  const riskColor = growthPlay.riskScore > 85 ? '#FF3D00' : '#6B46C1';

  return (
    <div className="bg-white rounded-lg p-8 mb-6 border border-gray-200">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-xl font-semibold text-[#1A1A1A] mb-1">
            {growthPlay.customerName} at {growthPlay.companyName}
          </h3>
          <p className="text-sm text-gray-600">
            {growthPlay.communicationType === 'email' ? 'Email' : 'Slack Message'}
          </p>
        </div>
        <div
          className="px-3 py-1 rounded-full text-sm font-medium"
          style={{ backgroundColor: `${riskColor}20`, color: riskColor }}
        >
          Risk: {growthPlay.riskScore}/100
        </div>
      </div>

      {/* Subject (Email only) */}
      {growthPlay.subject && (
        <div className="mb-4">
          <p className="text-sm text-gray-500 mb-1">Subject</p>
          <p className="font-medium text-[#1A1A1A]">{growthPlay.subject}</p>
        </div>
      )}

      {/* Draft Content */}
      <div className="mb-6">
        {isEditing ? (
          <textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            className="w-full p-4 border border-gray-300 rounded-lg text-[#1A1A1A] min-h-[200px] focus:outline-none focus:ring-2 focus:ring-[#6B46C1]"
          />
        ) : (
          <p className="text-[#1A1A1A] leading-relaxed whitespace-pre-wrap">
            {growthPlay.editedContent || growthPlay.draftContent}
          </p>
        )}
      </div>

      {/* Thought Trace */}
      <div className="mb-6">
        <button
          onClick={() => setIsThoughtTraceOpen(!isThoughtTraceOpen)}
          className="text-sm text-[#6B46C1] hover:underline flex items-center gap-2"
        >
          {isThoughtTraceOpen ? '▼' : '▶'} Why this recommendation?
        </button>
        {isThoughtTraceOpen && (
          <div className="mt-4 p-4 bg-[#FAFAFA] rounded-lg">
            <p className="text-sm text-gray-700 mb-3">
              {growthPlay.thoughtTrace.reasoning}
            </p>
            <div className="space-y-2">
              {growthPlay.thoughtTrace.riskFactors.map((factor, idx) => (
                <div key={idx} className="text-sm">
                  <span className="font-medium text-[#1A1A1A]">
                    {factor.type.replace('_', ' ')}:
                  </span>
                  <span className="text-gray-600 ml-2">
                    Severity {factor.severity}/100
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Sources: {growthPlay.thoughtTrace.signalSources.join(', ')}
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        {isEditing ? (
          <>
            <button
              onClick={() => setIsEditing(false)}
              className="px-6 py-2 border border-gray-300 rounded-lg text-[#1A1A1A] hover:bg-gray-50"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              onClick={handleApprove}
              className="px-6 py-2 bg-[#00C853] text-white rounded-lg hover:bg-[#00B04A] disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? 'Approving...' : 'Approve & Send'}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setIsEditing(true)}
              className="px-6 py-2 border border-gray-300 rounded-lg text-[#1A1A1A] hover:bg-gray-50"
              disabled={isLoading}
            >
              Edit
            </button>
            <button
              onClick={handleApprove}
              className="px-6 py-2 bg-[#00C853] text-white rounded-lg hover:bg-[#00B04A] disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? 'Approving...' : 'Approve & Send'}
            </button>
            <button
              onClick={handleDismiss}
              className="px-6 py-2 border border-gray-300 rounded-lg text-[#1A1A1A] hover:bg-gray-50 disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? 'Dismissing...' : 'Dismiss'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
