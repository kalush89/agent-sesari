/**
 * Context retrieval from Bedrock Knowledge Bases
 */

import { RetrieveCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { bedrockKBClient, config } from './clients';
import { CompanyContext } from './types';

/**
 * Creates an empty context object for graceful degradation
 * @returns Empty CompanyContext with all fields as empty arrays/strings
 */
export function createEmptyContext(): CompanyContext {
  return {
    recentMetrics: [],
    historicalGoals: [],
    companyProfile: '',
  };
}

/**
 * Retrieves relevant historical company context from Bedrock Knowledge Bases
 * with graceful degradation on failure
 * 
 * This function wraps the raw retrieval logic and ensures the system continues
 * to operate even if context retrieval fails, returning empty context instead
 * 
 * @param goal - User's goal string used as query for semantic search
 * @returns CompanyContext object (empty context if retrieval fails)
 */
export async function retrieveCompanyContext(
  goal: string
): Promise<CompanyContext> {
  try {
    return await retrieveCompanyContextRaw(goal);
  } catch (error) {
    console.error('Context retrieval failed, continuing with empty context:', error);
    return createEmptyContext();
  }
}

/**
 * Raw retrieval function that queries Bedrock Knowledge Bases
 * Uses the goal string as a semantic search query to find relevant documents
 * 
 * @param goal - User's goal string used as query for semantic search
 * @returns CompanyContext object containing relevant historical data
 * @throws Error if retrieval fails
 */
async function retrieveCompanyContextRaw(
  goal: string
): Promise<CompanyContext> {
  const command = new RetrieveCommand({
    knowledgeBaseId: config.knowledgeBaseId,
    retrievalQuery: {
      text: goal,
    },
    retrievalConfiguration: {
      vectorSearchConfiguration: {
        numberOfResults: 5, // Limit to top 5 documents for cost optimization
      },
    },
  });

  const response = await bedrockKBClient.send(command);

  // Parse retrieval results into CompanyContext structure
  const context = parseRetrievalResults(response.retrievalResults || []);
  
  console.log('Context retrieval succeeded:', {
    documentCount: response.retrievalResults?.length || 0,
    hasMetrics: context.recentMetrics.length > 0,
    hasGoals: context.historicalGoals.length > 0,
    hasProfile: context.companyProfile.length > 0,
  });

  return context;
}

/**
 * Parses Bedrock Knowledge Base retrieval results into CompanyContext structure
 * Categorizes documents based on content patterns
 * 
 * @param results - Raw retrieval results from Bedrock KB
 * @returns Parsed CompanyContext object
 */
function parseRetrievalResults(results: any[]): CompanyContext {
  const context: CompanyContext = {
    recentMetrics: [],
    historicalGoals: [],
    companyProfile: '',
  };

  for (const result of results) {
    const content = result.content?.text || '';
    
    if (!content) continue;

    // Categorize based on content patterns
    if (isMetricContent(content)) {
      context.recentMetrics.push(content);
    } else if (isGoalContent(content)) {
      context.historicalGoals.push(content);
    } else if (isProfileContent(content)) {
      // Use first profile document found
      if (!context.companyProfile) {
        context.companyProfile = content;
      }
    }
  }

  return context;
}

/**
 * Determines if content contains metric data
 */
function isMetricContent(content: string): boolean {
  const metricKeywords = [
    'revenue',
    'mrr',
    'arr',
    'churn',
    'conversion',
    'metric',
    'kpi',
    'stripe',
    'hubspot',
    'mixpanel',
  ];
  
  const lowerContent = content.toLowerCase();
  return metricKeywords.some(keyword => lowerContent.includes(keyword));
}

/**
 * Determines if content contains historical goal data
 */
function isGoalContent(content: string): boolean {
  const goalKeywords = [
    'goal',
    'objective',
    'target',
    'initiative',
    'okr',
    'quarter',
    'q1',
    'q2',
    'q3',
    'q4',
  ];
  
  const lowerContent = content.toLowerCase();
  return goalKeywords.some(keyword => lowerContent.includes(keyword));
}

/**
 * Determines if content contains company profile data
 */
function isProfileContent(content: string): boolean {
  const profileKeywords = [
    'company',
    'profile',
    'industry',
    'stage',
    'founded',
    'team size',
    'employees',
    'b2b',
    'saas',
  ];
  
  const lowerContent = content.toLowerCase();
  return profileKeywords.some(keyword => lowerContent.includes(keyword));
}
