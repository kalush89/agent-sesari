# Implementation Plan: Goal Decomposition Engine

## Overview

This implementation plan breaks down the Goal Decomposition Engine into discrete coding tasks. The approach follows a bottom-up strategy: start with core utilities (validation, error handling), build the three main components (context retrieval, goal decomposition, response validation), then wire everything together in the API route handler. Each step includes property-based tests to validate correctness properties from the design document.

## Tasks

- [x] 1. Set up project structure and core types
  - Create directory structure in `/packages/agent/src/goal-decomposition/`
  - Define TypeScript interfaces for DecompositionResponse, Objective, CompanyContext, and error types
  - Set up fast-check for property-based testing
  - Configure AWS SDK clients for Bedrock Runtime and Bedrock Agent Runtime
  - _Requirements: 8.1, 9.1, 9.2_

- [x] 2. Implement input validation
  - [x] 2.1 Create input validation function
    - Write `validateGoalInput(goal: string): void` function
    - Implement checks for empty, whitespace-only, and missing goal strings
    - Throw descriptive errors for invalid inputs
    - _Requirements: 1.2, 1.3, 8.2_
  
  - [ ]* 2.2 Write property test for input validation
    - **Property 1: Invalid Input Rejection**
    - **Validates: Requirements 1.2, 1.3, 8.2**
  
  - [ ]* 2.3 Write property test for valid input acceptance
    - **Property 2: Valid Input Acceptance**
    - **Validates: Requirements 1.1, 1.4, 1.5**

- [x] 3. Implement JSON schema validator
  - [x] 3.1 Create JSON schema definition
    - Define schema object matching the design specification
    - Include constraints for objective count (exactly 3), required fields, and array lengths
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.6_
  
  - [x] 3.2 Implement validation function
    - Write `validateDecompositionResponse(response: string): DecompositionResponse` function
    - Use Ajv or Zod for schema validation
    - Throw descriptive errors for validation failures
    - _Requirements: 4.1, 4.2, 4.5, 4.6, 4.7_
  
  - [ ]* 3.3 Write property test for objective count invariant
    - **Property 5: Objective Count Invariant**
    - **Validates: Requirements 3.3, 4.3, 4.4**
  
  - [ ]* 3.4 Write property test for required fields completeness
    - **Property 6: Required Fields Completeness**
    - **Validates: Requirements 4.5, 4.6**
  
  - [ ]* 3.5 Write property test for invalid JSON rejection
    - **Property 7: Invalid JSON Rejection**
    - **Validates: Requirements 4.2, 7.4**
  
  - [ ]* 3.6 Write property test for schema validation enforcement
    - **Property 8: Schema Validation Enforcement**
    - **Validates: Requirements 4.1, 4.5, 7.4**

- [x] 4. Checkpoint - Ensure validation tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement context retriever
  - [x] 5.1 Create Bedrock Knowledge Base client wrapper
    - Write `retrieveCompanyContext(goal: string): Promise<CompanyContext>` function
    - Configure BedrockAgentRuntimeClient with region from environment
    - Implement RetrieveCommand with goal as query and maxResults limit (3-5 documents)
    - Parse retrieval results into CompanyContext structure
    - _Requirements: 2.1, 2.2, 2.4_
  
  - [x] 5.2 Implement graceful degradation for context failures
    - Wrap retrieval in try-catch block
    - Log errors and return empty context on failure
    - Create `createEmptyContext(): CompanyContext` helper function
    - _Requirements: 2.3, 7.1, 7.2_
  
  - [ ]* 5.3 Write property test for context retrieval graceful degradation
    - **Property 3: Context Retrieval Graceful Degradation**
    - **Validates: Requirements 2.3, 7.2**
  
  - [ ]* 5.4 Write unit tests for context retrieval
    - Test successful retrieval with mock Bedrock KB responses
    - Test failure scenarios (timeout, service error)
    - Test empty context creation
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 6. Implement goal decomposer
  - [x] 6.1 Create prompt construction function
    - Write `constructDecompositionPrompt(goal: string, context: CompanyContext): string` function
    - Include company context, user goal, SMART instructions, and strict JSON format
    - Ensure all three context components are included when available
    - _Requirements: 3.1, 2.5, 3.6_
  
  - [x] 6.2 Implement Nova invocation function
    - Write `decomposeGoal(goal: string, context: CompanyContext): Promise<string>` function
    - Configure BedrockRuntimeClient with region from environment
    - Use InvokeModelCommand with Amazon Nova Lite model ID
    - Extract response body and return as string
    - Implement error handling for timeouts and rate limits
    - _Requirements: 3.1, 3.2, 3.4, 3.5_
  
  - [ ]* 6.3 Write property test for context inclusion in prompt
    - **Property 4: Context Inclusion in Prompt**
    - **Validates: Requirements 2.5, 3.1**
  
  - [ ]* 6.4 Write property test for Nova API failure handling
    - **Property 9: Nova API Failure Handling**
    - **Validates: Requirements 3.4, 3.5, 7.3**
  
  - [ ]* 6.5 Write unit tests for prompt construction
    - Test prompt includes all required sections
    - Test prompt with empty context
    - Test prompt with full context
    - _Requirements: 3.1, 2.5, 3.6_

