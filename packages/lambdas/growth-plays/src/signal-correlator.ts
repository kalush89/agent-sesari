/**
 * Signal Correlator Lambda
 * 
 * Analyzes unified customer profiles to detect at-risk customers by calculating
 * risk scores based on usage decline, renewal proximity, support tickets, and payment issues.
 * 
 * Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 2.1
 */

import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import {
  UnifiedCustomerProfile,
  RiskProfile,
  RiskFactor,
  SignalCorrelatorInput,
  SignalCorrelatorOutput,
} from './types';
import { validateEnvironment } from './utils/validation';
import { queryPendingGrowthPlaysByCustomer, updateGrowthPlayStatus } from './data-access';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

/**
 * Detects usage decline from Mixpanel behavioral data
 * 
 * Calculates the percentage decline in event count over the last 30 days
 * compared to the previous 30 days (days 31-60).
 * 
 * @param mixpanelData - Behavioral signals from Mixpanel
 * @returns Severity score (0-100) based on usage decline percentage
 */
export function detectUsageDecline(mixpanelData: {
  eventCount30Days: number;
  eventCount60Days: number;
}): number {
  const recent = mixpanelData.eventCount30Days;
  const previous = mixpanelData.eventCount60Days - mixpanelData.eventCount30Days;

  // Handle edge case: no previous usage
  if (previous === 0) {
    return recent === 0 ? 100 : 0;
  }

  const declinePercentage = ((previous - recent) / previous) * 100;

  // Map decline percentage to severity score
  if (declinePercentage > 50) return 100;
  if (declinePercentage > 30) return 70;
  if (declinePercentage > 10) return 40;
  return 0;
}

/**
 * Checks proximity to contract renewal date
 * 
 * Calculates severity based on how soon the renewal date is approaching.
 * 
 * @param renewalDate - ISO 8601 renewal date from Stripe
 * @returns Severity score (0-100) based on days until renewal
 */
