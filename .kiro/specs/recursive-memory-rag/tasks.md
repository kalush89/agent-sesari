# Implementation Plan: Recursive Memory (Agentic RAG)

## Overview

This plan implements a lightweight RAG system for the Sesari agent using Amazon S3 for document storage and Amazon Bedrock Knowledge Bases for semantic retrieval. The implementation follows a bottom-up approach: core utilities first, then storage/retrieval modules, then higher-level features like failure detection and performance summarization.

## Tasks

- [x] 1. Set up project structure and core types
  - Create `packages/agent/src/memory/` directory
  - Define TypeScript interfaces for all memory document types (StrategyDocument, PerformanceSummary, ActionHistory, TechnicalMap)
  - Define interfaces for MemoryStore, MemoryRetrieval, FailureDetector
  - Create configuration file for S3 bucket names, Bedrock KB IDs, and embedding model settings
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 6.1_

- [-] 2. Implement document serialization module
  - [x] 2.1 Create document-serializer.ts with JSON serialization functions
    - Implement `serializeDocument()` to convert MemoryDocument to JSON string
    - Implement `parseDocument()` to convert JSON string to typed MemoryDocument
    - Implement `validateDocument()` to check required fields (id, type, timestamp, version)
    - Handle serialization errors gracefully with descriptive error messages
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [ ]* 2.2 Write property test for serialization round trip
    - **Property 10: Document Serialization Round Trip**
    - **Validates: Requirements 6.4**
    - Use fast-check to generate random valid MemoryDocuments
    - Verify serialize → parse → serialize produces identical JSON
    - Run 100 iterations per test
  
  - [ ] 2.3 Write unit tests for document validation
    - Test rejection of documents missing required fields
    - Test handling of invalid JSON strings
    - Test edge cases: empty strings, special characters, large objects
    - _Requirements: 6.3_

- [-] 3. Implement S3 key generation utilities
  - [x] 3.1 Create s3-keys.ts with naming convention functions
    - Implement `generateStrategyKey(category, version)` → `strategy/{category}-v{version}.json`
    - Implement `generatePerformanceKey(weekStart)` → `performance/{year}-W{week}.json`
    - Implement `generateActionKey(actionId, timestamp)` → `actions/{actionId}-{timestamp}.json`
    - Implement `generateTechnicalKey(serviceName, category, version)` → `technical/{serviceName}-{category}-v{version}.json`
    - _Requirements: 1.1, 2.3, 3.1, 4.1_
  
  - [ ] 3.2 Write unit tests for S3 key generation
    - Test correct naming conventions for all document types
    - Test special character handling in IDs
    - Test version incrementing logic
    - _Requirements: 1.1, 2.3, 3.1, 4.1_

- [-] 4. Implement memory store module
  - [x] 4.1 Create memory-store.ts with S3 storage functions
    - Implement `storeDocument()` to upload documents to S3 with retry logic (3 attempts, exponential backoff)
    - Implement `updateDocument()` to replace existing documents
    - Implement `syncKnowledgeBase()` to trigger Bedrock KB sync via StartIngestionJob API
    - Use AWS SDK v3 with proper error handling and timeouts
    - _Requirements: 1.1, 1.3, 2.3, 3.1, 4.1, 8.3_
  
  - [ ]* 4.2 Write property test for document storage persistence
    - **Property 1: Document Storage Persistence**
    - **Validates: Requirements 1.1, 2.3, 4.1**
    - Use fast-check to generate random MemoryDocuments
    - Verify stored documents can be retrieved with same content
    - Run 100 iterations per test
  
  - [ ]* 4.3 Write property test for document category support
    - **Property 2: Document Category Support**
    - **Validates: Requirements 1.2, 4.2**
    - Test all document categories (ICP, playbook, brand voice, signal definition, integration schema)
    - Verify each category stores and retrieves successfully
    - Run 100 iterations per test
  
  - [ ]* 4.4 Write property test for document update replacement
    - **Property 3: Document Update Replacement**
    - **Validates: Requirements 1.3, 4.4**
    - Store document, update it, verify only updated version is retrievable
    - Run 100 iterations per test
  
  - [x] 4.5 Write unit tests for error handling
    - Test S3 upload retry logic
    - Test sync trigger failures
    - Test timeout handling
    - _Requirements: 1.1, 8.3_

