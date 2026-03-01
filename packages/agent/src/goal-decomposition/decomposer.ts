/**
 * Goal decomposition via Amazon Nova
 */

import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { bedrockRuntimeClient, config } from './clients';
import { CompanyContext, NovaAPIError } from './types';

/**
 * Constructs a prompt for Nova to decompose a goal into SMART objectives
 * Includes company context, user goal, SMART instructions, and strict JSON format
 * 
 * @param goal - User's high-level goal string
 * @param context - Historical company context from Bedrock Knowledge Bases
 * @returns Formatted prompt string for Nova
 */
export function constructDecompositionPrompt(
  goal: string,
  context: CompanyContext
): string {
  // Build context section
  const contextSection = buildContextSection(context);
  
  const prompt = `You are a B2B SaaS growth strategist. Decompose the following goal into exactly 3 SMART objectives.

${contextSection}

USER GOAL:
${goal}

INSTRUCTIONS:
1. Create 3 SMART objectives (Specific, Measurable, Achievable, Relevant, Time-bound)
2. For each objective, identify required Stripe, HubSpot, or Mixpanel signals
3. Provide strategic justification for each objective

OUTPUT FORMAT (strict JSON):
{
  "objectives": [
    {
      "title": "string",
      "description": "string",
      "successThreshold": "string",
      "requiredSignals": ["string"],
      "strategicWhy": "string"
    }
  ]
}`;

  return prompt;
}

/**
 * Builds the context section of the prompt
 * Includes all three context components when available
 * 
 * @param context - Company context object
 * @returns Formatted context section string
 */
function buildContextSection(context: CompanyContext): string {
  const sections: string[] = [];
  
  // Add company profile if available
  if (context.companyProfile && context.companyProfile.trim().length > 0) {
    sections.push(`COMPANY PROFILE:\n${context.companyProfile}`);
  }
  
  // Add recent metrics if available
  if (context.recentMetrics.length > 0) {
    sections.push(`RECENT METRICS:\n${context.recentMetrics.join('\n')}`);
  }
  
  // Add historical goals if available
  if (context.historicalGoals.length > 0) {
    sections.push(`HISTORICAL GOALS:\n${context.historicalGoals.join('\n')}`);
  }
  
  // If no context available, return empty context header
  if (sections.length === 0) {
    return 'COMPANY CONTEXT:\nNo historical context available.';
  }
  
  return `COMPANY CONTEXT:\n${sections.join('\n\n')}`;
}

/**
 * Invokes Amazon Nova to decompose a goal into SMART objectives
 * Handles timeouts and rate limits with appropriate error responses
 * 
 * @param goal - User's high-level goal string
 * @param context - Historical company context
 * @returns Raw JSON string response from Nova
 * @throws NovaAPIError if invocation fails
 */
export async function decomposeGoal(
  goal: string,
  context: CompanyContext
): Promise<string> {
  const prompt = constructDecompositionPrompt(goal, context);
  
  try {
    const command = new InvokeModelCommand({
      modelId: config.novaModelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: [{ text: prompt }],
          },
        ],
        inferenceConfig: {
          maxTokens: 2000,
          temperature: 0.7,
        },
      }),
    });

    console.log('Invoking Nova:', {
      modelId: config.novaModelId,
      promptLength: prompt.length,
    });

    const response = await bedrockRuntimeClient.send(command);
    
    // Parse response body
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const outputText = responseBody.output?.message?.content?.[0]?.text;
    
    if (!outputText) {
      throw new NovaAPIError(
        'Nova returned empty response',
        'Response body missing expected output structure'
      );
    }

    console.log('Nova invocation succeeded:', {
      responseLength: outputText.length,
      stopReason: responseBody.stopReason,
    });

    return outputText;
    
  } catch (error: any) {
    // Handle specific AWS SDK errors
    if (error.name === 'ThrottlingException' || error.name === 'TooManyRequestsException') {
      console.error('Nova rate limit exceeded:', error);
      throw new NovaAPIError(
        'Service temporarily unavailable due to rate limiting',
        error.message
      );
    }
    
    if (error.name === 'TimeoutError' || error.$metadata?.httpStatusCode === 408) {
      console.error('Nova request timeout:', error);
      throw new NovaAPIError(
        'Request timeout while processing goal',
        error.message
      );
    }
    
    // Re-throw if already a NovaAPIError
    if (error instanceof NovaAPIError) {
      throw error;
    }
    
    // Generic error handling
    console.error('Nova invocation failed:', error);
    throw new NovaAPIError(
      'Failed to decompose goal',
      error.message || 'Unknown error'
    );
  }
}
