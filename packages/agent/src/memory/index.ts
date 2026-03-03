/**
 * Recursive Memory (Agentic RAG) System
 * 
 * Main entry point for the memory system. Provides long-term memory for the Sesari agent
 * through Amazon S3 storage and Amazon Bedrock Knowledge Bases for semantic retrieval.
 * 
 * @module memory
 */

// ============================================================================
// Type Exports
// ============================================================================

export type {
  MemoryDocument,
  StrategyDocument,
  PerformanceSummary,
  ActionHistory,
  TechnicalMap,
  SearchResult,
  FailureCheck,
  MemoryStore,
  MemoryRetrieval,
  FailureDetector,
} from './types';

export type {
  MemoryConfig,
  BedrockKBConfig,
} from './config';

export type {
  CreateActionHistoryInput,
  UpdateOutcomeInput,
} from './action-history';

export type {
  WeeklyMetricsInput,
} from './performance-summarizer';

// ============================================================================
// Core Module Exports
// ============================================================================

export { createMemoryStore } from './memory-store';
export { search } from './memory-retrieval';
export { checkForRepeatedFailure } from './failure-detector';
export { generateWeeklySummary } from './performance-summarizer';
export {
  createActionHistory,
  updateActionOutcome,
} from './action-history';

// ============================================================================
// Utility Exports
// ============================================================================

export {
  serializeDocument,
  parseDocument,
  validateDocument,
  DocumentValidationError,
  DocumentSerializationError,
} from './document-serializer';

export {
  generateStrategyKey,
  generatePerformanceKey,
  generateActionKey,
  generateTechnicalKey,
} from './s3-keys';

export { loadMemoryConfig } from './config';

// ============================================================================
// Convenience Functions
// ============================================================================

import { createMemoryStore } from './memory-store';
import { search } from './memory-retrieval';
import { checkForRepeatedFailure } from './failure-detector';
import type { MemoryDocument, SearchResult, FailureCheck } from './types';

/**
 * Store a document and automatically trigger Knowledge Base synchronization
 * 
 * @param document - Memory document to store
 * @returns S3 object key where document was stored
 * 
 * @example
 * ```typescript
 * const strategyDoc: StrategyDocument = {
 *   id: 'icp-v1',
 *   type: 'strategy',
 *   category: 'icp',
 *   content: 'Our ICP is...',
 *   timestamp: new Date().toISOString(),
 *   version: 1,
 *   metadata: { lastModified: new Date().toISOString() }
 * };
 * 
 * const key = await storeAndSync(strategyDoc);
 * console.log(`Stored at: ${key}`);
 * ```
 */
export async function storeAndSync(document: MemoryDocument): Promise<string> {
  const store = createMemoryStore();
  const key = await store.storeDocument(document);
  
  // Trigger KB sync in background (don't await to avoid blocking)
  store.syncKnowledgeBase().catch((error) => {
    console.error('KB sync failed (non-blocking):', error);
  });
  
  return key;
}

/**
 * Retrieve relevant context for a query with automatic failure detection
 * 
 * Searches the knowledge base and checks if similar actions have failed recently.
 * Useful for informing agent decisions with both relevant context and failure warnings.
 * 
 * @param query - Natural language query describing the proposed action
 * @param options - Search options (topK, documentType filter, minScore threshold)
 * @returns Search results and failure check
 * 
 * @example
 * ```typescript
 * const context = await getContextWithFailureCheck(
 *   'Send discount email to churning customers',
 *   { topK: 5, minScore: 0.7 }
 * );
 * 
 * if (context.failureCheck.hasRecentFailure) {
 *   console.warn('Similar action failed recently:', context.failureCheck.similarActions);
 * }
 * 
 * console.log('Relevant documents:', context.searchResults);
 * ```
 */
export async function getContextWithFailureCheck(
  query: string,
  options?: {
    topK?: number;
    documentType?: MemoryDocument['type'];
    minScore?: number;
  }
): Promise<{
  searchResults: SearchResult[];
  failureCheck: FailureCheck;
}> {
  const [searchResults, failureCheck] = await Promise.all([
    search(query, options),
    checkForRepeatedFailure(query),
  ]);

  return {
    searchResults,
    failureCheck,
  };
}

/**
 * Retrieve a document by ID from S3
 * 
 * @param documentId - ID of the document to retrieve
 * @param documentType - Type of document (strategy, performance, action, technical)
 * @returns Memory document or null if not found
 * 
 * @example
 * ```typescript
 * const doc = await getDocument('icp-v1', 'strategy');
 * if (doc) {
 *   console.log('Found document:', doc);
 * }
 * ```
 */
export async function getDocument(
  documentId: string,
  documentType: MemoryDocument['type']
): Promise<MemoryDocument | null> {
  const store = createMemoryStore();
  return store.getDocument(documentId, documentType);
}

/**
 * Update an existing document in S3
 * 
 * @param documentId - ID of the document to update
 * @param document - Updated document
 * 
 * @example
 * ```typescript
 * await updateDocument('icp-v1', {
 *   ...existingDoc,
 *   version: 2,
 *   content: 'Updated ICP...'
 * });
 * ```
 */
export async function updateDocument(
  documentId: string,
  document: MemoryDocument
): Promise<void> {
  const store = createMemoryStore();
  await store.updateDocument(documentId, document);
  
  // Trigger KB sync in background
  store.syncKnowledgeBase().catch((error) => {
    console.error('KB sync failed (non-blocking):', error);
  });
}

/**
 * Manually trigger Knowledge Base synchronization
 * 
 * Useful for batch operations where you want to sync once after multiple uploads.
 * 
 * @example
 * ```typescript
 * // Upload multiple documents
 * await store.storeDocument(doc1);
 * await store.storeDocument(doc2);
 * await store.storeDocument(doc3);
 * 
 * // Sync once after all uploads
 * await syncKnowledgeBase();
 * ```
 */
export async function syncKnowledgeBase(): Promise<void> {
  const store = createMemoryStore();
  await store.syncKnowledgeBase();
}