- [x] 5. Checkpoint - Ensure storage tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [-] 6. Implement memory retrieval module
  - [x] 6.1 Create memory-retrieval.ts with Bedrock KB query functions
    - Implement `search()` to query Bedrock KB with RetrieveAndGenerate API
    - Support topK parameter (default 5), documentType filter, minScore threshold
    - Parse search results into SearchResult objects with document, score, and excerpt
    - Set 2-second timeout per requirement
    - Handle empty results gracefully (return empty array)
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  
  - [ ]* 6.2 Write property test for search returns results
    - **Property 7: Search Returns Results**
    - **Validates: Requirements 5.1**
    - Use fast-check to generate random search queries
    - Verify search returns list without errors (possibly empty)
    - Run 100 iterations per test
  
  - [ ]* 6.3 Write property test for search result limit and ordering
    - **Property 8: Search Result Limit and Ordering**
    - **Validates: Requirements 5.2**
    - Verify results limited to topK (default 5)
    - Verify results ordered by descending similarity score
    - Run 100 iterations per test
  
  - [ ]* 6.4 Write property test for search result metadata
    - **Property 9: Search Result Metadata**
    - **Validates: Requirements 5.3**
    - Verify each result includes document type and timestamp
    - Run 100 iterations per test
  
  - [x] 6.5 Write unit tests for retrieval error handling
    - Test Bedrock KB query failures and retries
    - Test timeout handling (2-second limit)
    - Test empty result handling
    - _Requirements: 5.1, 5.4_

- [x] 7. Implement failure detector module
  - [x] 7.1 Create failure-detector.ts with repeated failure detection
    - Implement `checkForRepeatedFailure()` to search for similar past actions
    - Use memory retrieval to find similar Growth Plays
    - Filter for failed actions within 90-day window
    - Calculate semantic similarity scores (flag if > 0.85)
    - Return FailureCheck with hasRecentFailure flag and similar action details
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  
  - [ ]* 7.2 Write property test for similar action retrieval
    - **Property 12: Similar Action Retrieval**
    - **Validates: Requirements 7.1**
    - Use fast-check to generate random Growth Play descriptions
    - Verify search returns actions with similarity scores
    - Run 100 iterations per test
  
  - [ ]* 7.3 Write property test for 90-day failure window
    - **Property 13: 90-Day Failure Window**
    - **Validates: Requirements 7.2, 7.4**
    - Test failures within 90 days are flagged (similarity > 0.85)
    - Test failures beyond 90 days are not flagged
    - Run 100 iterations per test
  
  - [ ]* 7.4 Write property test for failure context inclusion
    - **Property 14: Failure Context Inclusion**
    - **Validates: Requirements 7.3**
    - Verify flagged failures include action details, similarity score, days since failure
    - Run 100 iterations per test
  
  - [x] 7.5 Write unit tests for failure detection logic
    - Test similarity threshold calculation
    - Test 90-day window filtering
    - Test empty action history handling
    - _Requirements: 7.1, 7.2, 7.4_

- [x] 8. Checkpoint - Ensure retrieval and failure detection tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [-] 9. Implement performance summarizer module
  - [x] 9.1 Create performance-summarizer.ts with weekly aggregation
    - Implement `generateWeeklySummary()` to aggregate business metrics
    - Calculate revenue change percentage from previous week
    - Aggregate usage metrics by customer segment
    - Calculate churn indicators (at-risk count, churned count)
    - Create PerformanceSummary document with all metrics
    - _Requirements: 2.1, 2.2_
  
  - [ ]* 9.2 Write property test for performance summary structure
    - **Property 4: Performance Summary Structure**
    - **Validates: Requirements 2.2**
    - Verify generated summaries contain all required fields
    - Run 100 iterations per test
  
  - [ ] 9.3 Write unit tests for metric aggregation
    - Test revenue change calculation
    - Test usage aggregation by segment
    - Test churn indicator calculation
    - _Requirements: 2.2_

