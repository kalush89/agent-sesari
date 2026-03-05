/**
 * Narrative Generation Engine
 * 
 * Transforms Universal Signals into human-readable narrative text using Amazon Nova Lite.
 * Implements retry logic and fallback strategies for reliability.
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  type InvokeModelCommandInput,
} from '@aws-sdk/client-bedrock-runtime';
import type { Universal_Signal, NormalizedMetrics } from './types.js';

/**
 * Configuration for narrative generation
 */
interface NarrativeConfig {
  modelId: string;
  maxTokens: number;
  temperature: number;
  maxWords: number;
  retryDelayMs: number;
}

/**
 * Get narrative generation configuration from environment
 */
function getConfig(): NarrativeConfig {
  return {
    modelId: process.env.BEDROCK_MODEL_ID || 'amazon.nova-lite-v1:0',
    maxTokens: 200,
    temperature: 0.7,
    maxWords: parseInt(process.env.NARRATIVE_MAX_WORDS || '150', 10),
    retryDelayMs: 10000, // 10 seconds
  };
}

/**
 * Generate narrative text for a signal using Amazon Nova Lite
 * Implements retry logic: retries once after 10 seconds on failure
 * Falls back to template-based generation if both attempts fail
 * 
 * @param signal - Universal Signal to transform into narrative
 * @returns Narrative text (max 150 words)
 */
export async function generateNarrative(
  signal: Universal_Signal
): Promise<string> {
  const config = getConfig();
  
  try {
    return await invokeBedrockModel(signal, config);
  } catch (error) {
    console.warn('First Bedrock invocation failed, retrying after 10 seconds:', error);
    
    // Wait 10 seconds before retry
    await sleep(config.retryDelayMs);
    
    try {
      return await invokeBedrockModel(signal, config);
    } catch (retryError) {
      console.error('Bedrock retry failed, falling back to template-based narrative:', retryError);
      // Fall back to template-based generation
      return generateTemplateNarrative(signal);
    }
  }
}

/**
 * Invoke Bedrock model to generate narrative
 */
async function invokeBedrockModel(
  signal: Universal_Signal,
  config: NarrativeConfig
): Promise<string> {
  const client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || 'us-east-1',
  });
  
  const prompt = constructPrompt(signal, config.maxWords);
  
  const input: InvokeModelCommandInput = {
    modelId: config.modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: config.maxTokens,
      temperature: config.temperature,
    }),
  };
  
  const command = new InvokeModelCommand(input);
  const response = await client.send(command);
  
  if (!response.body) {
    throw new Error('Bedrock response body is empty');
  }
  
  const result = parseBedrockResponse(response.body);
  return result.trim();
}

/**
 * Parse Bedrock API response
 */
function parseBedrockResponse(body: Uint8Array): string {
  const decoder = new TextDecoder();
  const jsonString = decoder.decode(body);
  const parsed = JSON.parse(jsonString);
  
  // Amazon Nova Lite response format
  if (parsed.content && Array.isArray(parsed.content) && parsed.content.length > 0) {
    return parsed.content[0].text || '';
  }
  
  // Fallback for different response formats
  if (parsed.completion) {
    return parsed.completion;
  }
  
  throw new Error('Unable to parse narrative from Bedrock response');
}

/**
 * Construct prompt for narrative generation
 * Includes entity name, event type, severity, and metrics
 */
export function constructPrompt(signal: Universal_Signal, maxWords: number): string {
  const entityName = signal.entity.primaryKey;
  const eventType = formatEventType(signal.eventType);
  const severity = signal.impact.severity;
  const metrics = formatMetrics(signal.impact.metrics);
  
  return `You are a business analyst writing a daily briefing for a SaaS founder.
Transform this signal into a clear, actionable narrative sentence.

Signal:
- Entity: ${entityName}
- Event: ${eventType}
- Severity: ${severity}
- Metrics: ${metrics}

Write a narrative that includes:
1. The entity name
2. What happened
3. Why it matters
4. What action to take

Keep it under ${maxWords} words. Use plain English, no jargon.
Tone: Professional but conversational, like a trusted advisor.

Example: "Acme Corp's MRR dropped by $500 this month due to a downgrade. This is their first contraction in 6 months. Consider reaching out to understand their needs and explore upsell opportunities."`;
}

/**
 * Format event type for human readability
 */
