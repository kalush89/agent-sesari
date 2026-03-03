/**
 * Core type definitions for the Recursive Memory (Agentic RAG) system
 */

/**
 * Base interface for all memory documents
 */
export interface MemoryDocument {
  id: string;
  type: 'strategy' | 'performance' | 'action' | 'technical';
  timestamp: string; // ISO 8601
  version: number;
}

/**
 * Strategy documents (ICP, playbooks, brand voice)
 */
export interface StrategyDocument extends MemoryDocument {
  type: 'strategy';
  category: 'icp' | 'playbook' | 'brand_voice';
  content: string;
  metadata: {
    author?: string;
    lastModified: string;
  };
}

/**
 * Weekly performance summaries
 */
export interface PerformanceSummary extends MemoryDocument {
  type: 'performance';
  weekStart: string; // ISO 8601 date
  weekEnd: string;
  metrics: {
    revenueChangePercent: number;
    usageBySegment: Record<string, number>;
    churnIndicators: {
      atRiskCount: number;
      churnedCount: number;
    };
  };
}

/**
 * Growth Play action history
 */
export interface ActionHistory extends MemoryDocument {
  type: 'action';
  growthPlay: {
    description: string;
    category: string;
    targetSegment?: string;
  };
  outcome?: {
    status: 'success' | 'failure';
    determinedAt: string;
    notes?: string;
  };
  businessContext: {
    weeklyRevenue?: number;
    activeUsers?: number;
    relevantSignals: string[];
  };
}

/**
 * Technical maps (signal definitions, schemas)
 */
export interface TechnicalMap extends MemoryDocument {
  type: 'technical';
  category: 'signal_definition' | 'integration_schema';
  serviceName: string;
  schema: Record<string, unknown>;
}

/**
 * Search result from Bedrock KB
 */
export interface SearchResult {
  document: MemoryDocument;
  score: number; // Semantic similarity score (0-1)
  excerpt: string; // Relevant text snippet
}

/**
 * Result of failure detection check
 */
export interface FailureCheck {
  hasRecentFailure: boolean;
  similarActions: Array<{
    action: ActionHistory;
    similarity: number;
    daysSinceFailure: number;
  }>;
}

/**
 * Stores memory documents to S3 and triggers KB sync
 */
export interface MemoryStore {
  /**
   * Store a document in S3
   * @param document - The memory document to store
   * @returns S3 object key
   */
  storeDocument(document: MemoryDocument): Promise<string>;

  /**
   * Retrieve a document from S3
   * @param documentId - ID of document to retrieve
   * @param documentType - Type of document to retrieve
   * @returns Memory document or null if not found
   */
  getDocument(documentId: string, documentType: MemoryDocument['type']): Promise<MemoryDocument | null>;

  /**
   * Update an existing document (replaces previous version)
   * @param documentId - ID of document to update
   * @param document - Updated document
   */
  updateDocument(documentId: string, document: MemoryDocument): Promise<void>;

  /**
   * Trigger Bedrock KB synchronization
   */
  syncKnowledgeBase(): Promise<void>;
}

/**
 * Retrieves relevant context from Bedrock KB
 */
export interface MemoryRetrieval {
  /**
   * Search for relevant documents
   * @param query - Natural language query
   * @param options - Search options
   * @returns Top-K relevant documents
   */
  search(
    query: string,
    options?: {
      topK?: number;
      documentType?: MemoryDocument['type'];
      minScore?: number;
    }
  ): Promise<SearchResult[]>;
}

/**
 * Detects repeated failure patterns
 */
export interface FailureDetector {
  /**
   * Check if a proposed Growth Play has failed recently
   * @param growthPlayDescription - Description of proposed action
   * @returns Failure check result
   */
  checkForRepeatedFailure(
    growthPlayDescription: string
  ): Promise<FailureCheck>;
}
