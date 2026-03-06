/**
 * Draft Generator
 * 
 * Generates personalized communication drafts using Amazon Bedrock Nova Lite.
 * Creates Growth Plays with explainability (Thought Trace) for user review.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { validateEnvironment } from './utils/validation.js';
import { storeGrowthPlay, queryPendingGrowthPlaysByCustomer } from './data-access.js';
import type {
  RiskProfile,
  EntitySignalProfile,
  GrowthPlay,
  CommunicationType,
  ThoughtTrace,
} from './types.js';

const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

/**
 * Builds a Bedrock prompt with customer context and risk factors
 * 
 * @param customerName - Customer's name
 * @param companyName - Company name
 * @param riskScore - Risk score (0-100)
 * @param riskFactors - Array of risk factors with details
 * @param communicationType - Email or Slack
 * @returns Formatted prompt string
 */
export function buildBedrockPrompt(
  customerName: string,
  companyName: string,
  riskScore: number,
  riskFactors: string,
  communicationType: CommunicationType
): string {
  return `You are a B2B SaaS customer success expert. Generate a professional, empathetic communication for an at-risk customer.

Customer Context:
- Name: ${customerName}
- Company: ${companyName}
- Risk Score: ${riskScore}/100

Risk Signals:
${riskFactors}

Task: Write a ${communicationType} that:
1. Acknowledges their current usage pattern
2. Offers specific help or resources
3. Includes a clear call-to-action
4. Maintains a supportive, non-pushy tone

Constraints:
- Email: Maximum 200 words
- Slack: Maximum 100 words
- Use professional B2B language
- Focus on value, not sales

Output format: Plain text only, no markdown.`;
}

/**
 * Invokes Bedrock Nova Lite to generate draft content
 * 
 * @param prompt - Formatted prompt string
 * @returns Generated draft content
 */
export async function invokeBedrockNovaLite(prompt: string): Promise<string> {
  validateEnvironment(['AWS_REGION']);

  try {
    const response = await bedrockClient.send(
      new InvokeModelCommand({
        modelId: 'amazon.nova-lite-v1:0',
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          prompt,
          max_tokens: 500,
          temperature: 0.7,
        }),
      })
    );

    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    return responseBody.completion || responseBody.text || '';
  } catch (error) {
    console.error('Bedrock invocation failed:', error);
    
    // Retry once with reduced prompt if token limit exceeded
    if ((error as Error).message.includes('token')) {
      console.log('Retrying with reduced prompt size');
      const reducedPrompt = prompt.substring(0, Math.floor(prompt.length * 0.7));
      return invokeBedrockNovaLite(reducedPrompt);
    }
    
    throw new Error(`Failed to generate draft: ${(error as Error).message}`);
  }
}

/**
 * Formats draft content and validates word count
 * 
 * @param draftContent - Raw draft content from Bedrock
 * @param communicationType - Email or Slack
 * @returns Formatted draft content
 */
export function formatDraft(
  draftContent: string,
  communicationType: CommunicationType
): string {
  const wordLimit = communicationType === 'email' ? 200 : 100;
  const words = draftContent.trim().split(/\s+/);
  
  if (words.length > wordLimit) {
    return words.slice(0, wordLimit).join(' ') + '...';
  }
  
  return draftContent.trim();
}

/**
 * Creates a Thought Trace explaining the risk factors
 * 
 * @param riskProfile - Risk profile with factors
 * @returns Thought trace object
 */
export function createThoughtTrace(riskProfile: RiskProfile): ThoughtTrace {
  const signalSources = new Set<string>();
  const sourceSignalIds: string[] = [];
  
  // Extract signal sources and IDs from risk factors
  riskProfile.riskFactors.forEach((factor) => {
    if (factor.signalValues.source) {
      signalSources.add(factor.signalValues.source);
    }
    if (factor.signalValues.sourceSignalIds) {
      sourceSignalIds.push(...factor.signalValues.sourceSignalIds);
    }
  });
  
  // Generate natural language reasoning
  const reasoning = generateReasoning(riskProfile);
  
  return {
    riskFactors: riskProfile.riskFactors,
    reasoning,
    signalSources: Array.from(signalSources),
    sourceSignalIds,
  };
}

/**
 * Generates natural language reasoning for risk factors
 * 
 * @param riskProfile - Risk profile
 * @returns Natural language explanation
 */
function generateReasoning(riskProfile: RiskProfile): string {
  const factors = riskProfile.riskFactors
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 3);
  
  const reasons = factors.map((factor) => {
    switch (factor.type) {
      case 'usage_decline':
        return `Usage has declined significantly`;
      case 'renewal_approaching':
        return `Contract renewal is approaching`;
      case 'support_tickets':
        return `Multiple support tickets indicate friction`;
      case 'payment_issues':
        return `Payment issues detected`;
      default:
        return `Risk factor: ${factor.type}`;
    }
  });
  
  return `This customer was flagged because: ${reasons.join(', ')}.`;
}