function formatEventType(eventType: string): string {
  return eventType
    .replace(/\./g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Format metrics for prompt construction
 */
export function formatMetrics(metrics: NormalizedMetrics): string {
  if (metrics.revenue) {
    const parts: string[] = [];
    
    if (metrics.revenue.amount !== undefined) {
      parts.push(`Amount: ${formatCurrency(metrics.revenue.amount, metrics.revenue.currency)}`);
    }
    
    if (metrics.revenue.mrr !== undefined) {
      parts.push(`MRR: ${formatCurrency(metrics.revenue.mrr, metrics.revenue.currency)}`);
    }
    
    if (metrics.revenue.mrrChange !== undefined) {
      const sign = metrics.revenue.mrrChange >= 0 ? '+' : '';
      parts.push(`MRR Change: ${sign}${formatCurrency(metrics.revenue.mrrChange, metrics.revenue.currency)}`);
    }
    
    return parts.join(', ');
  }
  
  if (metrics.relationship) {
    const parts: string[] = [];
    
    if (metrics.relationship.dealValue !== undefined) {
      parts.push(`Deal Value: $${metrics.relationship.dealValue.toFixed(2)}`);
    }
    
    if (metrics.relationship.daysSinceContact !== undefined) {
      parts.push(`Days Since Contact: ${metrics.relationship.daysSinceContact}`);
    }
    
    if (metrics.relationship.sentimentScore !== undefined) {
      parts.push(`Sentiment Score: ${metrics.relationship.sentimentScore.toFixed(2)}`);
    }
    
    return parts.join(', ');
  }
  
  if (metrics.behavioral) {
    const parts: string[] = [];
    
    if (metrics.behavioral.engagementScore !== undefined) {
      parts.push(`Engagement Score: ${metrics.behavioral.engagementScore.toFixed(2)}`);
    }
    
    if (metrics.behavioral.usageFrequency !== undefined) {
      parts.push(`Usage Frequency: ${metrics.behavioral.usageFrequency}`);
    }
    
    if (metrics.behavioral.featureCount !== undefined) {
      parts.push(`Features Used: ${metrics.behavioral.featureCount}`);
    }
    
    return parts.join(', ');
  }
  
  return 'No metrics available';
}

/**
 * Format currency values in USD with two decimal places
 */
function formatCurrency(amount: number, currency: string = 'USD'): string {
  const absAmount = Math.abs(amount);
  const formatted = absAmount.toLocaleString('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  
  return amount < 0 ? `-${formatted}` : formatted;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate template-based narrative when AI fails
 * Provides simple, clear narratives using predefined templates
 * 
 * @param signal - Universal Signal to transform into narrative
 * @returns Template-based narrative text
 */
export function generateTemplateNarrative(signal: Universal_Signal): string {
  const entityName = signal.entity.primaryKey;
  const metrics = signal.impact.metrics;
  
  // Template selection based on event type
  switch (signal.eventType) {
    case 'revenue.expansion':
      return formatExpansionTemplate(entityName, metrics);
    
    case 'revenue.contraction':
      return formatContractionTemplate(entityName, metrics);
    
    case 'revenue.churn':
      return formatChurnTemplate(entityName, metrics);
    
    case 'revenue.payment_failed':
      return formatPaymentFailedTemplate(entityName, metrics);
    
    case 'relationship.engagement_gap':
      return formatEngagementGapTemplate(entityName, metrics);
    
    case 'relationship.sentiment_negative':
      return formatNegativeSentimentTemplate(entityName, metrics);
    
    case 'behavioral.power_user':
      return formatPowerUserTemplate(entityName, metrics);
    
    case 'behavioral.inactivity':
      return formatInactivityTemplate(entityName, metrics);
    
    default:
      return formatGenericTemplate(entityName, signal.eventType, signal.impact.severity);
  }
}

/**
 * Format expansion event template
 */
function formatExpansionTemplate(entityName: string, metrics: NormalizedMetrics): string {
  const mrrChange = metrics.revenue?.mrrChange;
  const amount = metrics.revenue?.amount;
  const currency = metrics.revenue?.currency || 'USD';
  
  if (mrrChange !== undefined) {
    return `${entityName} upgraded their subscription. MRR increased by ${formatCurrency(mrrChange, currency)}. Consider reaching out to thank them and explore additional upsell opportunities.`;
  }
  
  if (amount !== undefined) {
    return `${entityName} upgraded their subscription with a payment of ${formatCurrency(amount, currency)}. Great opportunity to strengthen the relationship and discuss their evolving needs.`;
  }
  
  return `${entityName} upgraded their subscription. Reach out to thank them and explore how you can continue supporting their growth.`;
}

/**
 * Format contraction event template
 */
function formatContractionTemplate(entityName: string, metrics: NormalizedMetrics): string {
  const mrrChange = metrics.revenue?.mrrChange;
  const currency = metrics.revenue?.currency || 'USD';
  
  if (mrrChange !== undefined) {
    const loss = Math.abs(mrrChange);
    return `${entityName} downgraded their subscription. MRR decreased by ${formatCurrency(loss, currency)}. Reach out immediately to understand their concerns and explore retention options.`;
  }
  
  return `${entityName} downgraded their subscription. Contact them urgently to understand what changed and discuss how to better meet their needs.`;
}

/**
 * Format churn event template
 */
function formatChurnTemplate(entityName: string, metrics: NormalizedMetrics): string {
  const mrr = metrics.revenue?.mrr;
  const currency = metrics.revenue?.currency || 'USD';
  
  if (mrr !== undefined) {
    return `${entityName} cancelled their subscription (${formatCurrency(mrr, currency)} MRR lost). Conduct an exit interview to understand why they left and identify improvements for retention.`;
  }
  
  return `${entityName} cancelled their subscription. Reach out to conduct an exit interview and understand what led to their decision to leave.`;
}

/**
 * Format payment failed event template
 */
function formatPaymentFailedTemplate(entityName: string, metrics: NormalizedMetrics): string {
  const amount = metrics.revenue?.amount;
  const currency = metrics.revenue?.currency || 'USD';
  
  if (amount !== undefined) {
    return `${entityName}'s payment of ${formatCurrency(amount, currency)} failed. Contact them immediately to update payment information and prevent involuntary churn.`;
  }
  
  return `${entityName}'s payment failed. Reach out promptly to help them update their payment method and avoid service interruption.`;
}

/**
 * Format engagement gap event template
 */
function formatEngagementGapTemplate(entityName: string, metrics: NormalizedMetrics): string {
  const daysSinceContact = metrics.relationship?.daysSinceContact;
  
  if (daysSinceContact !== undefined) {
    return `No contact with ${entityName} for ${daysSinceContact} days. Schedule a check-in call to ensure they're getting value and address any concerns.`;
  }
  
  return `${entityName} hasn't been contacted recently. Reach out to maintain the relationship and ensure they're satisfied with your service.`;
}

/**
 * Format negative sentiment event template
 */
function formatNegativeSentimentTemplate(entityName: string, metrics: NormalizedMetrics): string {
  const sentimentScore = metrics.relationship?.sentimentScore;
  
  if (sentimentScore !== undefined) {
    return `${entityName} expressed negative sentiment (score: ${sentimentScore.toFixed(2)}). Review recent interactions and reach out to address their concerns immediately.`;
  }
  
  return `${entityName} expressed negative sentiment in recent communications. Prioritize a follow-up to understand and resolve their concerns.`;
}

/**
 * Format power user event template
 */
function formatPowerUserTemplate(entityName: string, metrics: NormalizedMetrics): string {
  const engagementScore = metrics.behavioral?.engagementScore;
  const featureCount = metrics.behavioral?.featureCount;
  
  if (engagementScore !== undefined && featureCount !== undefined) {
    return `${entityName} is a power user with engagement score ${engagementScore.toFixed(0)} across ${featureCount} features. Excellent upsell candidate—reach out to discuss advanced features or higher-tier plans.`;
  }
  
  if (engagementScore !== undefined) {
    return `${entityName} is a power user with engagement score ${engagementScore.toFixed(0)}. Great opportunity to discuss upsell options and gather product feedback.`;
  }
  
  return `${entityName} is a power user showing high engagement. Consider reaching out to discuss advanced features and potential upsell opportunities.`;
}

/**
 * Format inactivity event template
 */
function formatInactivityTemplate(entityName: string, metrics: NormalizedMetrics): string {
  const engagementScore = metrics.behavioral?.engagementScore;
  const usageFrequency = metrics.behavioral?.usageFrequency;
  
  if (engagementScore !== undefined) {
    return `${entityName} shows low activity (engagement score: ${engagementScore.toFixed(0)}). Reach out to understand barriers to adoption and offer onboarding support.`;
  }
  
  if (usageFrequency !== undefined) {
    return `${entityName} has low usage frequency (${usageFrequency} sessions). Schedule a check-in to ensure they understand the product and address any obstacles.`;
  }
  
  return `${entityName} shows signs of inactivity. Proactively reach out to re-engage them and ensure they're getting value from your product.`;
}

/**
 * Format generic template for unhandled event types
 */
function formatGenericTemplate(entityName: string, eventType: string, severity: Severity): string {
  const formattedEvent = formatEventType(eventType);
  const action = severity === 'critical' || severity === 'high' 
    ? 'Investigate immediately and take appropriate action.'
    : 'Review the details and determine next steps.';
  
  return `${entityName} triggered a ${severity} ${formattedEvent} event. ${action}`;
}
