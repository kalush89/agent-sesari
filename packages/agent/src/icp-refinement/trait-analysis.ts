/**
 * Trait Analysis Engine - Uses Amazon Nova Lite to identify common traits
 * among top-performing customers
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { MaskedCustomer, ICPProfile, TraitAnalysisOutput, CommonTraits } from './types.js';

/**
 * Constructs the prompt for Nova Lite trait analysis
 * @param topCustomers - Top 10% of customers by Ideal Customer Score
 * @param previousICP - Previous ICP profile for comparison (if exists)
 * @returns Formatted prompt string for Nova Lite
 */
export function constructTraitAnalysisPrompt(
  topCustomers: MaskedCustomer[],
  previousICP: ICPProfile | null
): string {
  const customerData = JSON.stringify(topCustomers, null, 2);
  
  const previousICPSection = previousICP
    ? `\n\nPrevious ICP Profile (Version ${previousICP.version}):\n${JSON.stringify(previousICP.traits, null, 2)}\nReasoning: ${previousICP.reasoning}`
    : '\n\nNo previous ICP profile exists. This is the first analysis.';

  return `You are analyzing the top 10% of high-value B2B SaaS customers to identify common traits for an Ideal Customer Profile (ICP).

Data (${topCustomers.length} customers):
${customerData}
${previousICPSection}

Task:
1. Identify the most common industries (list top 3 if multiple patterns exist)
2. Determine the typical company size range based on employee count
3. Identify geographic concentration (regions where customers cluster)
4. Describe common usage patterns based on engagement and retention buckets

Provide clear reasoning for each trait identified. Include quantitative support where possible (e.g., "60% of top customers are in Finance").

If a previous ICP exists, explain what has changed and why the shift occurred.

Provide a confidence score (0-100) indicating how clear the patterns are. Lower confidence if:
- Customer base is highly diverse with no clear patterns
- Sample size is small
- Data quality is inconsistent

Format your response as valid JSON matching this structure:
{
  "commonTraits": {
    "industries": ["Industry1", "Industry2", "Industry3"],
    "sizeRange": "Description of typical size range",
    "regions": ["Region1", "Region2"],
    "usagePatterns": ["Pattern1", "Pattern2"]
  },
  "reasoning": "Detailed explanation of identified patterns with quantitative support",
  "confidenceScore": 85,
  "changeFromPrevious": "Description of how ICP shifted from previous version, or 'N/A' if first analysis"
}`;
}


/**
 * Delays execution for specified milliseconds
 */
async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Analyzes traits using Amazon Nova Lite
 * @param topCustomers - Top 10% of customers by Ideal Customer Score
 * @param previousICP - Previous ICP profile for comparison (if exists)
 * @returns Trait analysis output with common traits, reasoning, and confidence
 * @throws Error if Nova Lite fails after retry
 */
export async function analyzeTraits(
  topCustomers: MaskedCustomer[],
  previousICP: ICPProfile | null
): Promise<TraitAnalysisOutput> {
  const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
  const modelId = process.env.NOVA_MODEL_ID;

  if (!modelId) {
    throw new Error('NOVA_MODEL_ID environment variable is required');
  }

  const prompt = constructTraitAnalysisPrompt(topCustomers, previousICP);

  const payload = {
    messages: [
      {
        role: 'user',
        content: [{ text: prompt }],
      },
    ],
    inferenceConfig: {
      maxTokens: 2000,
      temperature: 0.3,
    },
  };

  let lastError: Error | null = null;

  // Try twice: initial attempt + one retry
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const command = new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(payload),
      });

      const response = await client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      
      const outputText = responseBody.content[0].text;
      const analysis: TraitAnalysisOutput = JSON.parse(outputText);

      return analysis;
    } catch (error) {
      lastError = error as Error;
      console.error(`Nova Lite invocation failed (attempt ${attempt}/2):`, error);

      if (attempt === 1) {
        await delay(5000);
      }
    }
  }

  throw new Error(`Nova Lite analysis failed after retry: ${lastError?.message}`);
}

/**
 * Calculates the mode (most frequent value) from an array
 */