/**
 * Generates a draft for a high-risk customer
 * 
 * @param riskProfile - Customer risk profile
 * @param entityProfile - Entity signal profile
 * @param communicationType - Email or Slack
 * @returns Generated Growth Play
 */
export async function generateDraft(
  riskProfile: RiskProfile,
  entityProfile: EntitySignalProfile,
  communicationType: CommunicationType
): Promise<GrowthPlay> {
  // Extract customer details from entity profile
  const customerName = entityProfile.email.split('@')[0] || 'Customer';
  const companyName = entityProfile.email.split('@')[1] || 'Company';
  
  // Format risk factors for prompt
  const riskFactorsText = riskProfile.riskFactors
    .map((f) => `- ${f.type}: Severity ${f.severity}/100`)
    .join('\n');
  
  // Build prompt
  const prompt = buildBedrockPrompt(
    customerName,
    companyName,
    riskProfile.riskScore,
    riskFactorsText,
    communicationType
  );
  
  // Generate draft content
  const rawDraft = await invokeBedrockNovaLite(prompt);
  const draftContent = formatDraft(rawDraft, communicationType);
  
  // Create thought trace
  const thoughtTrace = createThoughtTrace(riskProfile);
  
  // Generate subject line for email
  const subject = communicationType === 'email'
    ? `Quick check-in about ${companyName}`
    : undefined;
  
  // Create Growth Play object
  const growthPlay: GrowthPlay = {
    id: `gp-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    customerId: riskProfile.customerId,
    customerName,
    companyName,
    riskScore: riskProfile.riskScore,
    communicationType,
    subject,
    draftContent,
    thoughtTrace,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    auditTrail: [
      {
        action: 'created',
        timestamp: new Date().toISOString(),
        metadata: {
          riskScore: riskProfile.riskScore,
          communicationType,
        },
      },
    ],
  };
  
  return growthPlay;
}

/**
 * Lambda handler for Draft Generator
 * 
 * @param event - High-risk customer profiles from Signal Correlator
 * @returns Array of created Growth Plays
 */
export async function handler(event: {
  highRiskCustomers: RiskProfile[];
  entityProfiles: EntitySignalProfile[];
}): Promise<{ growthPlays: GrowthPlay[] }> {
  validateEnvironment(['AWS_REGION', 'GROWTH_PLAYS_TABLE']);
  
  const { highRiskCustomers, entityProfiles } = event;
  const growthPlays: GrowthPlay[] = [];
  
  for (const riskProfile of highRiskCustomers) {
    // Find matching entity profile
    const entityProfile = entityProfiles.find(
      (p) => p.entityId === riskProfile.customerId
    );
    
    if (!entityProfile) {
      console.warn(`No entity profile found for customer ${riskProfile.customerId}`);
      continue;
    }
    
    // Check for existing pending Growth Plays (deduplication)
    const existingPlays = await queryPendingGrowthPlaysByCustomer(riskProfile.customerId);
    
    // Generate drafts for both email and Slack
    for (const communicationType of ['email', 'slack'] as CommunicationType[]) {
      try {
        // Check if there's an existing pending Growth Play for this communication type
        const existingPlay = existingPlays.find(
          (p) => p.communicationType === communicationType
        );
        
        if (existingPlay) {
          // If new risk score is higher, update the existing Growth Play
          if (riskProfile.riskScore > existingPlay.riskScore) {
            console.log(
              `Updating existing Growth Play ${existingPlay.id} with higher risk score`
            );
            
            const updatedPlay = await generateDraft(
              riskProfile,
              entityProfile,
              communicationType
            );
            
            // Update the existing Growth Play with new content
            updatedPlay.id = existingPlay.id;
            updatedPlay.auditTrail = [
              ...existingPlay.auditTrail,
              {
                action: 'edited',
                timestamp: new Date().toISOString(),
                metadata: {
                  reason: 'Higher risk score detected',
                  oldRiskScore: existingPlay.riskScore,
                  newRiskScore: riskProfile.riskScore,
                },
              },
            ];
            
            await storeGrowthPlay(updatedPlay);
            growthPlays.push(updatedPlay);
          } else {
            console.log(
              `Skipping duplicate Growth Play for ${riskProfile.customerId} (${communicationType})`
            );
          }
        } else {
          // No existing Growth Play, create a new one
          const growthPlay = await generateDraft(
            riskProfile,
            entityProfile,
            communicationType
          );
          
          // Store in DynamoDB
          await storeGrowthPlay(growthPlay);
          growthPlays.push(growthPlay);
        }
      } catch (error) {
        console.error(
          `Failed to generate ${communicationType} draft for ${riskProfile.customerId}:`,
          error
        );
        // Continue with other drafts even if one fails
      }
    }
  }
  
  return { growthPlays };
}
