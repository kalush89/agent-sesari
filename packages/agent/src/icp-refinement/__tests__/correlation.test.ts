/**
 * Unit tests for data correlation engine
 */

import { describe, it, expect } from 'vitest';
import {
  correlateCustomerData,
  calculateCorrelationCompleteness,
  logCompletenessWarnings,
} from '../correlation.js';
import type { HubSpotCompany, MixpanelCohort, StripeCustomer } from '../types.js';

describe('Data Correlation Engine - Unit Tests', () => {
  // Test fixtures
  const createHubSpotCompany = (id: string): HubSpotCompany => ({
    companyId: id,
    name: `Company ${id}`,
    industry: 'Technology',
    employeeCount: 50,
    region: 'North America',
    totalRevenue: 100000,
    createdAt: '2024-01-01',
    properties: {},
  });

  const createMixpanelCohort = (id: string): MixpanelCohort => ({
    companyId: id,
    ahaEventCount: 100,
    retentionRate: 85,
    lastActiveDate: '2024-01-01',
    engagementScore: 90,
  });

  const createStripeCustomer = (id: string): StripeCustomer => ({
    customerId: `cus_${id}`,
    companyId: id,
    hasChurnSignal: false,
    mrr: 5000,
    subscriptionStatus: 'active',
  });

  describe('correlateCustomerData', () => {
    it('should correlate data with complete Mixpanel and Stripe data', () => {
      const hubspotCompanies = [
        createHubSpotCompany('1'),
        createHubSpotCompany('2'),
        createHubSpotCompany('3'),
      ];

      const mixpanelCohorts = [
        createMixpanelCohort('1'),
        createMixpanelCohort('2'),
        createMixpanelCohort('3'),
      ];

      const stripeCustomers = [
        createStripeCustomer('1'),
        createStripeCustomer('2'),
        createStripeCustomer('3'),
      ];

      const result = correlateCustomerData(hubspotCompanies, mixpanelCohorts, stripeCustomers);

      expect(result).toHaveLength(3);
      expect(result[0].companyId).toBe('1');
      expect(result[0].hubspot).toEqual(hubspotCompanies[0]);
      expect(result[0].mixpanel).toEqual(mixpanelCohorts[0]);
      expect(result[0].stripe).toEqual(stripeCustomers[0]);
    });

    it('should handle missing Mixpanel data with null values', () => {
      const hubspotCompanies = [
        createHubSpotCompany('1'),
        createHubSpotCompany('2'),
        createHubSpotCompany('3'),
      ];

      const mixpanelCohorts = [
        createMixpanelCohort('1'),
        null,
        createMixpanelCohort('3'),
      ];

      const stripeCustomers = [
        createStripeCustomer('1'),
        createStripeCustomer('2'),
        createStripeCustomer('3'),
      ];

      const result = correlateCustomerData(hubspotCompanies, mixpanelCohorts, stripeCustomers);

      expect(result).toHaveLength(3);
      expect(result[0].mixpanel).toEqual(mixpanelCohorts[0]);
      expect(result[1].mixpanel).toBeNull();
      expect(result[2].mixpanel).toEqual(mixpanelCohorts[2]);
      
      // Stripe data should still be present
      expect(result[1].stripe).toEqual(stripeCustomers[1]);
    });

    it('should handle missing Stripe data with null values', () => {
      const hubspotCompanies = [
        createHubSpotCompany('1'),
        createHubSpotCompany('2'),
        createHubSpotCompany('3'),
      ];

      const mixpanelCohorts = [
        createMixpanelCohort('1'),
        createMixpanelCohort('2'),
        createMixpanelCohort('3'),
      ];

      const stripeCustomers = [
        createStripeCustomer('1'),
        null,
        createStripeCustomer('3'),
      ];

      const result = correlateCustomerData(hubspotCompanies, mixpanelCohorts, stripeCustomers);

      expect(result).toHaveLength(3);
      expect(result[0].stripe).toEqual(stripeCustomers[0]);
      expect(result[1].stripe).toBeNull();
      expect(result[2].stripe).toEqual(stripeCustomers[2]);
      
      // Mixpanel data should still be present
      expect(result[1].mixpanel).toEqual(mixpanelCohorts[1]);
    });

    it('should handle both Mixpanel and Stripe data missing', () => {
      const hubspotCompanies = [
        createHubSpotCompany('1'),
        createHubSpotCompany('2'),
        createHubSpotCompany('3'),
      ];

      const mixpanelCohorts = [null, null, null];
      const stripeCustomers = [null, null, null];

      const result = correlateCustomerData(hubspotCompanies, mixpanelCohorts, stripeCustomers);

      expect(result).toHaveLength(3);
      
      for (const correlated of result) {
        expect(correlated.mixpanel).toBeNull();
        expect(correlated.stripe).toBeNull();
        expect(correlated.hubspot).toBeDefined();
      }
    });

    it('should produce exactly one record per HubSpot company', () => {
      const hubspotCompanies = [
        createHubSpotCompany('1'),
        createHubSpotCompany('2'),
        createHubSpotCompany('3'),
        createHubSpotCompany('4'),
        createHubSpotCompany('5'),
      ];

      const mixpanelCohorts = [
        createMixpanelCohort('1'),
        null,
        createMixpanelCohort('3'),
        null,
        createMixpanelCohort('5'),
      ];

      const stripeCustomers = [
        null,
        createStripeCustomer('2'),
        createStripeCustomer('3'),
        null,
        createStripeCustomer('5'),
      ];

      const result = correlateCustomerData(hubspotCompanies, mixpanelCohorts, stripeCustomers);

      expect(result).toHaveLength(5);
      
      // Verify each HubSpot company has exactly one correlated record
      const companyIds = result.map(r => r.companyId);
      expect(new Set(companyIds).size).toBe(5);
    });

    it('should handle empty arrays', () => {
      const result = correlateCustomerData([], [], []);
      expect(result).toHaveLength(0);
    });

    it('should handle single company', () => {
      const hubspotCompanies = [createHubSpotCompany('1')];
      const mixpanelCohorts = [createMixpanelCohort('1')];
      const stripeCustomers = [createStripeCustomer('1')];

      const result = correlateCustomerData(hubspotCompanies, mixpanelCohorts, stripeCustomers);

      expect(result).toHaveLength(1);
      expect(result[0].companyId).toBe('1');
      expect(result[0].hubspot).toEqual(hubspotCompanies[0]);
      expect(result[0].mixpanel).toEqual(mixpanelCohorts[0]);
      expect(result[0].stripe).toEqual(stripeCustomers[0]);
    });
  });

  describe('calculateCorrelationCompleteness', () => {
    it('should calculate 100% completeness with all data present', () => {
      const correlatedCustomers = [
        {
          companyId: '1',
          hubspot: createHubSpotCompany('1'),
          mixpanel: createMixpanelCohort('1'),
          stripe: createStripeCustomer('1'),
        },
        {
          companyId: '2',
          hubspot: createHubSpotCompany('2'),
          mixpanel: createMixpanelCohort('2'),
          stripe: createStripeCustomer('2'),
        },
      ];

      const metrics = calculateCorrelationCompleteness(correlatedCustomers);

      expect(metrics.totalCustomers).toBe(2);
      expect(metrics.mixpanelAvailable).toBe(2);
      expect(metrics.stripeAvailable).toBe(2);
      expect(metrics.mixpanelCompleteness).toBe(100);
      expect(metrics.stripeCompleteness).toBe(100);
    });

    it('should calculate 50% completeness with half data missing', () => {
      const correlatedCustomers = [
        {
          companyId: '1',
          hubspot: createHubSpotCompany('1'),
          mixpanel: createMixpanelCohort('1'),
          stripe: createStripeCustomer('1'),
        },
        {
          companyId: '2',
          hubspot: createHubSpotCompany('2'),
          mixpanel: null,
          stripe: null,
        },
      ];

      const metrics = calculateCorrelationCompleteness(correlatedCustomers);

      expect(metrics.totalCustomers).toBe(2);
      expect(metrics.mixpanelAvailable).toBe(1);
      expect(metrics.stripeAvailable).toBe(1);
      expect(metrics.mixpanelCompleteness).toBe(50);
      expect(metrics.stripeCompleteness).toBe(50);
    });

    it('should calculate 0% completeness with all data missing', () => {
      const correlatedCustomers = [
        {
          companyId: '1',
          hubspot: createHubSpotCompany('1'),
          mixpanel: null,
          stripe: null,
        },
        {
          companyId: '2',
          hubspot: createHubSpotCompany('2'),
          mixpanel: null,
          stripe: null,
        },
      ];

      const metrics = calculateCorrelationCompleteness(correlatedCustomers);

      expect(metrics.totalCustomers).toBe(2);
      expect(metrics.mixpanelAvailable).toBe(0);
      expect(metrics.stripeAvailable).toBe(0);
      expect(metrics.mixpanelCompleteness).toBe(0);
      expect(metrics.stripeCompleteness).toBe(0);
    });

    it('should handle empty array', () => {
      const metrics = calculateCorrelationCompleteness([]);

      expect(metrics.totalCustomers).toBe(0);
      expect(metrics.mixpanelAvailable).toBe(0);
      expect(metrics.stripeAvailable).toBe(0);
      expect(metrics.mixpanelCompleteness).toBe(0);
      expect(metrics.stripeCompleteness).toBe(0);
    });

    it('should calculate different completeness for Mixpanel vs Stripe', () => {
      const correlatedCustomers = [
        {
          companyId: '1',
          hubspot: createHubSpotCompany('1'),
          mixpanel: createMixpanelCohort('1'),
          stripe: createStripeCustomer('1'),
        },
        {
          companyId: '2',
          hubspot: createHubSpotCompany('2'),
          mixpanel: createMixpanelCohort('2'),
          stripe: null,
        },
        {
          companyId: '3',
          hubspot: createHubSpotCompany('3'),
          mixpanel: null,
          stripe: createStripeCustomer('3'),
        },
        {
          companyId: '4',
          hubspot: createHubSpotCompany('4'),
          mixpanel: null,
          stripe: null,
        },
      ];

      const metrics = calculateCorrelationCompleteness(correlatedCustomers);

      expect(metrics.totalCustomers).toBe(4);
      expect(metrics.mixpanelAvailable).toBe(2);
      expect(metrics.stripeAvailable).toBe(2);
      expect(metrics.mixpanelCompleteness).toBe(50);
      expect(metrics.stripeCompleteness).toBe(50);
    });
  });

  describe('logCompletenessWarnings', () => {
    it('should not throw errors when logging', () => {
      const correlatedCustomers = [
        {
          companyId: '1',
          hubspot: createHubSpotCompany('1'),
          mixpanel: null,
          stripe: null,
        },
      ];

      const metrics = calculateCorrelationCompleteness(correlatedCustomers);

      expect(() => {
        logCompletenessWarnings(correlatedCustomers, metrics);
      }).not.toThrow();
    });
  });
});