function calculateMode(values: string[]): string {
  const frequency = new Map<string, number>();
  
  for (const value of values) {
    frequency.set(value, (frequency.get(value) || 0) + 1);
  }
  
  let maxCount = 0;
  let mode = values[0] || 'Unknown';
  
  for (const [value, count] of frequency.entries()) {
    if (count > maxCount) {
      maxCount = count;
      mode = value;
    }
  }
  
  return mode;
}

/**
 * Calculates the median value from an array of numbers
 */
function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  
  return sorted[mid];
}

/**
 * Fallback heuristic analysis when Nova Lite fails
 * @param topCustomers - Top 10% of customers by Ideal Customer Score
 * @returns Basic trait analysis using statistical methods
 */
export function fallbackTraitAnalysis(topCustomers: MaskedCustomer[]): TraitAnalysisOutput {
  console.warn('Using fallback heuristic analysis - Nova Lite unavailable');
  
  // Extract industries and calculate mode
  const industries = topCustomers.map(c => c.industry).filter(Boolean);
  const topIndustry = calculateMode(industries);
  
  // Extract regions and calculate mode
  const regions = topCustomers.map(c => c.region).filter(Boolean);
  const topRegion = calculateMode(regions);
  
  // Calculate median employee count for size range
  const employeeCounts = topCustomers.map(c => c.employeeCount).filter(n => n > 0);
  const medianSize = calculateMedian(employeeCounts);
  
  let sizeRange = 'Unknown';
  if (medianSize > 0) {
    if (medianSize <= 10) sizeRange = '1-10 employees';
    else if (medianSize <= 50) sizeRange = '11-50 employees';
    else if (medianSize <= 200) sizeRange = '51-200 employees';
    else sizeRange = '200+ employees';
  }
  
  // Analyze usage patterns from buckets
  const highEngagement = topCustomers.filter(c => c.engagementBucket === 'High').length;
  const highRetention = topCustomers.filter(c => c.retentionBucket === 'High').length;
  
  const usagePatterns: string[] = [];
  if (highEngagement / topCustomers.length > 0.5) {
    usagePatterns.push('High product engagement');
  }
  if (highRetention / topCustomers.length > 0.5) {
    usagePatterns.push('Strong retention');
  }
  
  return {
    commonTraits: {
      industries: [topIndustry],
      sizeRange,
      regions: [topRegion],
      usagePatterns: usagePatterns.length > 0 ? usagePatterns : ['Varied usage patterns'],
    },
    reasoning: `Fallback heuristic analysis based on ${topCustomers.length} customers. Most common industry: ${topIndustry}. Most common region: ${topRegion}. Median company size: ${medianSize} employees. Note: This analysis is degraded due to LLM unavailability and uses basic statistical methods.`,
    confidenceScore: 40, // Low confidence for heuristic analysis
    changeFromPrevious: 'Unable to compare - degraded analysis mode',
  };
}

/**
 * Checks if confidence score is low and logs warning
 * @param analysis - Trait analysis output
 * @returns True if confidence is low (< 50)
 */
export function isLowConfidence(analysis: TraitAnalysisOutput): boolean {
  const threshold = 50;
  const isLow = analysis.confidenceScore < threshold;
  
  if (isLow) {
    console.warn(
      `Low confidence score detected: ${analysis.confidenceScore}. ` +
      `Analysis may be uncertain due to diverse customer base or small sample size.`
    );
  }
  
  return isLow;
}

/**
 * Analyzes traits with fallback handling
 * @param topCustomers - Top 10% of customers by Ideal Customer Score
 * @param previousICP - Previous ICP profile for comparison (if exists)
 * @returns Trait analysis output, using fallback if Nova Lite fails
 */
export async function analyzeTraitsWithFallback(
  topCustomers: MaskedCustomer[],
  previousICP: ICPProfile | null
): Promise<TraitAnalysisOutput> {
  try {
    const analysis = await analyzeTraits(topCustomers, previousICP);
    
    // Check confidence and log warning if low
    isLowConfidence(analysis);
    
    return analysis;
  } catch (error) {
    console.error('Nova Lite analysis failed, using fallback:', error);
    return fallbackTraitAnalysis(topCustomers);
  }
}
