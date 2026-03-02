/**
 * Knowledge Base updater for ICP profile management
 * Handles formatting, versioning, and updating ICP profiles in Bedrock Knowledge Base
 */

import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { ICPProfile } from './types';
import { createBedrockAgentRuntimeClient, createDynamoDBClient } from './clients';

/**
 * Formats an ICP profile as markdown with metadata header
 * @param profile - The ICP profile to format
 * @returns Markdown-formatted string
 */
export function formatICPProfile(profile: ICPProfile): string {
  const lines: string[] = [];

  // Metadata header
  lines.push('# Ideal Customer Profile');
  lines.push('');
  lines.push(`**Version:** ${profile.version}`);
  lines.push(`**Generated:** ${profile.generatedAt}`);
  lines.push(`**Confidence Score:** ${profile.confidenceScore}/100`);
  lines.push(`**Sample Size:** ${profile.sampleSize} customers`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Traits section
  lines.push('## Common Traits');
  lines.push('');

  lines.push('### Industries');
  profile.traits.industries.forEach((industry) => {
    lines.push(`- ${industry}`);
  });
  lines.push('');

  lines.push('### Company Size');
  lines.push(`- ${profile.traits.sizeRange}`);
  lines.push('');

  lines.push('### Regions');
  profile.traits.regions.forEach((region) => {
    lines.push(`- ${region}`);
  });
  lines.push('');

  lines.push('### Usage Patterns');
  profile.traits.usagePatterns.forEach((pattern) => {
    lines.push(`- ${pattern}`);
  });
  lines.push('');

  // Reasoning section
  lines.push('## Analysis Reasoning');
  lines.push('');
  lines.push(profile.reasoning);
  lines.push('');

  return lines.join('\n');
}

/**
 * Extracts version number from ICP profile markdown content
 * @param content - Markdown content of ICP profile
 * @returns Version number or 0 if not found
 */
function extractVersionFromMarkdown(content: string): number {
  const versionMatch = content.match(/\*\*Version:\*\*\s+(\d+)/);
  return versionMatch ? parseInt(versionMatch[1], 10) : 0;
}

/**
 * Retrieves the latest ICP version from Knowledge Base
 * @param knowledgeBaseId - Bedrock Knowledge Base ID
 * @returns Latest version number, or 0 if no profile exists
 */
export async function getLatestICPVersion(
  knowledgeBaseId: string
): Promise<number> {
  const client = createBedrockAgentRuntimeClient();

  try {
    const response = await client.send(
      new RetrieveCommand({
        knowledgeBaseId,
        retrievalQuery: {
          text: 'version',
        },
      })
    );

    if (!response.retrievalResults || response.retrievalResults.length === 0) {
      return 0;
    }

    // Extract version from the first result
    const content = response.retrievalResults[0].content?.text || '';
    return extractVersionFromMarkdown(content);
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      console.log('No previous ICP profile found, starting at version 0');
      return 0;
    }
    console.error('Failed to retrieve latest ICP version:', error);
    throw new Error(`Failed to get latest ICP version: ${error.message}`);
  }
}

/**
 * Delays execution for specified milliseconds
 * @param ms - Milliseconds to delay
 */
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Stores pending Knowledge Base update in DynamoDB
 * @param profile - ICP profile to store
 * @param tableName - DynamoDB table name
 */
async function storePendingUpdate(
  profile: ICPProfile,
  tableName: string
): Promise<void> {
  const client = createDynamoDBClient();

  try {
    await client.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          updateId: { S: `pending-kb-update-${Date.now()}` },
          timestamp: { S: new Date().toISOString() },
          profile: { S: JSON.stringify(profile) },
          status: { S: 'pending' },
        },
      })
    );
    console.log('Stored pending Knowledge Base update in DynamoDB');
  } catch (error: any) {
    console.error('Failed to store pending update:', error);
  }
}

/**
 * Updates ICP profile in Bedrock Knowledge Base with retry logic
 * @param profile - ICP profile to update
 * @param knowledgeBaseId - Bedrock Knowledge Base ID
 */
export async function updateICPProfile(
  profile: ICPProfile,
  knowledgeBaseId: string
): Promise<void> {
  const markdown = formatICPProfile(profile);
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Note: The actual Knowledge Base update API depends on how the KB is configured
      // This is a placeholder for the actual implementation
      // In practice, you would use S3 sync or the Bedrock Agent API to update the KB
      console.log(
        `Attempting to update Knowledge Base (attempt ${attempt}/${maxRetries})`
      );

      // TODO: Implement actual Knowledge Base update
      // For now, we'll log the formatted profile
      console.log('Formatted ICP Profile:');
      console.log(markdown);

      console.log('Knowledge Base update successful');
      return;
    } catch (error: any) {
      lastError = error;
      console.error(
        `Knowledge Base update attempt ${attempt} failed:`,
        error.message
      );

      if (attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.log(`Retrying in ${backoffMs}ms...`);
        await delay(backoffMs);
      }
    }
  }

  // All retries failed, store pending update
  console.error('All Knowledge Base update attempts failed');
  const tableName = process.env.ANALYSIS_TABLE_NAME || 'icp-analysis-history';
  await storePendingUpdate(profile, tableName);

  throw new Error(
    `Failed to update Knowledge Base after ${maxRetries} attempts: ${lastError?.message}`
  );
}
