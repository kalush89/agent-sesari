/**
 * Unit tests for narrative generation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  type InvokeModelCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';
import { generateNarrative, constructPrompt, formatMetrics, generateTemplateNarrative } from '../narrative-generation.js';
import type { Universal_Signal, NormalizedMetrics } from '../types.js';

const bedrockMock = mockClient(BedrockRuntimeClient);

/**
 * Helper to create a properly typed Bedrock response
 */
function createBedrockResponse(text: string): Partial<InvokeModelCommandOutput> {
  const mockResponse = {
    content: [{ text }],
  };
  return {
    body: new TextEncoder().encode(JSON.stringify(mockResponse)) as any,
    $metadata: {},
  };
}

describe('Narrative Generation', () => {
  beforeEach(() => {
    bedrockMock.reset();
    vi.clearAllMocks();
    vi.useFakeTimers();
    
    // Set environment variables
    process.env.BEDROCK_MODEL_ID = 'amazon.nova-lite-v1:0';
    process.env.AWS_REGION = 'us-east-1';
    process.env.NARRATIVE_MAX_WORDS = '150';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('generateNarrative', () => {
    it('should generate narrative successfully on first attempt', async () => {
      const signal: Universal_Signal = {
        signalId: 'sig_123',
        category: 'revenue',
        eventType: 'revenue.expansion',
        entity: {
          primaryKey: 'Acme Corp',
          alternateKeys: [],
          platformIds: { stripe: 'cus_123' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'stripe',
          originalEventType: 'customer.subscription.updated',
          originalEventId: 'evt_123',
        },
        impact: {
          severity: 'high',
          metrics: {
            revenue: {
              amount: 1000,
              currency: 'USD',
              mrr: 1000,
              mrrChange: 500,
            },
          },
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const expectedText = "Acme Corp upgraded their subscription, increasing MRR by $500. This is a positive signal indicating growth. Consider reaching out to thank them and explore additional upsell opportunities.";

      bedrockMock.on(InvokeModelCommand).resolves(createBedrockResponse(expectedText));

      const narrative = await generateNarrative(signal);

      expect(narrative).toBe(expectedText);
      expect(bedrockMock.calls()).toHaveLength(1);
    });

    it('should retry once after 10 seconds on failure', async () => {
      const signal: Universal_Signal = {
        signalId: 'sig_123',
        category: 'revenue',
        eventType: 'revenue.churn',
        entity: {
          primaryKey: 'Beta Inc',
          alternateKeys: [],
          platformIds: { stripe: 'cus_456' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'stripe',
          originalEventType: 'customer.subscription.deleted',
          originalEventId: 'evt_456',
        },
        impact: {
          severity: 'critical',
          metrics: {
            revenue: {
              amount: -2000,
              currency: 'USD',
              mrr: 0,
              mrrChange: -2000,
            },
          },
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const expectedText = "Beta Inc cancelled their subscription, resulting in a $2,000 MRR loss. This is a critical churn event. Reach out immediately to understand their reasons and attempt to win them back.";

      // First call fails, second succeeds
      bedrockMock
        .on(InvokeModelCommand)
        .rejectsOnce(new Error('Service temporarily unavailable'))
        .resolvesOnce(createBedrockResponse(expectedText));

      const promise = generateNarrative(signal);
      
      // Fast-forward time by 10 seconds
      await vi.advanceTimersByTimeAsync(10000);
      
      const narrative = await promise;

      expect(narrative).toBe(expectedText);
      expect(bedrockMock.calls()).toHaveLength(2);
    });

    it('should fall back to template-based narrative after retry fails', async () => {
      const signal: Universal_Signal = {
        signalId: 'sig_789',
        category: 'relationship',
        eventType: 'relationship.engagement_gap',
        entity: {
          primaryKey: 'Gamma LLC',
          alternateKeys: [],
          platformIds: { hubspot: 'contact_789' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'hubspot',
          originalEventType: 'contact.updated',
          originalEventId: 'evt_789',
        },
        impact: {
          severity: 'medium',
          metrics: {
            relationship: {
              daysSinceContact: 45,
              sentimentScore: -0.3,
            },
          },
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      // Both calls fail
      bedrockMock
        .on(InvokeModelCommand)
        .rejects(new Error('Service unavailable'));

      const promise = generateNarrative(signal);
      
      // Fast-forward time by 10 seconds
      await vi.advanceTimersByTimeAsync(10000);

      const narrative = await promise;
      
      // Should return template-based narrative
      expect(narrative).toContain('Gamma LLC');
      expect(narrative).toContain('45 days');
      expect(narrative).toContain('check-in');
      expect(bedrockMock.calls()).toHaveLength(2);
    });

    it('should fall back to template when response body is empty', async () => {
      const signal: Universal_Signal = {
        signalId: 'sig_empty',
        category: 'behavioral',
        eventType: 'behavioral.power_user',
        entity: {
          primaryKey: 'user@example.com',
          alternateKeys: [],
          platformIds: { mixpanel: 'user_123' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'mixpanel',
          originalEventType: 'engagement_spike',
          originalEventId: 'evt_mix_123',
        },
        impact: {
          severity: 'low',
          metrics: {
            behavioral: {
              engagementScore: 95,
              usageFrequency: 50,
            },
          },
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      bedrockMock.on(InvokeModelCommand).resolves({
        body: undefined,
      });

      const promise = generateNarrative(signal);
      
      // Fast-forward time by 10 seconds for retry
      await vi.advanceTimersByTimeAsync(10000);

      const narrative = await promise;
      
      // Should return template-based narrative
      expect(narrative).toContain('user@example.com');
      expect(narrative).toContain('power user');
      expect(narrative).toContain('95');
    });

    it('should handle alternative response format with completion field', async () => {
      const signal: Universal_Signal = {
        signalId: 'sig_alt',
        category: 'revenue',
        eventType: 'revenue.payment_failed',
        entity: {
          primaryKey: 'Delta Corp',
          alternateKeys: [],
          platformIds: { stripe: 'cus_delta' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'stripe',
          originalEventType: 'invoice.payment_failed',
          originalEventId: 'evt_delta',
        },
        impact: {
          severity: 'high',
          metrics: {
            revenue: {
              amount: 500,
              currency: 'USD',
            },
          },
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const expectedText = "Delta Corp's payment of $500 failed. This could lead to churn if not resolved quickly. Contact them to update payment information.";
      
      const mockResponse = {
        completion: expectedText,
      };

      bedrockMock.on(InvokeModelCommand).resolves({
        body: new TextEncoder().encode(JSON.stringify(mockResponse)) as any,
        $metadata: {},
      });

      const narrative = await generateNarrative(signal);

      expect(narrative).toBe(expectedText);
    });
  });

  describe('constructPrompt', () => {
    it('should construct prompt with all signal details', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_prompt',
        category: 'revenue',
        eventType: 'revenue.expansion',
        entity: {
          primaryKey: 'Test Company',
          alternateKeys: [],
          platformIds: { stripe: 'cus_test' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'stripe',
          originalEventType: 'customer.subscription.updated',
          originalEventId: 'evt_test',
        },
        impact: {
          severity: 'high',
          metrics: {
            revenue: {
              amount: 1500,
              currency: 'USD',
              mrr: 1500,
              mrrChange: 500,
            },
          },
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const prompt = constructPrompt(signal, 150);

      expect(prompt).toContain('Test Company');
      expect(prompt).toContain('Revenue Expansion');
      expect(prompt).toContain('high');
      expect(prompt).toContain('$1,500.00');
      expect(prompt).toContain('MRR Change: +$500.00');
      expect(prompt).toContain('under 150 words');
    });

    it('should format event type with proper capitalization', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_format',
        category: 'relationship',
        eventType: 'relationship.engagement_gap',
        entity: {
          primaryKey: 'Format Test',
          alternateKeys: [],
          platformIds: {},
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'hubspot',
          originalEventType: 'contact.updated',
          originalEventId: 'evt_format',
        },
        impact: {
          severity: 'medium',
          metrics: {},
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const prompt = constructPrompt(signal, 150);

      expect(prompt).toContain('Relationship Engagement Gap');
    });
  });

  describe('formatMetrics', () => {
    it('should format revenue metrics with currency', () => {
      const metrics: NormalizedMetrics = {
        revenue: {
          amount: 1234.56,
          currency: 'USD',
          mrr: 5000,
          mrrChange: 500,
        },
      };

      const formatted = formatMetrics(metrics);

      expect(formatted).toContain('Amount: $1,234.56');
      expect(formatted).toContain('MRR: $5,000.00');
      expect(formatted).toContain('MRR Change: +$500.00');
    });

    it('should format negative MRR change correctly', () => {
      const metrics: NormalizedMetrics = {
        revenue: {
          amount: 1000,
          currency: 'USD',
          mrrChange: -500,
        },
      };

      const formatted = formatMetrics(metrics);

      expect(formatted).toContain('MRR Change: -$500.00');
    });

    it('should format relationship metrics', () => {
      const metrics: NormalizedMetrics = {
        relationship: {
          dealValue: 10000,
          daysSinceContact: 30,
          sentimentScore: 0.75,
        },
      };

      const formatted = formatMetrics(metrics);

      expect(formatted).toContain('Deal Value: $10000.00');
      expect(formatted).toContain('Days Since Contact: 30');
      expect(formatted).toContain('Sentiment Score: 0.75');
    });

    it('should format behavioral metrics', () => {
      const metrics: NormalizedMetrics = {
        behavioral: {
          engagementScore: 85.5,
          usageFrequency: 42,
          featureCount: 12,
        },
      };

      const formatted = formatMetrics(metrics);

      expect(formatted).toContain('Engagement Score: 85.50');
      expect(formatted).toContain('Usage Frequency: 42');
      expect(formatted).toContain('Features Used: 12');
    });

    it('should handle empty metrics', () => {
      const metrics: NormalizedMetrics = {};

      const formatted = formatMetrics(metrics);

      expect(formatted).toBe('No metrics available');
    });

    it('should handle partial revenue metrics', () => {
      const metrics: NormalizedMetrics = {
        revenue: {
          amount: 1000,
          currency: 'USD',
        },
      };

      const formatted = formatMetrics(metrics);

      expect(formatted).toContain('Amount: $1,000.00');
      expect(formatted).not.toContain('MRR:');
      expect(formatted).not.toContain('MRR Change:');
    });
  });
});

describe('generateTemplateNarrative', () => {
  describe('revenue.expansion template', () => {
    it('should format expansion with MRR change', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_exp_1',
        category: 'revenue',
        eventType: 'revenue.expansion',
        entity: {
          primaryKey: 'Acme Corp',
          alternateKeys: [],
          platformIds: { stripe: 'cus_123' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'stripe',
          originalEventType: 'customer.subscription.updated',
          originalEventId: 'evt_123',
        },
        impact: {
          severity: 'high',
          metrics: {
            revenue: {
              amount: 1000,
              currency: 'USD',
              mrrChange: 500,
            },
          },
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const narrative = generateTemplateNarrative(signal);

      expect(narrative).toContain('Acme Corp');
      expect(narrative).toContain('upgraded');
      expect(narrative).toContain('$500.00');
      expect(narrative).toContain('upsell');
    });

    it('should format expansion with amount only', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_exp_2',
        category: 'revenue',
        eventType: 'revenue.expansion',
        entity: {
          primaryKey: 'Beta Inc',
          alternateKeys: [],
          platformIds: { stripe: 'cus_456' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'stripe',
          originalEventType: 'customer.subscription.updated',
          originalEventId: 'evt_456',
        },
        impact: {
          severity: 'medium',
          metrics: {
            revenue: {
              amount: 2000,
              currency: 'USD',
            },
          },
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const narrative = generateTemplateNarrative(signal);

      expect(narrative).toContain('Beta Inc');
      expect(narrative).toContain('$2,000.00');
      expect(narrative).toContain('relationship');
    });

    it('should format expansion without metrics', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_exp_3',
        category: 'revenue',
        eventType: 'revenue.expansion',
        entity: {
          primaryKey: 'Gamma LLC',
          alternateKeys: [],
          platformIds: { stripe: 'cus_789' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'stripe',
          originalEventType: 'customer.subscription.updated',
          originalEventId: 'evt_789',
        },
        impact: {
          severity: 'low',
          metrics: {
            revenue: {
              amount: 0,
              currency: 'USD',
            },
          },
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const narrative = generateTemplateNarrative(signal);

      expect(narrative).toContain('Gamma LLC');
      expect(narrative).toContain('upgraded');
    });
  });

  describe('revenue.contraction template', () => {
    it('should format contraction with MRR change', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_con_1',
        category: 'revenue',
        eventType: 'revenue.contraction',
        entity: {
          primaryKey: 'Delta Corp',
          alternateKeys: [],
          platformIds: { stripe: 'cus_delta' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'stripe',
          originalEventType: 'customer.subscription.updated',
          originalEventId: 'evt_delta',
        },
        impact: {
          severity: 'critical',
          metrics: {
            revenue: {
              amount: -500,
              currency: 'USD',
              mrrChange: -500,
            },
          },
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const narrative = generateTemplateNarrative(signal);

      expect(narrative).toContain('Delta Corp');
      expect(narrative).toContain('downgraded');
      expect(narrative).toContain('$500.00');
      expect(narrative).toContain('immediately');
    });

    it('should format contraction without metrics', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_con_2',
        category: 'revenue',
        eventType: 'revenue.contraction',
        entity: {
          primaryKey: 'Epsilon Ltd',
          alternateKeys: [],
          platformIds: { stripe: 'cus_epsilon' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'stripe',
          originalEventType: 'customer.subscription.updated',
          originalEventId: 'evt_epsilon',
        },
        impact: {
          severity: 'high',
          metrics: {},
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const narrative = generateTemplateNarrative(signal);

      expect(narrative).toContain('Epsilon Ltd');
      expect(narrative).toContain('downgraded');
      expect(narrative).toContain('urgently');
    });
  });

  describe('revenue.churn template', () => {
    it('should format churn with MRR', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_churn_1',
        category: 'revenue',
        eventType: 'revenue.churn',
        entity: {
          primaryKey: 'Zeta Inc',
          alternateKeys: [],
          platformIds: { stripe: 'cus_zeta' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'stripe',
          originalEventType: 'customer.subscription.deleted',
          originalEventId: 'evt_zeta',
        },
        impact: {
          severity: 'critical',
          metrics: {
            revenue: {
              amount: 0,
              currency: 'USD',
              mrr: 1500,
            },
          },
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const narrative = generateTemplateNarrative(signal);

      expect(narrative).toContain('Zeta Inc');
      expect(narrative).toContain('cancelled');
      expect(narrative).toContain('$1,500.00');
      expect(narrative).toContain('exit interview');
    });

    it('should format churn without MRR', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_churn_2',
        category: 'revenue',
        eventType: 'revenue.churn',
        entity: {
          primaryKey: 'Eta Corp',
          alternateKeys: [],
          platformIds: { stripe: 'cus_eta' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'stripe',
          originalEventType: 'customer.subscription.deleted',
          originalEventId: 'evt_eta',
        },
        impact: {
          severity: 'critical',
          metrics: {},
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const narrative = generateTemplateNarrative(signal);

      expect(narrative).toContain('Eta Corp');
      expect(narrative).toContain('cancelled');
      expect(narrative).toContain('exit interview');
    });
  });

  describe('revenue.payment_failed template', () => {
    it('should format payment failure with amount', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_pay_1',
        category: 'revenue',
        eventType: 'revenue.payment_failed',
        entity: {
          primaryKey: 'Theta LLC',
          alternateKeys: [],
          platformIds: { stripe: 'cus_theta' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'stripe',
          originalEventType: 'invoice.payment_failed',
          originalEventId: 'evt_theta',
        },
        impact: {
          severity: 'high',
          metrics: {
            revenue: {
              amount: 750,
              currency: 'USD',
            },
          },
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const narrative = generateTemplateNarrative(signal);

      expect(narrative).toContain('Theta LLC');
      expect(narrative).toContain('payment');
      expect(narrative).toContain('$750.00');
      expect(narrative).toContain('failed');
      expect(narrative).toContain('immediately');
    });

    it('should format payment failure without amount', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_pay_2',
        category: 'revenue',
        eventType: 'revenue.payment_failed',
        entity: {
          primaryKey: 'Iota Inc',
          alternateKeys: [],
          platformIds: { stripe: 'cus_iota' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'stripe',
          originalEventType: 'invoice.payment_failed',
          originalEventId: 'evt_iota',
        },
        impact: {
          severity: 'high',
          metrics: {},
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const narrative = generateTemplateNarrative(signal);

      expect(narrative).toContain('Iota Inc');
      expect(narrative).toContain('payment failed');
      expect(narrative).toContain('promptly');
    });
  });

  describe('relationship.engagement_gap template', () => {
    it('should format engagement gap with days', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_gap_1',
        category: 'relationship',
        eventType: 'relationship.engagement_gap',
        entity: {
          primaryKey: 'Kappa Corp',
          alternateKeys: [],
          platformIds: { hubspot: 'contact_kappa' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'hubspot',
          originalEventType: 'contact.updated',
          originalEventId: 'evt_kappa',
        },
        impact: {
          severity: 'medium',
          metrics: {
            relationship: {
              daysSinceContact: 60,
            },
          },
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const narrative = generateTemplateNarrative(signal);

      expect(narrative).toContain('Kappa Corp');
      expect(narrative).toContain('60 days');
      expect(narrative).toContain('check-in');
    });

    it('should format engagement gap without days', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_gap_2',
        category: 'relationship',
        eventType: 'relationship.engagement_gap',
        entity: {
          primaryKey: 'Lambda Ltd',
          alternateKeys: [],
          platformIds: { hubspot: 'contact_lambda' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'hubspot',
          originalEventType: 'contact.updated',
          originalEventId: 'evt_lambda',
        },
        impact: {
          severity: 'medium',
          metrics: {},
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const narrative = generateTemplateNarrative(signal);

      expect(narrative).toContain('Lambda Ltd');
      expect(narrative).toContain('contacted recently');
    });
  });

  describe('relationship.sentiment_negative template', () => {
    it('should format negative sentiment with score', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_sent_1',
        category: 'relationship',
        eventType: 'relationship.sentiment_negative',
        entity: {
          primaryKey: 'Mu Inc',
          alternateKeys: [],
          platformIds: { hubspot: 'contact_mu' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'hubspot',
          originalEventType: 'engagement.created',
          originalEventId: 'evt_mu',
        },
        impact: {
          severity: 'high',
          metrics: {
            relationship: {
              sentimentScore: -0.75,
            },
          },
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const narrative = generateTemplateNarrative(signal);

      expect(narrative).toContain('Mu Inc');
      expect(narrative).toContain('negative sentiment');
      expect(narrative).toContain('-0.75');
      expect(narrative).toContain('immediately');
    });

    it('should format negative sentiment without score', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_sent_2',
        category: 'relationship',
        eventType: 'relationship.sentiment_negative',
        entity: {
          primaryKey: 'Nu Corp',
          alternateKeys: [],
          platformIds: { hubspot: 'contact_nu' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'hubspot',
          originalEventType: 'engagement.created',
          originalEventId: 'evt_nu',
        },
        impact: {
          severity: 'high',
          metrics: {},
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const narrative = generateTemplateNarrative(signal);

      expect(narrative).toContain('Nu Corp');
      expect(narrative).toContain('negative sentiment');
      expect(narrative).toContain('Prioritize');
    });
  });

  describe('behavioral.power_user template', () => {
    it('should format power user with engagement and features', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_power_1',
        category: 'behavioral',
        eventType: 'behavioral.power_user',
        entity: {
          primaryKey: 'user@xi.com',
          alternateKeys: [],
          platformIds: { mixpanel: 'user_xi' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'mixpanel',
          originalEventType: 'engagement_spike',
          originalEventId: 'evt_xi',
        },
        impact: {
          severity: 'low',
          metrics: {
            behavioral: {
              engagementScore: 95,
              featureCount: 12,
            },
          },
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const narrative = generateTemplateNarrative(signal);

      expect(narrative).toContain('user@xi.com');
      expect(narrative).toContain('power user');
      expect(narrative).toContain('95');
      expect(narrative).toContain('12 features');
      expect(narrative).toContain('upsell');
    });

    it('should format power user with engagement only', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_power_2',
        category: 'behavioral',
        eventType: 'behavioral.power_user',
        entity: {
          primaryKey: 'user@omicron.com',
          alternateKeys: [],
          platformIds: { mixpanel: 'user_omicron' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'mixpanel',
          originalEventType: 'engagement_spike',
          originalEventId: 'evt_omicron',
        },
        impact: {
          severity: 'low',
          metrics: {
            behavioral: {
              engagementScore: 88,
            },
          },
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const narrative = generateTemplateNarrative(signal);

      expect(narrative).toContain('user@omicron.com');
      expect(narrative).toContain('power user');
      expect(narrative).toContain('88');
      expect(narrative).toContain('upsell');
    });

    it('should format power user without metrics', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_power_3',
        category: 'behavioral',
        eventType: 'behavioral.power_user',
        entity: {
          primaryKey: 'user@pi.com',
          alternateKeys: [],
          platformIds: { mixpanel: 'user_pi' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'mixpanel',
          originalEventType: 'engagement_spike',
          originalEventId: 'evt_pi',
        },
        impact: {
          severity: 'low',
          metrics: {},
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const narrative = generateTemplateNarrative(signal);

      expect(narrative).toContain('user@pi.com');
      expect(narrative).toContain('power user');
      expect(narrative).toContain('high engagement');
    });
  });

  describe('behavioral.inactivity template', () => {
    it('should format inactivity with engagement score', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_inact_1',
        category: 'behavioral',
        eventType: 'behavioral.inactivity',
        entity: {
          primaryKey: 'user@rho.com',
          alternateKeys: [],
          platformIds: { mixpanel: 'user_rho' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'mixpanel',
          originalEventType: 'inactivity_detected',
          originalEventId: 'evt_rho',
        },
        impact: {
          severity: 'medium',
          metrics: {
            behavioral: {
              engagementScore: 15,
            },
          },
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const narrative = generateTemplateNarrative(signal);

      expect(narrative).toContain('user@rho.com');
      expect(narrative).toContain('low activity');
      expect(narrative).toContain('15');
      expect(narrative).toContain('onboarding');
    });

    it('should format inactivity with usage frequency', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_inact_2',
        category: 'behavioral',
        eventType: 'behavioral.inactivity',
        entity: {
          primaryKey: 'user@sigma.com',
          alternateKeys: [],
          platformIds: { mixpanel: 'user_sigma' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'mixpanel',
          originalEventType: 'inactivity_detected',
          originalEventId: 'evt_sigma',
        },
        impact: {
          severity: 'medium',
          metrics: {
            behavioral: {
              usageFrequency: 2,
            },
          },
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const narrative = generateTemplateNarrative(signal);

      expect(narrative).toContain('user@sigma.com');
      expect(narrative).toContain('low usage frequency');
      expect(narrative).toContain('2 sessions');
      expect(narrative).toContain('check-in');
    });

    it('should format inactivity without metrics', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_inact_3',
        category: 'behavioral',
        eventType: 'behavioral.inactivity',
        entity: {
          primaryKey: 'user@tau.com',
          alternateKeys: [],
          platformIds: { mixpanel: 'user_tau' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'mixpanel',
          originalEventType: 'inactivity_detected',
          originalEventId: 'evt_tau',
        },
        impact: {
          severity: 'medium',
          metrics: {},
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const narrative = generateTemplateNarrative(signal);

      expect(narrative).toContain('user@tau.com');
      expect(narrative).toContain('inactivity');
      expect(narrative).toContain('re-engage');
    });
  });

  describe('generic template', () => {
    it('should format unhandled event types with critical severity', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_generic_1',
        category: 'revenue',
        eventType: 'revenue.payment_recovered' as UniversalEventType,
        entity: {
          primaryKey: 'Upsilon Corp',
          alternateKeys: [],
          platformIds: { stripe: 'cus_upsilon' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'stripe',
          originalEventType: 'invoice.payment_succeeded',
          originalEventId: 'evt_upsilon',
        },
        impact: {
          severity: 'critical',
          metrics: {},
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const narrative = generateTemplateNarrative(signal);

      expect(narrative).toContain('Upsilon Corp');
      expect(narrative).toContain('critical');
      expect(narrative).toContain('Revenue Payment Recovered');
      expect(narrative).toContain('Investigate immediately');
    });

    it('should format unhandled event types with low severity', () => {
      const signal: Universal_Signal = {
        signalId: 'sig_generic_2',
        category: 'relationship',
        eventType: 'relationship.deal_advanced' as UniversalEventType,
        entity: {
          primaryKey: 'Phi Inc',
          alternateKeys: [],
          platformIds: { hubspot: 'contact_phi' },
        },
        occurredAt: Date.now(),
        processedAt: Date.now(),
        source: {
          platform: 'hubspot',
          originalEventType: 'deal.updated',
          originalEventId: 'evt_phi',
        },
        impact: {
          severity: 'low',
          metrics: {},
        },
        platformDetails: {},
        ttl: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      const narrative = generateTemplateNarrative(signal);

      expect(narrative).toContain('Phi Inc');
      expect(narrative).toContain('low');
      expect(narrative).toContain('Relationship Deal Advanced');
      expect(narrative).toContain('Review the details');
    });
  });
});
