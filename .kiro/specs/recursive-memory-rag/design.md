# Design Document: Recursive Memory (Agentic RAG)

## Overview

The Recursive Memory system provides long-term memory for the Sesari agent through a lightweight RAG (Retrieval-Augmented Generation) architecture. The system stores business context, historical actions, and their outcomes in Amazon S3, indexes them using Amazon Bedrock Knowledge Bases, and enables semantic retrieval to inform future agent decisions.

This design prioritizes simplicity and AWS Free Tier compliance. The architecture uses serverless components that scale to zero when idle, avoiding "always-on" infrastructure costs.

### Key Design Decisions

1. **Amazon Bedrock Knowledge Bases over custom vector DB**: Managed service eliminates operational overhead and stays within Free Tier limits
2. **Amazon Nova Lite for embeddings**: Cost-optimized model for vector generation
3. **S3 as single source of truth**: Simple storage model with automatic Bedrock KB synchronization
4. **JSON serialization**: Standard format for document storage and retrieval with built-in validation
5. **90-day failure window**: Balances learning from mistakes with allowing strategy evolution

## Architecture

### High-Level Flow

```
┌─────────────────┐
│  Agent Logic    │
│  (Lambda)       │
└────────┬────────┘
         │
         ├─── Store Document ───────────────────┐
         │                                      │
         │                                      ▼
         │                              ┌──────────────┐
         │                              │   S3 Bucket  │
         │                              │  (Documents) │
         │                              └──────┬───────┘
         │                                     │
         │                                     │ Auto-sync
         │                                     │
         │                                     ▼
         │                              ┌──────────────┐
         │                              │  Bedrock KB  │
         │                              │ (Vector Index)│
         │                              └──────┬───────┘
         │                                     │
         └─── Retrieve Context ────────────────┘
```

### Component Responsibilities

**Memory Store Module** (`memory-store.ts`)
- Store documents to S3 with proper naming conventions
- Trigger Bedrock KB synchronization after writes
- Handle document versioning (replace on update)

**Memory Retrieval Module** (`memory-retrieval.ts`)
- Query Bedrock KB with semantic search
- Return top-K relevant documents with metadata
- Filter results by document type when needed

**Document Serializer Module** (`document-serializer.ts`)
- Serialize memory documents to JSON
- Parse JSON back to typed objects
- Validate document structure before storage

**Failure Detector Module** (`failure-detector.ts`)
- Search for similar past Growth Plays
- Check if similar actions failed within 90 days
- Calculate semantic similarity scores

**Performance Summarizer Module** (`performance-summarizer.ts`)
- Aggregate weekly business metrics
- Generate Performance Summary documents
- Schedule via EventBridge (Sunday trigger)

## Components and Interfaces

### Memory Document Types

```typescript
/**
 * Base interface for all memory documents
 */
interface MemoryDocument {
  id: string;
  type: 'strategy' | 'performance' | 'action' | 'technical';
  timestamp: string; // ISO 8601
  version: number;
}

/**
 * Strategy documents (ICP, playbooks, brand voice)
 */
interface StrategyDocument extends MemoryDocument {
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
interface PerformanceSummary extends MemoryDocument {
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
interface ActionHistory extends MemoryDocument {
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
interface TechnicalMap extends MemoryDocument {
  type: 'technical';
  category: 'signal_definition' | 'integration_schema';
  serviceName: string;
  schema: Record<string, unknown>;
}
```

### Memory Store Interface

```typescript
/**
 * Stores memory documents to S3 and triggers KB sync
 */
interface MemoryStore {
  /**
   * Store a document in S3
   * @param document - The memory document to store
   * @returns S3 object key
   */
  storeDocument(document: MemoryDocument): Promise<string>;

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
```

### Memory Retrieval Interface

```typescript
/**
 * Search result from Bedrock KB
 */
interface SearchResult {
  document: MemoryDocument;
  score: number; // Semantic similarity score (0-1)
  excerpt: string; // Relevant text snippet
}

/**
 * Retrieves relevant context from Bedrock KB
 */
interface MemoryRetrieval {
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
```