- [x] 7. Checkpoint - Ensure core component tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement error handling utilities
  - [x] 8.1 Create error response helpers
    - Write `createErrorResponse(statusCode: number, message: string, details?: string): Response` function
    - Write `createSuccessResponse(statusCode: number, data: DecompositionResponse): Response` function
    - Implement environment-aware error detail inclusion (dev vs production)
    - _Requirements: 7.5, 7.6, 7.7, 8.3, 8.4, 8.5_
  
  - [ ]* 8.2 Write unit tests for error response formatting
    - Test 400 error responses
    - Test 500 error responses
    - Test development mode includes details
    - Test production mode excludes details
    - _Requirements: 7.6, 7.7, 8.4, 8.5_

- [x] 9. Implement logging utilities
  - [x] 9.1 Create structured logging functions
    - Write `logRequest(goal: string): void` function with truncation
    - Write `logContextRetrieval(success: boolean, docCount: number): void` function
    - Write `logNovaInvocation(modelId: string, tokenCount: number): void` function
    - Write `logValidation(isValidJson: boolean, passedSchema: boolean): void` function
    - Write `logExecutionTime(startTime: number): void` function
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.7_
  
  - [ ]* 9.2 Write property tests for logging behavior
    - **Property 11: Error Logging Completeness**
    - **Property 12: Request Logging**
    - **Validates: Requirements 7.1, 7.5, 11.1, 11.6, 11.7**

- [x] 10. Implement API route handler
  - [x] 10.1 Create Next.js API route
    - Create `/apps/web/app/api/decompose-goal/route.ts`
    - Implement POST handler function
    - Parse request body and extract goal field
    - Call validateGoalInput with error handling
    - _Requirements: 8.1, 8.2, 1.2, 1.3_
  
  - [x] 10.2 Wire context retrieval into handler
    - Call retrieveCompanyContext with goal
    - Handle failures gracefully (continue with empty context)
    - Log context retrieval results
    - _Requirements: 2.1, 2.3, 11.2_
  
  - [x] 10.3 Wire goal decomposition into handler
    - Call decomposeGoal with goal and context
    - Handle Nova API failures with appropriate error responses
    - Log Nova invocation details
    - _Requirements: 3.1, 3.2, 7.3, 11.3_
  
  - [x] 10.4 Wire response validation into handler
    - Call validateDecompositionResponse with Nova output
    - Handle validation failures with appropriate error responses
    - Log validation results
    - _Requirements: 4.1, 4.7, 7.4, 11.4, 11.5_
  
  - [x] 10.5 Implement top-level error handling
    - Wrap entire flow in try-catch block
    - Log all errors with full details
    - Return appropriate error responses based on error type
    - Set correct Content-Type headers for all responses
    - _Requirements: 7.5, 8.4, 8.5, 8.6, 11.6_
  
  - [ ]* 10.6 Write property test for successful response format
    - **Property 10: Successful Response Format**
    - **Validates: Requirements 4.7, 8.3, 8.6**
  
  - [ ]* 10.7 Write property test for stateless request handling
    - **Property 13: Stateless Request Handling**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4**
  
  - [ ]* 10.8 Write integration tests for complete flow
    - Test successful end-to-end decomposition with mocked AWS services
    - Test graceful degradation with context failure
    - Test error propagation from Nova
    - Test concurrent request handling
    - _Requirements: 2.3, 7.3, 10.4_

- [x] 11. Configure environment and deployment
  - [x] 11.1 Create environment configuration
    - Document required environment variables (AWS_REGION, KNOWLEDGE_BASE_ID, NOVA_MODEL_ID, NODE_ENV)
    - Add environment variable validation at startup
    - Create `.env.example` file with placeholder values
    - _Requirements: 9.1, 9.2, 9.3_
  
  - [x] 11.2 Add IAM permissions documentation
    - Document required IAM permissions for Bedrock Runtime
    - Document required IAM permissions for Bedrock Agent Runtime
    - Create example IAM policy JSON
    - _Requirements: 2.1, 3.2_

- [ ] 12. Final checkpoint - Ensure all tests pass
  - Run all unit tests and property tests
  - Verify error handling works correctly
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties with minimum 100 iterations each
- Unit tests validate specific examples and edge cases
- The implementation can start as a Next.js API route and be extracted to Lambda later for scaling
- All AWS SDK calls must follow error handling patterns from engineering-standards.md
