/**
 * Unit tests for Signal Correlator Lambda
 * 
 * Tests risk calculation functions, high-risk filtering, and edge cases.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import {
  detectUsageDecline,
  checkRenewalProximity,
  aggregateRiskFactors,
  calculateRiskScore,
  handler,
} from '../signal-correlator';
import type { UnifiedCustomerProfile, RiskFactor } from '../types';

const dynamoMock = mockClient(DynamoDBClient);

describe('Signal Correlator', () => {
  beforeEach(() => {
    dynamoMock.reset();
    vi.stubEnv('AWS_REGION', 'us-east-1');
    vi.stubEnv('CUSTOMER_RISK_PROFILES_TABLE', 'test-risk-profiles');
  });

  describe('detectUsageDecline', () => {
    it('should return 100 severity for >50% decline', () => {
      const severity = detectUsageDecline({
        eventCount30Days: 40,
        eventCount60Days: 140, // Previous 30 days: 100, decline: 60%
      });
      expect(severity).toBe(100);
    });

    it('should return 70 severity for >30% decline', () => {
      const severity = detectUsageDecline({
        eventCount30Days: 60,
        eventCount60Days: 150, // Previous 30 days: 90, decline: 33.3%
      });
      expect(severity).toBe(70);
    });

    it('should return 40 severity for >10% decline', () => {
      const severity = detectUsageDecline({
        eventCount30Days: 80,
        eventCount60Days: 170, // Previous 30 days: 90, decline: 11.1%
      });
      expect(severity).toBe(40);
    });

    it('should return 0 severity for <10% decline', () => {
      const severity = detectUsageDecline({
        eventCount30Days: 95,
        eventCount60Days: 200, // Previous 30 days: 105, decline: 9.5%
      });
      expect(severity).toBe(0);
    });

    it('should handle exactly 50% decline', () => {
      const severity = detectUsageDecline({
        eventCount30Days: 50,
        eventCount60Days: 150, // Previous 30 days: 100, decline: 50%
      });
      expect(severity).toBe(70); // >30% but not >50%
    });

    it('should handle zero previous usage', () => {
      const severity = detectUsageDecline({
        eventCount30Days: 0,
        eventCount60Days: 0,
      });
      expect(severity).toBe(100); // No usage at all
    });

    it('should handle new customer with no previous data', () => {
      const severity = detectUsageDecline({
        eventCount30Days: 50,
        eventCount60Days: 50, // Previous period = 0 (50 - 50 = 0)
      });
      // When previous = 0 and recent > 0, this is a new/growing customer, not declining
      expect(severity).toBe(0);
    });
  });

  describe('checkRenewalProximity', () => {
    it('should return 100 severity for renewal within 7 days', () => {
      const renewalDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
      const severity = checkRenewalProximity(renewalDate);
      expect(severity).toBe(100);
    });

    it('should return 80 severity for renewal within 14 days', () => {
      const renewalDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
      const severity = checkRenewalProximity(renewalDate);
      expect(severity).toBe(80);
    });

    it('should return 50 severity for renewal within 30 days', () => {
      const renewalDate = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString();
      const severity = checkRenewalProximity(renewalDate);
      expect(severity).toBe(50);
    });

    it('should return 0 severity for renewal beyond 30 days', () => {
      const renewalDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();
      const severity = checkRenewalProximity(renewalDate);
      expect(severity).toBe(0);
    });

    it('should handle exactly 7 days until renewal', () => {
      const renewalDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const severity = checkRenewalProximity(renewalDate);
      expect(severity).toBe(100);
    });

    it('should handle exactly 30 days until renewal', () => {
      const renewalDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const severity = checkRenewalProximity(renewalDate);
      expect(severity).toBe(50);
    });
  });

  describe('aggregateRiskFactors', () => {
    it('should calculate weighted risk score correctly', () => {
      const riskFactors: RiskFactor[] = [
        { type: 'usage_decline', severity: 100, signalValues: {}, weight: 0.4 },
        { type: 'renewal_approaching', severity: 100, signalValues: {}, weight: 0.3 },
        { type: 'support_tickets', severity: 80, signalValues: {}, weight: 0.2 },
        { type: 'payment_issues', severity: 100, signalValues: {}, weight: 0.1 },
      ];

      const score = aggregateRiskFactors(riskFactors);
      // (100 * 0.4) + (100 * 0.3) + (80 * 0.2) + (100 * 0.1) = 96
      expect(score).toBe(96);
    });

    it('should handle single risk factor', () => {
      const riskFactors: RiskFactor[] = [
        { type: 'usage_decline', severity: 70, signalValues: {}, weight: 0.4 },
      ];

      const score = aggregateRiskFactors(riskFactors);
      expect(score).toBe(28); // 70 * 0.4 = 28
    });

    it('should return 0 for empty risk factors', () => {
      const score = aggregateRiskFactors([]);
      expect(score).toBe(0);
    });

    it('should ensure score is bounded at 100', () => {
      const riskFactors: RiskFactor[] = [
        { type: 'usage_decline', severity: 100, signalValues: {}, weight: 1.0 },
        { type: 'renewal_approaching', severity: 100, signalValues: {}, weight: 1.0 },
      ];

      const score = aggregateRiskFactors(riskFactors);
      expect(score).toBe(100); // Capped at 100
    });

    it('should ensure score is bounded at 0', () => {
      const riskFactors: RiskFactor[] = [
        { type: 'usage_decline', severity: 0, signalValues: {}, weight: 0.4 },
      ];

      const score = aggregateRiskFactors(riskFactors);
      expect(score).toBe(0);
    });
  });

  describe('calculateRiskScore', () => {
    it('should identify high-risk customer with 50% decline + 30 days renewal', () => {
      const profile: UnifiedCustomerProfile = {
        customerId: 'cust_123',
        email: 'test@example.com',
        companyName: 'Test Corp',
        mixpanelData: {
          eventCount30Days: 40,
          eventCount60Days: 140, // 60% decline
          lastActiveDate: '2024-01-15T00:00:00Z',
        },
        hubspotData: {
          openTickets: 0,
          lastContactDate: '2024-01-10T00:00:00Z',
        },
        stripeData: {
          subscriptionStatus: 'active',
          renewalDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
          mrr: 10000,
        },
      };

      const riskProfile = calculateRiskScore(profile);

      expect(riskProfile.customerId).toBe('cust_123');
      // 60% decline = 100 severity * 0.4 weight = 40
      // 25 days renewal = 50 severity * 0.3 weight = 15
      // Total = 55
      expect(riskProfile.riskScore).toBe(55);
      expect(riskProfile.riskFactors).toHaveLength(2); // Usage decline + renewal
      expect(riskProfile.riskFactors.some(f => f.type === 'usage_decline')).toBe(true);
      expect(riskProfile.riskFactors.some(f => f.type === 'renewal_approaching')).toBe(true);
    });

    it('should handle exactly 50% decline', () => {
      const profile: UnifiedCustomerProfile = {
        customerId: 'cust_456',
        email: 'test2@example.com',
        companyName: 'Test Corp 2',
        mixpanelData: {
          eventCount30Days: 50,
          eventCount60Days: 150, // Exactly 50% decline
          lastActiveDate: '2024-01-15T00:00:00Z',
        },
        hubspotData: {
          openTickets: 0,
          lastContactDate: '2024-01-10T00:00:00Z',
        },
        stripeData: {
          subscriptionStatus: 'active',
          renewalDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
          mrr: 10000,
        },
      };

      const riskProfile = calculateRiskScore(profile);

      // Exactly 50% should be treated as 70 severity (>30% but not >50%)
      const usageFactor = riskProfile.riskFactors.find(f => f.type === 'usage_decline');
      expect(usageFactor?.severity).toBe(70);
    });

    it('should handle exactly 30 days until renewal', () => {
      const profile: UnifiedCustomerProfile = {
        customerId: 'cust_789',
        email: 'test3@example.com',
        companyName: 'Test Corp 3',
        mixpanelData: {
          eventCount30Days: 100,
          eventCount60Days: 200,
          lastActiveDate: '2024-01-15T00:00:00Z',
        },
        hubspotData: {
          openTickets: 0,
          lastContactDate: '2024-01-10T00:00:00Z',
        },
        stripeData: {
          subscriptionStatus: 'active',
          renewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          mrr: 10000,
        },
      };

      const riskProfile = calculateRiskScore(profile);

      const renewalFactor = riskProfile.riskFactors.find(f => f.type === 'renewal_approaching');
      expect(renewalFactor?.severity).toBe(50);
    });

    it('should identify low-risk customer', () => {
      const profile: UnifiedCustomerProfile = {
        customerId: 'cust_low',
        email: 'low@example.com',
        companyName: 'Low Risk Corp',
        mixpanelData: {
          eventCount30Days: 100,
          eventCount60Days: 200, // No decline
          lastActiveDate: '2024-01-15T00:00:00Z',
        },
        hubspotData: {
          openTickets: 0,
          lastContactDate: '2024-01-10T00:00:00Z',
        },
        stripeData: {
          subscriptionStatus: 'active',
          renewalDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          mrr: 10000,
        },
      };

      const riskProfile = calculateRiskScore(profile);

      expect(riskProfile.riskScore).toBe(0);
      expect(riskProfile.riskFactors).toHaveLength(0);
    });

    it('should include support ticket risk factor', () => {
      const profile: UnifiedCustomerProfile = {
        customerId: 'cust_support',
        email: 'support@example.com',
        companyName: 'Support Corp',
        mixpanelData: {
          eventCount30Days: 100,
          eventCount60Days: 200,
          lastActiveDate: '2024-01-15T00:00:00Z',
        },
        hubspotData: {
          openTickets: 5,
          lastContactDate: '2024-01-10T00:00:00Z',
        },
        stripeData: {
          subscriptionStatus: 'active',
          renewalDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          mrr: 10000,
        },
      };

      const riskProfile = calculateRiskScore(profile);

      const supportFactor = riskProfile.riskFactors.find(f => f.type === 'support_tickets');
      expect(supportFactor).toBeDefined();
      expect(supportFactor?.severity).toBe(80);
    });

    it('should include payment issue risk factor', () => {
      const profile: UnifiedCustomerProfile = {
        customerId: 'cust_payment',
        email: 'payment@example.com',
        companyName: 'Payment Corp',
        mixpanelData: {
          eventCount30Days: 100,
          eventCount60Days: 200,
          lastActiveDate: '2024-01-15T00:00:00Z',
        },
        hubspotData: {
          openTickets: 0,
          lastContactDate: '2024-01-10T00:00:00Z',
        },
        stripeData: {
          subscriptionStatus: 'past_due',
          renewalDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          mrr: 10000,
        },
      };

      const riskProfile = calculateRiskScore(profile);

      const paymentFactor = riskProfile.riskFactors.find(f => f.type === 'payment_issues');
      expect(paymentFactor).toBeDefined();
      expect(paymentFactor?.severity).toBe(100);
    });

    it('should ensure risk score is always between 0 and 100', () => {
      const profile: UnifiedCustomerProfile = {
        customerId: 'cust_bounds',
        email: 'bounds@example.com',
        companyName: 'Bounds Corp',
        mixpanelData: {
          eventCount30Days: 0,
          eventCount60Days: 200, // 100% decline
          lastActiveDate: '2024-01-15T00:00:00Z',
        },
        hubspotData: {
          openTickets: 10,
          lastContactDate: '2024-01-10T00:00:00Z',
        },
        stripeData: {
          subscriptionStatus: 'past_due',
          renewalDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          mrr: 10000,
        },
      };

      const riskProfile = calculateRiskScore(profile);

      expect(riskProfile.riskScore).toBeGreaterThanOrEqual(0);
      expect(riskProfile.riskScore).toBeLessThanOrEqual(100);
    });

    it('should store signal values in risk factors for audit trail', () => {
      const profile: UnifiedCustomerProfile = {
        customerId: 'cust_audit',
        email: 'audit@example.com',
        companyName: 'Audit Corp',
        mixpanelData: {
          eventCount30Days: 40,
          eventCount60Days: 140,
          lastActiveDate: '2024-01-15T00:00:00Z',
        },
        hubspotData: {
          openTickets: 0,
          lastContactDate: '2024-01-10T00:00:00Z',
        },
        stripeData: {
          subscriptionStatus: 'active',
          renewalDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
          mrr: 10000,
        },
      };

      const riskProfile = calculateRiskScore(profile);

      const usageFactor = riskProfile.riskFactors.find(f => f.type === 'usage_decline');
      expect(usageFactor?.signalValues).toEqual({
        eventCount30Days: 40,
        eventCount60Days: 140,
        lastActiveDate: '2024-01-15T00:00:00Z',
      });
    });
  });

  describe('handler', () => {
    it('should process customers and return high-risk profiles', async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      const input = {
        customers: [
          {
            customerId: 'cust_high',
            email: 'high@example.com',
            companyName: 'High Risk Corp',
            mixpanelData: {
              eventCount30Days: 20,
              eventCount60Days: 140, // 80% decline
              lastActiveDate: '2024-01-15T00:00:00Z',
            },
            hubspotData: {
              openTickets: 5, // High support tickets
              lastContactDate: '2024-01-10T00:00:00Z',
            },
            stripeData: {
              subscriptionStatus: 'active' as const,
              renewalDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days
              mrr: 10000,
            },
          },
          {
            customerId: 'cust_low',
            email: 'low@example.com',
            companyName: 'Low Risk Corp',
            mixpanelData: {
              eventCount30Days: 100,
              eventCount60Days: 200,
              lastActiveDate: '2024-01-15T00:00:00Z',
            },
            hubspotData: {
              openTickets: 0,
              lastContactDate: '2024-01-10T00:00:00Z',
            },
            stripeData: {
              subscriptionStatus: 'active' as const,
              renewalDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
              mrr: 10000,
            },
          },
        ],
      };

      const output = await handler(input);

      expect(output.totalAnalyzed).toBe(2);
      expect(output.highRiskCustomers.length).toBe(1);
      expect(output.highRiskCustomers[0].customerId).toBe('cust_high');
      expect(output.highRiskCustomers[0].riskScore).toBeGreaterThan(70);
    });

    it('should store all risk profiles in DynamoDB', async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      const input = {
        customers: [
          {
            customerId: 'cust_1',
            email: 'test1@example.com',
            companyName: 'Test Corp 1',
            mixpanelData: {
              eventCount30Days: 100,
              eventCount60Days: 200,
              lastActiveDate: '2024-01-15T00:00:00Z',
            },
            hubspotData: {
              openTickets: 0,
              lastContactDate: '2024-01-10T00:00:00Z',
            },
            stripeData: {
              subscriptionStatus: 'active' as const,
              renewalDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
              mrr: 10000,
            },
          },
        ],
      };

      await handler(input);

      expect(dynamoMock.calls()).toHaveLength(1);
      expect(dynamoMock.call(0).args[0].input).toMatchObject({
        TableName: 'test-risk-profiles',
      });
    });

    it('should throw error if environment variables are missing', async () => {
      vi.unstubAllEnvs();

      const input = { customers: [] };

      await expect(handler(input)).rejects.toThrow();
    });
  });
});
