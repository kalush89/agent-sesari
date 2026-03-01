/**
 * Property-based tests for data correlation engine
 * Feature: dynamic-icp-refinement-engine
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { correlateCustomerData } from '../correlation.js';
import { HubSpotCompany, MixpanelCohort, StripeCustomer } from '../types.js';

/**
 * Arbitrary generator for HubSpot companies
 */
const hubspotCompanyArbitrary = (): fc.Arbitrary<HubSpotCompany> => {
  return fc.record({
    companyId: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    industry: fc.constantFrom('Technology', 'Finance', 'Healthcare', 'Retail', 'Manufacturing'),
    employeeCount: fc.integer({ min: 1, max: 10000 }),
    region: fc.constantFrom('US-East', 'US-West', 'EU', 'APAC'),
    totalRevenue: fc.float({ min: 0, max: 10000000, noNaN: true }),
    createdAt: fc.date().map(d => d.toISOString()),
    properties: fc.constant({}),
  });
};

/**
 * Arbitrary generator for Mixpanel cohorts (nullable)
 */
const mixpanelCohortArbitrary = (companyId: string): fc.Arbitrary<MixpanelCohort | null> => {
  return fc.oneof(
    fc.constant(null),
    fc.record({
      companyId: fc.constant(companyId),
      ahaEventCount: fc.integer({ min: 0, max: 1000 }),
      retentionRate: fc.float({ min: 0, max: 100, noNaN: true }),
      lastActiveDate: fc.date().map(d => d.toISOString()),
      engagementScore: fc.integer({ min: 0, max: 100 }),
    })
  );
};

/**
 * Arbitrary generator for Stripe customers (nullable)
 */
const stripeCustomerArbitrary = (companyId: string): fc.Arbitrary<StripeCustomer | null> => {
  return fc.oneof(
    fc.constant(null),
    fc.record({
      customerId: fc.uuid(),
      companyId: fc.constant(companyId),
      hasChurnSignal: fc.boolean(),
      mrr: fc.float({ min: 0, max: 100000, noNaN: true }),
      subscriptionStatus: fc.constantFrom('active', 'trialing', 'canceled', 'unpaid', 'none'),
    })
  );
};

