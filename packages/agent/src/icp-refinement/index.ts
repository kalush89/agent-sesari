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
import { generateCorrelationId, logInfo, logWarn, logError } from './logging.js';

/**
 * Publishes CloudWatch metrics for monitoring
 */
async function publishMetrics(
  correlationId: string,
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
      Unit: 'None' as const,
    },
    {
      MetricName: 'CustomersAnalyzed',
      Value: customersAnalyzed,
      Unit: 'Count' as const,
    },
    {
      MetricName: 'AnalysisDurationMs',
      Value: durationMs,
      Unit: 'Milliseconds' as const,
    },
  ];

  if (confidenceScore !== undefined) {
    metrics.push({
      MetricName: 'ICPConfidenceScore',
      Value: confidenceScore,
      Unit: 'None' as const,
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
    logInfo('Published CloudWatch metrics', {
      correlation_id: correlationId,
      phase: 'metrics-publishing',
      metrics_count: metrics.length,
    });
  } catch (error) {
    logError('Failed to publish CloudWatch metrics', {
      correlation_id: correlationId,
      phase: 'metrics-publishing',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Main orchestration function for ICP refinement
 * Coordinates all pipeline steps with error handling and checkpoint support
 */
export async function runICPRefinement(userId: string): Promise<void> {
  const correlationId = generateCorrelationId();
  const startTime = Date.now();
  
  logInfo('Starting ICP refinement analysis', {
    correlation_id: correlationId,
    phase: 'initialization',
    user_id: userId,
  });
  
  try {
    // Validate environment variables
    logInfo('Validating environment configuration', {
      correlation_id: correlationId,
      phase: 'environment-validation',
    });
    
    validateEnvironment();
    const config = createEngineConfig();
    
    // Check for existing checkpoint
    const existingCheckpoint = await loadCheckpoint(userId, config.analysisTableName);
    
    if (existingCheckpoint) {
      logInfo('Found existing checkpoint, resuming analysis', {
        correlation_id: correlationId,
        phase: 'checkpoint-recovery',
        last_processed_index: existingCheckpoint.lastProcessedIndex,
      });
    }
    
    logInfo('Starting data fetching phase', {
      correlation_id: correlationId,
      phase: 'data-fetching',
    });
    
    // Step 1: Fetch data from all sources
    const { hubspotCompanies, mixpanelCohorts, stripeCustomers, completenessMetrics } = 
      await fetchAllCustomerData(userId, 1000);
    
    logInfo('Data fetching completed', {
      correlation_id: correlationId,
      phase: 'data-fetching',
      hubspot_count: hubspotCompanies.length,
      mixpanel_count: mixpanelCohorts.length,
      stripe_count: stripeCustomers.length,
    });
    
    // Save checkpoint if processing > 500 companies
    if (hubspotCompanies.length > 500) {
      logInfo('Large dataset detected, saving checkpoint', {
        correlation_id: correlationId,
        phase: 'checkpoint-save',
        total_companies: hubspotCompanies.length,
      });
      
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
    
    logInfo('Starting data correlation phase', {
      correlation_id: correlationId,
      phase: 'data-correlation',
    });
    
    // Step 2: Correlate data across platforms
    const correlatedCustomers = correlateCustomerData(
      hubspotCompanies,
      mixpanelCohorts,
      stripeCustomers
    );
    
    const correlationMetrics = calculateCorrelationCompleteness(correlatedCustomers);
    logCompletenessWarnings(correlatedCustomers, correlationMetrics);
    
    logInfo('Data correlation completed', {
      correlation_id: correlationId,
      phase: 'data-correlation',
      correlated_count: correlatedCustomers.length,
      mixpanel_completeness: correlationMetrics.mixpanelCompleteness,
      stripe_completeness: correlationMetrics.stripeCompleteness,
    });
    
    logInfo('Starting customer scoring phase', {
      correlation_id: correlationId,
      phase: 'customer-scoring',
    });
    
    // Step 3: Calculate Ideal Customer Scores (parallel processing)
    const scoredCustomers: ScoredCustomer[] = await Promise.all(
      correlatedCustomers.map(customer =>
        Promise.resolve(calculateIdealCustomerScore(customer, correlatedCustomers))
      )
    );
    
    logInfo('Customer scoring completed', {
      correlation_id: correlationId,
      phase: 'customer-scoring',
      scored_count: scoredCustomers.length,
    });
    
    logInfo('Validating sample size', {
      correlation_id: correlationId,
      phase: 'sample-validation',
      total_customers: scoredCustomers.length,
      min_required: config.minSampleSize,
    });
    
    // Step 4: Validate sample size
    validateSampleSize(scoredCustomers, config.minSampleSize);
    
    logInfo('Starting top customer selection', {
      correlation_id: correlationId,
      phase: 'top-selection',
      percentile: config.topPercentile,
    });
    
    // Step 5: Select top 10% of customers
    const topCustomers = selectTopCustomers(scoredCustomers, config.topPercentile);
    
    logInfo('Top customer selection completed', {
      correlation_id: correlationId,
      phase: 'top-selection',
      selected_count: topCustomers.length,
    });
    
    logInfo('Starting PII masking phase', {
      correlation_id: correlationId,
      phase: 'pii-masking',
    });
    
    // Step 6: Mask PII from customer data
    const maskedCustomers = maskCustomerData(topCustomers);
    validateNoPII(maskedCustomers);
    
    logInfo('PII masking completed', {
      correlation_id: correlationId,
      phase: 'pii-masking',
      masked_count: maskedCustomers.length,
    });
    
    logInfo('Starting trait analysis phase', {
      correlation_id: correlationId,
      phase: 'trait-analysis',
    });
    
    // Step 7: Get previous ICP version
    const previousVersion = await getLatestICPVersion(config.knowledgeBaseId);
    const previousICP = null; // TODO: Retrieve previous ICP profile if needed
    
    logInfo('Retrieved previous ICP version', {
      correlation_id: correlationId,
      phase: 'trait-analysis',
      previous_version: previousVersion,
    });
    
    // Step 8: Analyze traits using Nova Lite
    const traitAnalysis = await analyzeTraitsWithFallback(maskedCustomers, previousICP);
    
    logInfo('Trait analysis completed', {
      correlation_id: correlationId,
      phase: 'trait-analysis',
      confidence_score: traitAnalysis.confidenceScore,
      is_degraded: traitAnalysis.confidenceScore < 50,
    });
    
    if (traitAnalysis.confidenceScore < 50) {
      logWarn('Low confidence score detected', {
        correlation_id: correlationId,
        phase: 'trait-analysis',
        confidence_score: traitAnalysis.confidenceScore,
      });
    }
    
    logInfo('Creating new ICP profile', {
      correlation_id: correlationId,
      phase: 'icp-profile-creation',
      new_version: previousVersion + 1,
    });
    
    // Step 9: Create new ICP profile
    const newProfile: ICPProfile = {
      version: previousVersion + 1,
      generatedAt: new Date().toISOString(),
      traits: traitAnalysis.commonTraits,
      reasoning: traitAnalysis.reasoning,
      confidenceScore: traitAnalysis.confidenceScore,
      sampleSize: topCustomers.length,
    };
    
    logInfo('Starting Knowledge Base update', {
      correlation_id: correlationId,
      phase: 'kb-update',
      version: newProfile.version,
    });
    
    // Step 10: Update Knowledge Base
    await updateICPProfile(newProfile, config.knowledgeBaseId);
    
    logInfo('Knowledge Base update completed', {
      correlation_id: correlationId,
      phase: 'kb-update',
    });
    
    logInfo('Starting history storage', {
      correlation_id: correlationId,
      phase: 'history-storage',
    });
    
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
    
    logInfo('History storage completed', {
      correlation_id: correlationId,
      phase: 'history-storage',
    });
    
    // Clear checkpoint on successful completion
    if (hubspotCompanies.length > 500) {
      await clearCheckpoint(userId, config.analysisTableName);
      logInfo('Checkpoint cleared', {
        correlation_id: correlationId,
        phase: 'checkpoint-cleanup',
      });
    }
    
    logInfo('Publishing CloudWatch metrics', {
      correlation_id: correlationId,
      phase: 'metrics-publishing',
    });
    
    // Step 12: Publish CloudWatch metrics
    await publishMetrics(
      correlationId,
      true,
      scoredCustomers.length,
      executionMetrics.durationMs,
      newProfile.confidenceScore
    );
    
    const durationSeconds = (Date.now() - startTime) / 1000;
    logInfo('ICP refinement completed successfully', {
      correlation_id: correlationId,
      phase: 'completion',
      duration_seconds: durationSeconds,
      new_version: newProfile.version,
      confidence_score: newProfile.confidenceScore,
      customers_analyzed: scoredCustomers.length,
    });
    
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logError('ICP refinement failed', {
      correlation_id: correlationId,
      phase: 'error-handling',
      error: error instanceof Error ? error.message : String(error),
      duration_ms: durationMs,
    });
    
    // Publish failure metrics
    await publishMetrics(correlationId, false, 0, durationMs);
    
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
  
  logInfo('Lambda invoked', {
    correlation_id: correlationId,
    phase: 'lambda-invocation',
    invocation_type: invocationType,
  });
  
  // Extract userId from event (required parameter)
  const userId = event.userId || event.detail?.userId;
  
  if (!userId) {
    logError('Missing userId in event payload', {
      correlation_id: correlationId,
      phase: 'lambda-invocation',
    });
    throw new Error('userId is required in event payload');
  }
  
  try {
    await runICPRefinement(userId);
  } catch (error) {
    logError('Lambda execution failed', {
      correlation_id: correlationId,
      phase: 'lambda-execution',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
