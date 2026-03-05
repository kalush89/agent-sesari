/**
 * Type validation tests
 * 
 * These tests verify that our type definitions are correctly structured
 * and compatible with the Universal Signal schema.
 */

import { describe, it, expect } from 'vitest';
import type {
  Insight,
  Briefing,
  ThoughtTrace,
  GrowthPlay,
  EnvironmentConfig
} from '../types.js';

describe('Type Definitions', () => {
  it('should define Insight type correctly', () => {
    const insight: Insight = {
      id: 'insight-1',
      narrative: 'Test narrative',
      severity: 'high',
      category: 'revenue',
      thoughtTrace: {
        signals: [{
          source: 'stripe',
          eventType: 'revenue.expansion',
          timestamp: Date.now(),
          severity: 'high'
        }]
      },
      growthPlay: {
        label: 'View Details',
        action: 'navigate',
        target: '/customers/123'
      }
    };
    
    expect(insight).toBeDefined();
    expect(insight.id).toBe('insight-1');
  });
  
  it('should define Briefing type correctly', () => {
    const briefing: Briefing = {
      date: '2024-01-15',
      generatedAt: Date.now(),
      insights: [],
      metadata: {
        signalCount: 0,
        priorityLevel: 'low',
        categories: {
          revenue: 0,
          relationship: 0,
          behavioral: 0
        }
      }
    };
    
    expect(briefing).toBeDefined();
    expect(briefing.date).toBe('2024-01-15');
  });
  
  it('should define ThoughtTrace type correctly', () => {
    const thoughtTrace: ThoughtTrace = {
      signals: [{
        source: 'hubspot',
        eventType: 'relationship.engagement_gap',
        timestamp: Date.now(),
        severity: 'medium'
      }]
    };
    
    expect(thoughtTrace).toBeDefined();
    expect(thoughtTrace.signals).toHaveLength(1);
  });
  
  it('should define GrowthPlay type correctly', () => {
    const growthPlay: GrowthPlay = {
      label: 'Open in HubSpot',
      action: 'external',
      target: 'https://app.hubspot.com/contacts/123'
    };
    
    expect(growthPlay).toBeDefined();
    expect(growthPlay.action).toBe('external');
  });
});
