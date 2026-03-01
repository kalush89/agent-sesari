/**
 * Basic setup tests for ICP Refinement Engine
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SCORING_WEIGHTS,
  DEFAULT_ENGINE_CONFIG,
} from '../config.js';
import type {
  HubSpotCompany,
  MixpanelCohort,
  StripeCustomer,
  CorrelatedCustomer,
  ScoredCustomer,
  MaskedCustomer,
  ICPProfile,
  ICPAnalysisRecord,
  EngineConfig,
} from '../types.js';

describe('ICP Refinement Engine - Setup', () => {
  describe('Configuration', () => {
    it('should have valid default scoring weights that sum to 1.0', () => {
      const { ltv, engagement, retention } = DEFAULT_SCORING_WEIGHTS;
      const sum = ltv + engagement + retention;
      
      expect(sum).toBeCloseTo(1.0, 5);
      expect(ltv).toBe(0.4);
      expect(engagement).toBe(0.3);
      expect(retention).toBe(0.3);
    });

    it('should have valid default engine config', () => {
      expect(DEFAULT_ENGINE_CONFIG.topPercentile).toBe(10);
      expect(DEFAULT_ENGINE_CONFIG.minSampleSize).toBe(20);
      expect(DEFAULT_ENGINE_CONFIG.scoringWeights).toEqual(DEFAULT_SCORING_WEIGHTS);
    });
  });

  describe('Type Definitions', () => {
    it('should create valid HubSpotCompany object', () => {
      const company: HubSpotCompany = {
        companyId: 'test-123',
        name: 'Test Company',
        industry: 'Technology',
        employeeCount: 50,
        region: 'North America',
        totalRevenue: 100000,
        createdAt: '2024-01-01',
        properties: {},
      };

      expect(company.companyId).toBe('test-123');
      expect(company.industry).toBe('Technology');
    });

    it('should create valid CorrelatedCustomer with null optional fields', () => {
      const company: HubSpotCompany = {
        companyId: 'test-123',
        name: 'Test Company',
        industry: 'Technology',
        employeeCount: 50,
        region: 'North America',
        totalRevenue: 100000,
        createdAt: '2024-01-01',
        properties: {},
      };

      const correlated: CorrelatedCustomer = {
        companyId: 'test-123',
        hubspot: company,
        mixpanel: null,
        stripe: null,
      };

      expect(correlated.mixpanel).toBeNull();
      expect(correlated.stripe).toBeNull();
    });

    it('should create valid ScoredCustomer with score breakdown', () => {
      const company: HubSpotCompany = {
        companyId: 'test-123',
        name: 'Test Company',
        industry: 'Technology',
        employeeCount: 50,
        region: 'North America',
        totalRevenue: 100000,
        createdAt: '2024-01-01',
        properties: {},
      };

      const scored: ScoredCustomer = {
        companyId: 'test-123',
        hubspot: company,
        mixpanel: null,
        stripe: null,
        idealCustomerScore: 75,
        scoreBreakdown: {
          ltvScore: 80,
          engagementScore: 70,
          retentionScore: 75,
        },
      };

      expect(scored.idealCustomerScore).toBe(75);
      expect(scored.scoreBreakdown.ltvScore).toBe(80);
    });

    it('should create valid ICPProfile', () => {
      const profile: ICPProfile = {
        version: 1,
        generatedAt: '2024-01-01T00:00:00Z',
        traits: {
          industries: ['Technology', 'Finance'],
          sizeRange: '50-200',
          regions: ['North America'],
          usagePatterns: ['High engagement'],
        },
        reasoning: 'Test reasoning',
        confidenceScore: 85,
        sampleSize: 50,
      };

      expect(profile.version).toBe(1);
      expect(profile.traits.industries).toHaveLength(2);
      expect(profile.confidenceScore).toBe(85);
    });
  });
});
