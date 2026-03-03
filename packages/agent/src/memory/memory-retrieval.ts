/**
 * Memory retrieval module for querying Amazon Bedrock Knowledge Bases
 */

import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
  RetrieveCommandInput,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { loadMemoryConfig } from './config';
import { parseDocument } from './document-serializer';
import type { MemoryDocument, SearchResult } from './types';

/**
 * Search for relevant documents in Bedrock Knowledge Base
 * @param query - Natural language query
 * @param options - Search options (topK, documentType filter, minScore threshold)
 * @returns Top-K relevant documents ordered by similarity score
 */
export async function search(
  query: string,
  options?: {
    topK?: number;
    documentType?: MemoryDocument['type'];
    minScore?: number;
  }
): Promise<SearchResult[]> {
  const config = loadMemoryConfig();
  const topK = options?.topK ?? 5;
  const minScore = options?.minScore ?? 0;

  const client = new BedrockAgentRuntimeClient({
    region: config.awsRegion,
  });

  const input: RetrieveCommandInput = {
    knowledgeBaseId: config.bedrockKnowledgeBaseId,
    retrievalQuery: {
      text: query,
    },
    retrievalConfiguration: {
      vectorSearchConfiguration: {
        numberOfResults: topK,
      },
    },
  };

  try {
    const command = new RetrieveCommand(input);

    // Set 2-second timeout per requirement
    const response = await Promise.race([
      client.send(command),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Bedrock KB query timeout')), 2000)
      ),
    ]);

    // Handle empty results gracefully
    if (!response.retrievalResults || response.retrievalResults.length === 0) {
      return [];
    }

    // Parse and filter results
    const results: SearchResult[] = [];

    for (const result of response.retrievalResults) {
      // Skip results below minimum score threshold
      if (result.score !== undefined && result.score < minScore) {
        continue;
      }

      // Extract document content from result
      const content = result.content?.text;
      if (!content) {
        continue;
      }

      try {
        // Parse the document from JSON
        const document = parseDocument(content);

        // Apply document type filter if specified
        if (options?.documentType && document.type !== options.documentType) {
          continue;
        }

        results.push({
          document,
          score: result.score ?? 0,
          excerpt: content.substring(0, 200), // First 200 chars as excerpt
        });
      } catch (error) {
        // Skip documents that fail to parse
        console.error('Failed to parse document from search result:', error);
        continue;
      }
    }

    // Sort by descending score and limit to topK
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  } catch (error) {
    // Log error and return empty array for graceful degradation
    console.error('Bedrock KB search failed:', error);
    return [];
  }
}
