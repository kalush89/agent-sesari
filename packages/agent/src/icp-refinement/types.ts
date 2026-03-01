/**
 * Core type definitions for the Dynamic ICP Refinement Engine
 */

/**
 * HubSpot company record with LTV and firmographic data
 */
export interface HubSpotCompany {
  companyId: string;
  name: string;
  industry: string;
  employeeCount: number;
  region: string;
  totalRevenue: number;
  createdAt: string;
  properties: Record<string, any>;
}

/**
 * Mixpanel cohort data with engagement and retention metrics
 */
export interface MixpanelCohort {
  companyId: string;
  ahaEventCount: number;
  retentionRate: number;
  lastActiveDate: string;
  engagementScore: number;
}

/**
 * Stripe customer data with subscription and churn signals
 */
export interface StripeCustomer {
  customerId: string;
  companyId: string;
  hasChurnSignal: boolean;
  mrr: number;
  subscriptionStatus: string;
}

/**
 * Correlated customer data from all sources
 */
export interface CorrelatedCustomer {
  companyId: string;
  hubspot: HubSpotCompany;
  mixpanel: MixpanelCohort | null;
  stripe: StripeCustomer | null;
}

/**
 * Score breakdown for transparency
 */
export interface ScoreBreakdown {
  ltvScore: number;
  engagementScore: number;
  retentionScore: number;
}

/**
 * Customer with calculated Ideal Customer Score
 */
export interface ScoredCustomer extends CorrelatedCustomer {
  idealCustomerScore: number;
  scoreBreakdown: ScoreBreakdown;
}

/**
 * Privacy-masked customer data for LLM analysis
 */
export interface MaskedCustomer {
  companyId: string;
  industry: string;
  employeeCount: number;
  region: string;
  ltvBucket: string;
  engagementBucket: string;
  retentionBucket: string;
  idealCustomerScore: number;
}

/**
 * Common traits identified in top customers
 */
export interface CommonTraits {
  industries: string[];
  sizeRange: string;
  regions: string[];
  usagePatterns: string[];
}

/**
 * ICP profile with versioning and metadata
 */
export interface ICPProfile {
  version: number;
  generatedAt: string;
  traits: CommonTraits;
  reasoning: string;
  confidenceScore: number;
  sampleSize: number;
}

/**
 * Score distribution statistics
 */
export interface ScoreDistribution {
  min: number;
  max: number;
  mean: number;
  p90: number;
}

/**
 * Execution metrics for monitoring
 */
export interface ExecutionMetrics {
  durationMs: number;
  customersAnalyzed: number;
  apiCallCount: number;
}

/**
 * Complete analysis record for DynamoDB storage
 */
export interface ICPAnalysisRecord {
  analysisId: string;
  version: number;
  profile: ICPProfile;
  topCustomerIds: string[];
  scoreDistribution: ScoreDistribution;
  executionMetrics: ExecutionMetrics;
}

/**
 * Scoring weights configuration
 */
export interface ScoringWeights {
  ltv: number;
  engagement: number;
  retention: number;
}

/**
 * Engine configuration with defaults
 */
export interface EngineConfig {
  topPercentile: number;
  minSampleSize: number;
  scoringWeights: ScoringWeights;
  knowledgeBaseId: string;
  analysisTableName: string;
}

/**
 * Trait analysis output from Nova Lite
 */
export interface TraitAnalysisOutput {
  commonTraits: CommonTraits;
  reasoning: string;
  confidenceScore: number;
  changeFromPrevious: string;
}

/**
 * Company identifier mapping across platforms
 */
export interface CompanyIdentifier {
  hubspotId: string;
  mixpanelId?: string;
  stripeId?: string;
}