export function checkRenewalProximity(renewalDate: string): number {
  const now = new Date();
  const renewal = new Date(renewalDate);
  const daysUntilRenewal = Math.ceil((renewal.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  // Map days until renewal to severity score
  if (daysUntilRenewal <= 7) return 100;
  if (daysUntilRenewal <= 14) return 80;
  if (daysUntilRenewal <= 30) return 50;
  return 0;
}

/**
 * Aggregates multiple risk factors into a single risk score
 * 
 * Uses weighted algorithm to combine different risk factors:
 * - Usage decline: 40%
 * - Renewal proximity: 30%
 * - Support tickets: 20%
 * - Payment issues: 10%
 * 
 * @param riskFactors - Array of risk factors with severity and weight
 * @returns Overall risk score (0-100)
 */
export function aggregateRiskFactors(riskFactors: RiskFactor[]): number {
  let totalScore = 0;

  for (const factor of riskFactors) {
    totalScore += factor.severity * factor.weight;
  }

  // Ensure score is bounded between 0 and 100
  return Math.max(0, Math.min(100, Math.round(totalScore)));
}

/**
 * Calculates comprehensive risk score for a customer
 * 
 * Analyzes all signal sources (Mixpanel, HubSpot, Stripe) to identify
 * risk factors and calculate an overall risk score.
 * 
 * @param profile - Unified customer profile with all signal data
 * @returns Risk profile with score and contributing factors
 */
export function calculateRiskScore(profile: UnifiedCustomerProfile): RiskProfile {
  const riskFactors: RiskFactor[] = [];

  // 1. Usage decline analysis (40% weight)
  const usageDeclineSeverity = detectUsageDecline(profile.mixpanelData);
  if (usageDeclineSeverity > 0) {
    riskFactors.push({
      type: 'usage_decline',
      severity: usageDeclineSeverity,
      signalValues: {
        eventCount30Days: profile.mixpanelData.eventCount30Days,
        eventCount60Days: profile.mixpanelData.eventCount60Days,
        lastActiveDate: profile.mixpanelData.lastActiveDate,
      },
      weight: 0.4,
    });
  }

  // 2. Renewal proximity analysis (30% weight)
  const renewalProximitySeverity = checkRenewalProximity(profile.stripeData.renewalDate);
  if (renewalProximitySeverity > 0) {
    riskFactors.push({
      type: 'renewal_approaching',
      severity: renewalProximitySeverity,
      signalValues: {
        renewalDate: profile.stripeData.renewalDate,
        subscriptionStatus: profile.stripeData.subscriptionStatus,
        mrr: profile.stripeData.mrr,
      },
      weight: 0.3,
    });
  }

  // 3. Support ticket analysis (20% weight)
  const supportTicketSeverity = profile.hubspotData.openTickets > 3 ? 80 : 
                                 profile.hubspotData.openTickets > 1 ? 50 : 0;
  if (supportTicketSeverity > 0) {
    riskFactors.push({
      type: 'support_tickets',
      severity: supportTicketSeverity,
      signalValues: {
        openTickets: profile.hubspotData.openTickets,
        lastContactDate: profile.hubspotData.lastContactDate,
      },
      weight: 0.2,
    });
  }

  // 4. Payment issues analysis (10% weight)
  const paymentIssueSeverity = profile.stripeData.subscriptionStatus === 'past_due' ? 100 :
                                profile.stripeData.subscriptionStatus === 'canceled' ? 100 : 0;
  if (paymentIssueSeverity > 0) {
    riskFactors.push({
      type: 'payment_issues',
      severity: paymentIssueSeverity,
      signalValues: {
        subscriptionStatus: profile.stripeData.subscriptionStatus,
        mrr: profile.stripeData.mrr,
      },
      weight: 0.1,
    });
  }

  // Calculate overall risk score
  const riskScore = aggregateRiskFactors(riskFactors);

  return {
    customerId: profile.customerId,
    riskScore,
    riskFactors,
    detectedAt: new Date().toISOString(),
  };
}

/**
 * Stores risk profile in DynamoDB with all signal values for audit trail
 * 
 * @param riskProfile - Risk profile to store
 */
async function storeRiskProfile(riskProfile: RiskProfile): Promise<void> {
  const tableName = process.env.CUSTOMER_RISK_PROFILES_TABLE;
  if (!tableName) {
    throw new Error('CUSTOMER_RISK_PROFILES_TABLE environment variable not set');
  }

  const expiresAt = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60); // 90 days TTL

  try {
    await dynamoClient.send(new PutItemCommand({
      TableName: tableName,
      Item: marshall({
        customerId: riskProfile.customerId,
        detectedAt: riskProfile.detectedAt,
        riskScore: riskProfile.riskScore,
        riskFactors: riskProfile.riskFactors,
        signalValues: riskProfile.riskFactors.reduce((acc, factor) => ({
          ...acc,
          [factor.type]: factor.signalValues,
        }), {}),
        expiresAt,
      }),
    }));
  } catch (error) {
    logError('Failed to store risk profile', error, { customerId: riskProfile.customerId });
    throw new Error(`Failed to store risk profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Main handler for Signal Correlator Lambda
 * 
 * Processes unified customer profiles, calculates risk scores, filters high-risk
 * customers (score > 70), and stores risk profiles in DynamoDB.
 * 
 * @param input - Signal correlator input with customer profiles
 * @returns High-risk customers and analysis summary
 */
export async function handler(input: SignalCorrelatorInput): Promise<SignalCorrelatorOutput> {
  try {
    // Validate environment
    validateEnvironment(['AWS_REGION', 'CUSTOMER_RISK_PROFILES_TABLE', 'GROWTH_PLAYS_TABLE']);

    const highRiskCustomers: RiskProfile[] = [];

    // Process each customer profile
    for (const profile of input.customers) {
      const riskProfile = calculateRiskScore(profile);

      // Store all risk profiles for historical analysis
      await storeRiskProfile(riskProfile);

      // Check for resolution: if risk score dropped below 50, mark pending Growth Plays as resolved
      if (riskProfile.riskScore < 50) {
        try {
          const pendingPlays = await queryPendingGrowthPlaysByCustomer(riskProfile.customerId);
          
          for (const play of pendingPlays) {
            await updateGrowthPlayStatus(
              play.id,
              'resolved',
              {
                action: 'resolved',
                timestamp: new Date().toISOString(),
                metadata: {
                  reason: 'Risk score dropped below 50',
                  previousRiskScore: play.riskScore,
                  currentRiskScore: riskProfile.riskScore,
                },
              }
            );
            console.log(`Resolved Growth Play ${play.id} for customer ${riskProfile.customerId}`);
          }
        } catch (error) {
          console.error(`Failed to resolve Growth Plays for ${riskProfile.customerId}:`, error);
          // Continue processing other customers even if resolution fails
        }
      }

      // Filter high-risk customers (score > 70)
      if (riskProfile.riskScore > 70) {
        highRiskCustomers.push(riskProfile);
      }
    }

    return {
      highRiskCustomers,
      totalAnalyzed: input.customers.length,
    };
  } catch (error) {
    console.error('Signal Correlator execution failed:', error);
    throw error;
  }
}