describe('Data Correlation Engine - Property Tests', () => {
  /**
   * Property 1: Data Correlation Completeness
   * Validates: Requirements 2.1
   * 
   * For any set of HubSpot companies, the correlation engine should produce
   * exactly one CorrelatedCustomer record per HubSpot company, regardless of
   * whether Mixpanel or Stripe data exists.
   */
  it('Property 1: produces exactly one CorrelatedCustomer per HubSpot company', () => {
    fc.assert(
      fc.property(
        fc.array(hubspotCompanyArbitrary(), { minLength: 1, maxLength: 100 }),
        fc.array(fc.boolean(), { minLength: 1, maxLength: 100 }),
        fc.array(fc.boolean(), { minLength: 1, maxLength: 100 }),
        (hubspotCompanies, mixpanelAvailability, stripeAvailability) => {
          // Generate Mixpanel and Stripe data based on availability flags
          const mixpanelCohorts = hubspotCompanies.map((c, i) => {
            const shouldHaveData = mixpanelAvailability[i % mixpanelAvailability.length];
            if (!shouldHaveData) return null;
            
            return {
              companyId: c.companyId,
              ahaEventCount: Math.floor(Math.random() * 1000),
              retentionRate: Math.random() * 100,
              lastActiveDate: new Date().toISOString(),
              engagementScore: Math.floor(Math.random() * 100),
            };
          });
          
          const stripeCustomers = hubspotCompanies.map((c, i) => {
            const shouldHaveData = stripeAvailability[i % stripeAvailability.length];
            if (!shouldHaveData) return null;
            
            return {
              customerId: `cus_${Math.random().toString(36).substring(7)}`,
              companyId: c.companyId,
              hasChurnSignal: Math.random() > 0.5,
              mrr: Math.random() * 100000,
              subscriptionStatus: ['active', 'trialing', 'canceled'][Math.floor(Math.random() * 3)],
            };
          });

          // Correlate the data
          const correlatedCustomers = correlateCustomerData(
            hubspotCompanies,
            mixpanelCohorts,
            stripeCustomers
          );

          // Property: Exactly one CorrelatedCustomer per HubSpot company
          expect(correlatedCustomers.length).toBe(hubspotCompanies.length);

          // Property: Each HubSpot company has a corresponding CorrelatedCustomer
          for (const hubspotCompany of hubspotCompanies) {
            const correlated = correlatedCustomers.find(
              c => c.companyId === hubspotCompany.companyId
            );
            expect(correlated).toBeDefined();
            expect(correlated?.hubspot).toEqual(hubspotCompany);
          }

          // Property: No duplicate company IDs in output
          const companyIds = correlatedCustomers.map(c => c.companyId);
          const uniqueIds = new Set(companyIds);
          expect(uniqueIds.size).toBe(companyIds.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1 (variant): Correlation works with all Mixpanel data missing
   */
  it('Property 1: handles all missing Mixpanel data', () => {
    fc.assert(
      fc.property(
        fc.array(hubspotCompanyArbitrary(), { minLength: 1, maxLength: 50 }),
        (hubspotCompanies) => {
          // All Mixpanel data is null
          const mixpanelCohorts = hubspotCompanies.map(() => null);
          
          // Generate random Stripe data
          const stripeCustomers = hubspotCompanies.map((c) => {
            if (Math.random() > 0.5) return null;
            return {
              customerId: `cus_${Math.random().toString(36).substring(7)}`,
              companyId: c.companyId,
              hasChurnSignal: Math.random() > 0.5,
              mrr: Math.random() * 100000,
              subscriptionStatus: 'active',
            };
          });

          const correlatedCustomers = correlateCustomerData(
            hubspotCompanies,
            mixpanelCohorts,
            stripeCustomers
          );

          // Property: Still produces one record per HubSpot company
          expect(correlatedCustomers.length).toBe(hubspotCompanies.length);

          // Property: All Mixpanel fields are null
          for (const correlated of correlatedCustomers) {
            expect(correlated.mixpanel).toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1 (variant): Correlation works with all Stripe data missing
   */
  it('Property 1: handles all missing Stripe data', () => {
    fc.assert(
      fc.property(
        fc.array(hubspotCompanyArbitrary(), { minLength: 1, maxLength: 50 }),
        (hubspotCompanies) => {
          // Generate random Mixpanel data
          const mixpanelCohorts = hubspotCompanies.map((c) => {
            if (Math.random() > 0.5) return null;
            return {
              companyId: c.companyId,
              ahaEventCount: Math.floor(Math.random() * 1000),
              retentionRate: Math.random() * 100,
              lastActiveDate: new Date().toISOString(),
              engagementScore: Math.floor(Math.random() * 100),
            };
          });
          
          // All Stripe data is null
          const stripeCustomers = hubspotCompanies.map(() => null);

          const correlatedCustomers = correlateCustomerData(
            hubspotCompanies,
            mixpanelCohorts,
            stripeCustomers
          );

          // Property: Still produces one record per HubSpot company
          expect(correlatedCustomers.length).toBe(hubspotCompanies.length);

          // Property: All Stripe fields are null
          for (const correlated of correlatedCustomers) {
            expect(correlated.stripe).toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1 (variant): Correlation works with both Mixpanel and Stripe missing
   */
  it('Property 1: handles both Mixpanel and Stripe data missing', () => {
    fc.assert(
      fc.property(
        fc.array(hubspotCompanyArbitrary(), { minLength: 1, maxLength: 50 }),
        (hubspotCompanies) => {
          // All data is null
          const mixpanelCohorts = hubspotCompanies.map(() => null);
          const stripeCustomers = hubspotCompanies.map(() => null);

          const correlatedCustomers = correlateCustomerData(
            hubspotCompanies,
            mixpanelCohorts,
            stripeCustomers
          );

          // Property: Still produces one record per HubSpot company
          expect(correlatedCustomers.length).toBe(hubspotCompanies.length);

          // Property: All optional fields are null
          for (const correlated of correlatedCustomers) {
            expect(correlated.mixpanel).toBeNull();
            expect(correlated.stripe).toBeNull();
            expect(correlated.hubspot).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