### Failure Detector Interface

```typescript
/**
 * Result of failure detection check
 */
interface FailureCheck {
  hasRecentFailure: boolean;
  similarActions: Array<{
    action: ActionHistory;
    similarity: number;
    daysSinceFailure: number;
  }>;
}

/**
 * Detects repeated failure patterns
 */
interface FailureDetector {
  /**
   * Check if a proposed Growth Play has failed recently
   * @param growthPlayDescription - Description of proposed action
   * @returns Failure check result
   */
  checkForRepeatedFailure(
    growthPlayDescription: string
  ): Promise<FailureCheck>;
}
```

## Data Models

### S3 Bucket Structure

```
sesari-memory-{accountId}/
├── strategy/
│   ├── icp-v1.json
│   ├── playbook-v2.json
│   └── brand-voice-v1.json
├── performance/
│   ├── 2024-W01.json
│   ├── 2024-W02.json
│   └── ...
├── actions/
│   ├── {actionId}-{timestamp}.json
│   └── ...
└── technical/
    ├── stripe-schema-v1.json
    ├── hubspot-schema-v1.json
    └── signal-definitions-v1.json
```

### Bedrock Knowledge Base Configuration

```typescript
interface BedrockKBConfig {
  knowledgeBaseId: string;
  dataSourceId: string;
  s3BucketName: string;
  embeddingModel: 'amazon.nova-lite-v1:0';
  vectorDimensions: 1024;
  chunkingStrategy: {
    type: 'FIXED_SIZE';
    maxTokens: 512;
    overlapPercentage: 20;
  };
}
```

### Document Naming Conventions

- **Strategy**: `{category}-v{version}.json`
- **Performance**: `{year}-W{week}.json`
- **Actions**: `{actionId}-{timestamp}.json`
- **Technical**: `{serviceName}-{category}-v{version}.json`


## Error Handling

### Storage Errors

**S3 Upload Failures**
- Retry with exponential backoff (3 attempts)
- Log error with document ID and type
- Return descriptive error to caller
- Do not proceed with KB sync if upload fails

**Document Validation Errors**
- Validate schema before S3 upload
- Return validation errors with specific field issues
- Log invalid document attempts for monitoring
- Reject malformed documents early

### Retrieval Errors

**Bedrock KB Query Failures**
- Retry transient errors (throttling, timeouts)
- Return empty results on persistent failures
- Log query and error details
- Set 2-second timeout per requirement

**Empty Result Handling**
- Return empty array (not null) for no matches
- Log queries that return zero results
- Allow agent to proceed with no context

### Synchronization Errors

**KB Sync Failures**
- Log sync trigger failures
- Continue operation (sync is eventually consistent)
- Monitor sync lag via CloudWatch metrics
- Alert if sync lag exceeds 10 minutes

### Serialization Errors

**JSON Parse Errors**
- Catch and log parse exceptions
- Return null for corrupted documents
- Alert on repeated parse failures
- Validate JSON structure before returning

**JSON Stringify Errors**
- Validate object before serialization
- Handle circular references gracefully
- Log serialization failures with document type
- Reject documents that cannot be serialized

## Testing Strategy

### Unit Testing

Unit tests verify specific examples, edge cases, and error conditions. Focus on:

**Document Serialization**
- Valid documents serialize correctly
- Invalid documents are rejected
- Edge cases: empty strings, special characters, large objects

**Failure Detection Logic**
- Similarity threshold calculation
- 90-day window filtering
- Empty action history handling

**S3 Key Generation**
- Correct naming conventions
- Version incrementing
- Special character handling in IDs

**Error Handling**
- Retry logic triggers correctly
- Timeout handling
- Validation error messages

### Property-Based Testing

Property tests verify universal properties across all inputs using a PBT library (fast-check for TypeScript). Each test runs minimum 100 iterations.

**Configuration**: Use fast-check library with 100 iterations per test.

