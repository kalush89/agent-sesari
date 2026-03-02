/**
 * Main Lambda handler for Dynamic ICP Refinement Engine
 * Orchestrates the complete ICP analysis pipeline
 */

import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { createEngineConfig, validateEnvironment } from './config.js';
import { fetchAllCustomerData } from './data-fetching.js';
import { correlateCustomerData, calculateCorrelationCompleteness, logCompletenessWarnings } from './correlation.js';
import { calculateIdealCustomerScore } from './scoring.js';
import { selectTopCustomers, validateSampleSize } from './selection.js';
import { maskCustomerData, validateNoPII } from './masking.js';
import { analyzeTraitsWithFallback } from './trait-analysis.js';
import { getLatestICPVersion, updateICPProfile } from './kb-updater.js';
import { storeAnalysisRecord, buildAnalysisRecord, calculateScoreDistribution } from './history-store.js';
import { saveCheckpoint, loadCheckpoint, clearCheckpoint } from './checkpoint.js';
import { ICPProfile, ScoredCustomer } from './types.js';

/**
 * Generates a correlation ID for tracing
 */
function generateCorrelationId(): string {
  return `icp-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Publishes CloudWatch metrics for monitoring
 */
async function publishMetrics(
  success: boolean,
  customersAnalyzed: number,
  durationMs: number,
  confidenceScore?: number
): Promise<void> {
  const client = new CloudWatchClient({ region: process.env.AWS_REGION });
  
  const metrics = [
    {
      MetricName: 'ICPAnalysisSuccess',
      Value: success ? 1 : 0,
      Unit: 'None',
    },
    {
      MetricName: 'CustomersAnalyzed',
      Value: customersAnalyzed,
      Unit: 'Count',
    },
    {
      MetricName: 'AnalysisDurationMs',
      Value: durationMs,
      Unit: 'Milliseconds',
    },
  ];

  if (confidenceScore !== undefined) {
    metrics.push({
      MetricName: 'ICPConfidenceScore',
      Value: confidenceScore,
      Unit: 'None',
    });
  }

  try {
    await client.send(
      new PutMetricDataCommand({
        Namespace: 'Sesari/ICPRefinement',
        MetricData: metrics.map(m => ({
          ...m,
          Timestamp: new Date(),
        })),
      })
    );
    console.log('[Metrics] Published CloudWatch metrics');
  } catch (error) {
    console.error('[Metrics] Failed to publish metrics:', error);
  }
}

/**
 * Main orchestration function for ICP refinement
 * Coordinates all pipeline steps with error handling and checkpoint support
 */
export async function runICPRefinement(userId: string): Promise<void> {
  const correlationId = generateCorrelationId();
  const startTime = Date.now();
  
  console.log(`[${correlationId}] Starting ICP refinement analysis`);
  console.log(`[${correlationId}] Phase: Environment validation`);
  
  try {
    // Validate environment variables
    validateEnvironment();
    const config = createEngineConfig();
    
    // Check for existing checkpoint
    const existingCheckpoint = await loadCheckpoint(userId, config.analysisTableName);
    
    console.log(`[${correlationId}] Phase: Data fetching`);
    
    // Step 1: Fetch data from all sources
    const { hubspotCompanies, mixpanelCohorts, stripeCustomers, completenessMetrics } = 
      await fetchAllCustomerData(userId, 1000); // Fetch up to 1000 companies
    
    // Save checkpoint if processing > 500 companies
    if (hubspotCompanies.length > 500) {
      await saveCheckpoint(
        {
          userId,
          timestamp: new Date().toISOString(),
          lastProcessedIndex: 0,
          totalCompanies: hubspotCompanies.length,
          status: 'in_progress',
        },
        config.analysisTableName
      );
    }
    
    console.log(`[${correlationId}] Phase: Data correlation`);
    
    // Step 2: Correlate data across platforms
    const correlatedCustomers = correlateCustomerData(
      hubspotCompanies,
      mixpanelCohorts,
      stripeCustomers
    );
    
    const correlationMetrics = calculateCorrelationCompleteness(correlatedCustomers);
    logCompletenessWarnings(correlatedCustomers, correlationMetrics);
    
    console.log(`[${correlationId}] Phase: Customer scoring`);
    
    // Step 3: Calculate Ideal Customer Scores (parallel processing)
    const scoredCustomers: ScoredCustomer[] = await Promise.all(
      correlatedCustomers.map(customer =>
        Promise.resolve(calculateIdealCustomerScore(customer, correlatedCustomers))
      )
    );
    
    console.log(`[${correlationId}] Phase: Sample size validation`);
    
    // Step 4: Validate sample size
    validateSampleSize(scoredCustomers, config.minSampleSize);
    
    console.log(`[${correlationId}] Phase: Top customer selection`);
    
    // Step 5: Select top 10% of customers
    const topCustomers = selectTopCustomers(scoredCustomers, config.topPercentile);
    console.log(`[${correlationId}] Selected ${topCustomers.length} top customers for analysis`);
    
    console.log(`[${correlationId}] Phase: PII masking`);
    
    // Step 6: Mask PII from customer data
    const maskedCustomers = maskCustomerData(topCustomers);
    validateNoPII(maskedCustomers);
    
    console.log(`[${correlationId}] Phase: Trait analysis`);
    
    // Step 7: Get previous ICP version
    const previousVersion = await getLatestICPVersion(config.knowledgeBaseId);
    const previousICP = null; // TODO: Retrieve previous ICP profile if needed
    
    // Step 8: Analyze traits using Nova Lite
    const traitAnalysis = await analyzeTraitsWithFallback(maskedCustomers, previousICP);
    
    console.log(`[${correlationId}] Phase: ICP profile creation`);
    
    // Step 9: Create new ICP profile
    const newProfile: ICPProfile = {
      version: previousVersion + 1,
      generatedAt: new Date().toISOString(),
      traits: traitAnalysis.commonTraits,
      reasoning: traitAnalysis.reasoning,
      confidenceScore: traitAnalysis.confidenceScore,
      sampleSize: topCustomers.length,
    };
    
    console.log(`[${correlationId}] Phase: Knowledge Base update`);
    
    // Step 10: Update Knowledge Base
    await updateICPProfile(newProfile, config.knowledgeBaseId);
    
    console.log(`[${correlationId}] Phase: History storage`);
    
    // Step 11: Store analysis history
    const scoreDistribution = calculateScoreDistribution(scoredCustomers);
    const executionMetrics = {
      durationMs: Date.now() - startTime,
      customersAnalyzed: scoredCustomers.length,
      apiCallCount: 3, // HubSpot, Mixpanel, Stripe
    };
    
    const analysisRecord = buildAnalysisRecord(
      newProfile,
      topCustomers.map(c => c.companyId),
      scoreDistribution,
      executionMetrics
    );
    
    await storeAnalysisRecord(analysisRecord, config.analysisTableName);
    
    // Clear checkpoint on successful completion
    if (hubspotCompanies.length > 500) {
      await clearCheckpoint(userId, config.analysisTableName);
    }
    
    console.log(`[${correlationId}] Phase: Metrics publishing`);
    
    // Step 12: Publish CloudWatch metrics
    await publishMetrics(
      true,
      scoredCustomers.length,
      executionMetrics.durationMs,
      newProfile.confidenceScore
    );
    
    const durationSeconds = (Date.now() - startTime) / 1000;
    console.log(`[${correlationId}] ICP refinement completed successfully in ${durationSeconds.toFixed(2)}s`);
    console.log(`[${correlationId}] New ICP version: ${newProfile.version}`);
    console.log(`[${correlationId}] Confidence score: ${newProfile.confidenceScore}`);
    
  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error(`[${correlationId}] ERROR: ICP refinement failed:`, error);
    
    // Publish failure metrics
    await publishMetrics(false, 0, durationMs);
    
    throw error;
  }
}

/**
 * Lambda handler function
 * Entry point for EventBridge scheduled invocations and manual triggers
 */
export async function handler(event: any): Promise<void> {
  const correlationId = generateCorrelationId();
  
  // Determine invocation type
  const isScheduled = event.source === 'aws.events';
  const invocationType = isScheduled ? 'scheduled' : 'manual';
  
  console.log(`[${correlationId}] Lambda invoked: ${invocationType}`);
  console.log(`[${correlationId}] Event:`, JSON.stringify(event, null, 2));
  
  // Extract userId from event (required parameter)
  const userId = event.userId || event.detail?.userId;
  
  if (!userId) {
    throw new Error('userId is required in event payload');
  }
  
  try {
    await runICPRefinement(userId);
  } catch (error) {
    console.error(`[${correlationId}] Lambda execution failed:`, error);
    throw error;
  }
}