- [x] 10. Implement action history tracking
  - [x] 10.1 Create action-history.ts with Growth Play recording
    - Implement `createActionHistory()` to record new Growth Plays
    - Implement `updateActionOutcome()` to add success/failure status
    - Use memory store to persist ActionHistory documents
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  
  - [ ]* 10.2 Write property test for action history creation
    - **Property 5: Action History Creation**
    - **Validates: Requirements 3.1, 3.2**
    - Use fast-check to generate random Growth Play descriptions
    - Verify created records contain description, timestamp, business context
    - Run 100 iterations per test
  
  - [ ]* 10.3 Write property test for action history outcome updates
    - **Property 6: Action History Outcome Updates**
    - **Validates: Requirements 3.3**
    - Store action, update with outcome, verify original data preserved
    - Run 100 iterations per test
  
  - [ ] 10.4 Write unit tests for action history
    - Test action creation with various business contexts
    - Test outcome updates (success and failure)
    - Test timestamp generation
    - _Requirements: 3.1, 3.2, 3.3_

- [-] 11. Create infrastructure setup script
  - [x] 11.1 Create infrastructure/setup-memory.ts
    - Implement S3 bucket creation with folder structure (strategy/, performance/, actions/, technical/)
    - Implement Bedrock Knowledge Base creation with S3 data source
    - Configure Amazon Nova Lite embedding model
    - Set chunking strategy (512 tokens, 20% overlap)
    - Output configuration values (bucket name, KB ID, data source ID)
    - _Requirements: 8.1, 8.2, 8.4_
  
  - [ ] 11.2 Write integration test for Bedrock KB setup
    - Test KB creation and configuration
    - Test S3 data source connection
    - Test sync trigger functionality
    - _Requirements: 8.1, 8.2, 8.3_

- [-] 12. Create EventBridge schedule for weekly summaries
  - [x] 12.1 Create infrastructure/schedule-summaries.ts
    - Implement EventBridge rule for Sunday trigger (cron: 0 0 ? * SUN *)
    - Configure Lambda target to invoke performance summarizer
    - Set up IAM permissions for EventBridge to invoke Lambda
    - _Requirements: 2.1_
  
  - [ ]* 12.2 Write integration test for EventBridge schedule
    - Test schedule creation
    - Test Lambda invocation permissions
    - _Requirements: 2.1_

- [x] 13. Wire modules together and create main entry point
  - [x] 13.1 Create memory/index.ts with exported API
    - Export all public interfaces and functions
    - Create convenience functions for common operations
    - Add JSDoc comments for all exported functions
    - _Requirements: All_
  
  - [ ]* 13.2 Write integration tests for end-to-end flows
    - Test store → sync → retrieve flow
    - Test Growth Play → action history → failure detection flow
    - Test weekly summary generation and storage
    - _Requirements: All_

- [x] 14. Add configuration and environment setup
  - [x] 14.1 Create memory/config.ts with environment variables
    - Define S3_BUCKET_NAME, BEDROCK_KB_ID, BEDROCK_DATA_SOURCE_ID
    - Define AWS_REGION, EMBEDDING_MODEL
    - Add validation for required environment variables
    - _Requirements: 8.1, 8.2, 8.4_
  
  - [x] 14.2 Update packages/agent/.env.example
    - Add memory system environment variables
    - Add comments explaining each variable
    - _Requirements: 8.1, 8.2_

- [x] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- All property tests use fast-check library with 100 iterations minimum
- Each task references specific requirements for traceability
- Implementation follows AWS Free Tier constraints (serverless, scales to zero)
- Error handling follows patterns from engineering-standards.md (retry logic, proper logging, early returns)
- All AWS SDK calls use v3 with proper error handling and timeouts