**Test Tagging**: Each property test must include a comment referencing the design property:
```typescript
// Feature: recursive-memory-rag, Property 1: Serialization round trip
```

Properties will be defined in the Correctness Properties section below.

### Integration Testing

**Bedrock KB Integration**
- Store document and verify retrieval
- Test semantic search accuracy
- Verify sync triggers work
- Test with multiple document types

**S3 Integration**
- Upload and download documents
- Verify bucket structure
- Test document replacement
- Verify permissions

### Performance Testing

**Retrieval Latency**
- Verify <2 second response time requirement
- Test with varying KB sizes
- Monitor p95 and p99 latencies

**Sync Lag**
- Verify <5 minute indexing requirement
- Test with batch uploads
- Monitor sync queue depth


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, I identified the following redundancies:
- Properties 1.1, 2.3, and 4.1 all test document storage to S3 - these can be combined into a single general property
- Properties 1.2 and 4.2 both test category support - these can be combined
- Properties 1.3 and 4.4 both test document updates - these can be combined
- Properties 6.1 and 6.2 are subsumed by the round-trip property 6.4

The consolidated properties below eliminate these redundancies while maintaining complete coverage.

### Property 1: Document Storage Persistence

*For any* valid memory document (strategy, performance, action, or technical), storing it to the memory system should result in the document being retrievable from S3 with the same content.

**Validates: Requirements 1.1, 2.3, 4.1**

### Property 2: Document Category Support

*For any* document category (ICP, playbook, brand voice, signal definition, integration schema), the memory system should successfully store and retrieve documents of that category.

**Validates: Requirements 1.2, 4.2**

### Property 3: Document Update Replacement

*For any* memory document, if it is stored and then updated with a new version, retrieving the document should return only the updated version, not the original.

**Validates: Requirements 1.3, 4.4**

### Property 4: Performance Summary Structure

*For any* generated performance summary, it should contain revenue change percentage, usage metrics by segment, and churn indicators fields.

**Validates: Requirements 2.2**

### Property 5: Action History Creation

*For any* growth play description, creating an action history record should produce a document containing the description, timestamp, and business context.

**Validates: Requirements 3.1, 3.2**

### Property 6: Action History Outcome Updates

*For any* action history record, updating it with an outcome (success or failure) should preserve the original growth play data and add the outcome information.

**Validates: Requirements 3.3**

### Property 7: Search Returns Results

*For any* valid search query, the memory retrieval system should return a list of search results (possibly empty) without errors.

**Validates: Requirements 5.1**

### Property 8: Search Result Limit and Ordering

*For any* search query that matches documents, the results should be limited to at most 5 documents and ordered by descending semantic similarity score.

**Validates: Requirements 5.2**

### Property 9: Search Result Metadata

*For any* search result, it should include the document type and timestamp in the metadata.

**Validates: Requirements 5.3**

### Property 10: Document Serialization Round Trip

*For any* valid memory document, serializing to JSON then parsing back should produce an equivalent document with the same field values.

**Validates: Requirements 6.4**

### Property 11: Invalid Document Rejection

*For any* document missing required fields (id, type, timestamp, version), validation should reject it before storage.

**Validates: Requirements 6.3**

### Property 12: Similar Action Retrieval

*For any* growth play description, searching for similar past actions should return actions with semantic similarity scores.

**Validates: Requirements 7.1**

### Property 13: 90-Day Failure Window

*For any* failed growth play, if it occurred within the past 90 days and a similar action is proposed (similarity > 0.85), the failure detector should flag it as a repeated failure risk. If it occurred more than 90 days ago, it should not be flagged.

**Validates: Requirements 7.2, 7.4**

### Property 14: Failure Context Inclusion

*For any* failure check result that flags a repeated failure, it should include the similar action details, similarity score, and days since failure.

**Validates: Requirements 7.3**

### Property 15: Sync Trigger After Storage

*For any* document storage operation, the system should trigger a Bedrock KB synchronization call.

**Validates: Requirements 8.3**

