# Implementation Plan: Automated Growth Plays

## Overview

This implementation plan breaks down the Automated Growth Plays feature into discrete, incremental coding tasks. The system is built as an event-driven, serverless architecture using AWS Lambda, DynamoDB, Bedrock Nova Lite, and Next.js. Each task builds on previous work, with property-based tests integrated throughout to validate correctness properties early.

## Tasks

- [x] 1. Set up project structure and shared types
  - Create directory structure for Lambda functions in `/packages/lambdas/growth-plays/`
  - Define TypeScript interfaces for all data models (GrowthPlay, RiskProfile, UnifiedCustomerProfile, etc.)
  - Set up shared utilities module for common functions (validation, error handling)
  - Configure Vitest and fast-check testing frameworks
  - _Requirements: 4.1, 7.1_

- [x] 2. Implement Growth Play parser and serializer with round-trip testing
  - [x] 2.1 Create Growth Play parser with schema validation
    - Implement `parseGrowthPlay()` function with field validation
    - Validate required fields (id, customerId, riskScore, communicationType, status, etc.)
    - Validate data types and enum values
    - Return descriptive error messages for invalid data
    - _Requirements: 4.1, 4.5_
  
  - [ ]* 2.2 Write property test for round-trip serialization
    - **Property 13: Round-trip serialization preserves data**
    - **Validates: Requirements 4.4**
  
  - [x] 2.3 Create Growth Play serializer
    - Implement `serializeGrowthPlay()` function to convert object to JSON
    - Implement `prettyPrintGrowthPlay()` for human-readable formatting
    - _Requirements: 4.2, 4.3_
  
  - [ ]* 2.4 Write property test for parse error descriptiveness
    - **Property 14: Parse error descriptiveness**
    - **Validates: Requirements 4.5**
  
  - [x] 2.5 Write unit tests for parser edge cases
    - Test missing required fields
    - Test invalid enum values
    - Test out-of-bounds risk scores
    - _Requirements: 4.1, 4.5_

- [x] 3. Set up DynamoDB tables and data access layer
  - [x] 3.1 Create DynamoDB table definitions
    - Define GrowthPlays table with GSIs (customerId-createdAt-index, status-createdAt-index)
    - Define CustomerRiskProfiles table with TTL attribute
    - Define SignalCache table with TTL attribute
    - Create CloudFormation or CDK infrastructure code
    - _Requirements: 2.4, 7.3, 8.6_
  
  - [x] 3.2 Implement data access layer functions
    - Create `storeGrowthPlay()` function with error handling
    - Create `getGrowthPlayById()` function
    - Create `queryGrowthPlaysByStatus()` function using GSI
    - Create `updateGrowthPlayStatus()` function with audit trail append
    - Create `storeRiskProfile()` and `getRiskProfile()` functions
    - Create `cacheProfiles()` and `getCachedProfiles()` functions
    - _Requirements: 2.1, 2.4, 7.5_
  
  - [x] 3.3 Write unit tests for DynamoDB operations
    - Test with LocalStack or DynamoDB Local
    - Test error handling for network failures
    - Test TTL attribute configuration
    - _Requirements: 2.4, 7.3_

- [x] 4. Implement Signal Orchestrator Lambda
  - [x] 4.1 Create Signal Orchestrator handler
    - Implement main handler function with environment variable validation
    - Implement cache checking logic (check SignalCache table)
    - Implement UniversalSignals table query by time range and category
    - Implement signal grouping by entity.primaryKey
    - Implement cache storage with 1-hour TTL
    - _Requirements: 1.1, 7.4, 7.5_
  
  - [ ]* 4.2 Write property test for signal grouping
    - **Property 21: Signal grouping by entity**
    - **Validates: Requirements 1.1**
  
  - [ ]* 4.3 Write property test for cache behavior
    - **Property 22: Cache hit within TTL**
    - **Validates: Requirements 7.5**
  
  - [x] 4.4 Write unit tests for Signal Orchestrator
    - Test cache hit scenario
    - Test cache miss scenario
    - Test signal grouping with multiple entities
    - _Requirements: 1.1, 7.5_

- [x] 5. Implement Signal Correlator Lambda
  - [x] 5.1 Create risk calculation functions
    - Implement `calculateRiskScore()` with weighted algorithm
    - Implement `detectUsageDecline()` for Mixpanel data analysis
    - Implement `checkRenewalProximity()` for Stripe renewal dates
    - Implement `aggregateRiskFactors()` to combine factors
    - Ensure risk scores are bounded between 0-100
    - _Requirements: 1.2, 1.3, 1.4, 1.5_
  
  - [ ]* 5.2 Write property test for risk score bounds
    - **Property 6: Risk score bounds invariant**
    - **Validates: Requirements 1.5**
  
  - [ ]* 5.3 Write property test for usage decline detection
    - **Property 3: Usage decline detection**
    - **Validates: Requirements 1.2**
  
  - [ ]* 5.4 Write property test for renewal proximity detection
    - **Property 4: Renewal proximity detection**
    - **Validates: Requirements 1.3**
  
  - [x] 5.5 Create Signal Correlator handler
    - Implement main handler to process unified customer profiles
    - Filter high-risk customers (score > 70)
    - Store risk profiles in DynamoDB with all signal values
    - Return list of high-risk customers for draft generation
    - _Requirements: 1.4, 1.6, 2.1_
  
  - [ ]* 5.6 Write property test for signal data persistence
    - **Property 1: Signal data persistence**
    - **Validates: Requirements 1.6, 2.4, 8.1**
  
  - [ ]* 5.7 Write property test for high-risk flagging logic
    - **Property 5: High-risk flagging logic**
    - **Validates: Requirements 1.4**
  
  - [x] 5.8 Write unit tests for specific risk patterns
    - Test 50% decline + 30 days = high risk
    - Test edge cases (exactly 50%, exactly 30 days)
    - Test low-risk scenarios
    - _Requirements: 1.2, 1.3, 1.4_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement Draft Generator Lambda with Bedrock integration
  - [x] 7.1 Create Bedrock prompt builder
    - Implement `buildBedrockPrompt()` function with customer context
    - Include risk factors and signal values in prompt
    - Format prompt according to Nova Lite requirements
    - _Requirements: 3.1, 3.2_
  
  - [x] 7.2 Create Bedrock API integration
    - Implement `invokeBedrockNovaLite()` with error handling
    - Handle throttling with retry logic
    - Parse Bedrock response and extract draft content
    - _Requirements: 3.1, 7.2_
  
  - [x] 7.3 Create draft formatting functions
    - Implement word count validation (200 for email, 100 for Slack)
    - Implement `formatDraft()` to apply formatting rules
    - Implement `createThoughtTrace()` to generate explainability section
    - _Requirements: 3.2, 3.5, 3.6_
  
  - [ ]* 7.4 Write property test for draft content completeness
    - **Property 10: Draft content completeness**
    - **Validates: Requirements 3.2, 3.5**
  
  - [ ]* 7.5 Write property test for communication format support
    - **Property 11: Communication format support**
    - **Validates: Requirements 3.3**
  
  - [ ]* 7.6 Write property test for word limit constraints
    - **Property 12: Draft word limit constraints**
    - **Validates: Requirements 3.6**
  
  - [x] 7.7 Create Draft Generator handler
    - Implement main handler to process high-risk customers
    - Generate drafts for both email and Slack formats
    - Create Growth Play objects with "pending" status
    - Store Growth Plays in DynamoDB with audit trail
    - _Requirements: 2.1, 3.1, 3.3_
  
  - [ ]* 7.8 Write property test for high-risk Growth Play creation
    - **Property 7: High-risk Growth Play creation**
    - **Validates: Requirements 2.1**
  
  - [x] 7.9 Write unit tests for Draft Generator
    - Test email format includes subject line
    - Test Slack format excludes subject line
    - Test Bedrock error handling
    - _Requirements: 3.3, 3.4_

- [x] 8. Implement Growth Play deduplication logic
  - [x] 8.1 Add deduplication to Draft Generator
    - Check for existing pending Growth Plays for customer
    - Compare risk scores and keep highest severity
    - Update existing Growth Play instead of creating duplicate
    - _Requirements: 2.3_
  
  - [ ]* 8.2 Write property test for Growth Play deduplication
    - **Property 8: Growth Play deduplication**
    - **Validates: Requirements 2.3**
  
  - [x] 8.3 Write unit tests for deduplication scenarios
    - Test multiple risk patterns for same customer
    - Test keeping highest severity pattern
    - _Requirements: 2.3_

- [x] 9. Implement risk score resolution logic
  - [x] 9.1 Add resolution check to Signal Correlator
    - Query existing pending Growth Plays for each customer
    - Check if risk score dropped below 50
    - Update Growth Play status to "resolved" if applicable
    - _Requirements: 2.5_
  
  - [ ]* 9.2 Write property test for risk score resolution
    - **Property 9: Risk score resolution**
    - **Validates: Requirements 2.5**
  
  - [x] 9.3 Write unit tests for resolution scenarios
    - Test risk score drop triggers resolution
    - Test risk score above 50 does not trigger resolution
    - _Requirements: 2.5_

- [x] 10. Checkpoint - Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement Execution Engine Lambda
  - [x] 11.1 Create communication sender functions
    - Implement `sendEmail()` using AWS SES SDK
    - Implement `sendSlackMessage()` using Slack API
    - Add proper error handling and logging
    - _Requirements: 6.2, 6.3_
  
  - [x] 11.2 Create retry logic with exponential backoff
    - Implement `retryWithBackoff()` function (1s, 2s, 4s delays)
    - Handle max retry failures
    - _Requirements: 6.5, 6.6_
  
  - [x] 11.3 Create Execution Engine handler
    - Implement main handler to process approved Growth Plays
    - Route to email or Slack based on communication type
    - Update Growth Play status to "executed" on success
    - Update Growth Play status to "failed" after max retries
    - Append audit trail entries for all actions
    - _Requirements: 6.1, 6.4, 6.6, 8.3_
  
  - [ ]* 11.4 Write property test for execution routing
    - **Property 18: Execution routing by communication type**
    - **Validates: Requirements 6.2, 6.3**
  
  - [ ]* 11.5 Write property test for successful execution state update
    - **Property 19: Successful execution state update**
    - **Validates: Requirements 6.4**
  
  - [ ]* 11.6 Write property test for retry logic
    - **Property 20: Retry logic on failure**
    - **Validates: Requirements 6.5, 6.6**
  
  - [x] 11.7 Write unit tests for Execution Engine
    - Test SES integration with mock
    - Test Slack API integration with mock
    - Test retry scenarios
    - _Requirements: 6.2, 6.3, 6.5_

- [x] 12. Set up EventBridge scheduler
  - Create EventBridge rule for daily 6 AM UTC trigger
  - Configure rule to invoke Signal Orchestrator Lambda
  - Add IAM permissions for EventBridge to invoke Lambda
  - _Requirements: 2.2, 7.1_

- [x] 13. Implement Next.js API routes for Growth Play management
  - [x] 13.1 Create GET /api/growth-plays endpoint
    - Query DynamoDB for Growth Plays with status "pending"
    - Return list of Growth Plays sorted by createdAt descending
    - Add error handling and logging
    - _Requirements: 5.1_
  
  - [x] 13.2 Create POST /api/growth-plays/:id/approve endpoint
    - Validate Growth Play exists and is in "pending" status
    - Update status to "approved" in DynamoDB
    - Append audit trail entry with userId and timestamp
    - Invoke Execution Engine Lambda asynchronously
    - Return execution status
    - _Requirements: 5.2, 8.3_
  
  - [x] 13.3 Create POST /api/growth-plays/:id/dismiss endpoint
    - Validate Growth Play exists and is in "pending" status
    - Update status to "dismissed" in DynamoDB
    - Append audit trail entry with userId and timestamp
    - _Requirements: 5.3, 8.3_
  
  - [x] 13.4 Create PATCH /api/growth-plays/:id/edit endpoint
    - Validate Growth Play exists
    - Store edited content in `editedContent` field
    - Preserve original draft in `draftContent` field
    - Append audit trail entry with "edited" action
    - _Requirements: 5.4, 5.5_
  
  - [x] 13.5 Create GET /api/growth-plays/:id/audit endpoint
    - Retrieve Growth Play with full audit trail
    - Return complete history of actions and timestamps
    - _Requirements: 8.3, 8.5_
  
  - [x] 13.6 Write unit tests for API routes
    - Test each endpoint with valid and invalid inputs
    - Test error handling
    - Mock DynamoDB and Lambda invocations
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [-] 14. Implement property tests for approval workflow state transitions
  - [ ] 14.1 Write property test for approval state transition
    - **Property 15: Approval state transition**
    - **Validates: Requirements 5.2**
  
  - [ ] 14.2 Write property test for dismissal state transition
    - **Property 16: Dismissal state transition**
    - **Validates: Requirements 5.3**
  
  - [ ] 14.3 Write property test for draft edit preservation
    - **Property 17: Draft edit preservation**
    - **Validates: Requirements 5.4, 5.5**

- [x] 15. Checkpoint - Ensure all API tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Implement Next.js dashboard UI components
  - [x] 16.1 Create GrowthPlayCard component
    - Display customer name, company, and risk score
    - Show draft content with proper formatting
    - Include collapsible "Thought Trace" section
    - Add "Approve & Send" and "Dismiss" action buttons
    - Apply Sesari UI standards (Agentic Editorial aesthetic)
    - Use Shadcn/UI components with Tailwind CSS
    - _Requirements: 5.1, 5.6, 8.2_
  
  - [x] 16.2 Write unit tests for GrowthPlayCard component
    - Test rendering with email and Slack formats
    - Test button click handlers
    - Test collapsible Thought Trace interaction
    - Test accessibility compliance
    - _Requirements: 5.1, 5.6_
  
  - [x] 16.3 Create GrowthPlayFeed component
    - Fetch pending Growth Plays from API
    - Display list of GrowthPlayCard components
    - Show skeleton loaders during fetch
    - Show empty state when no pending Growth Plays
    - Handle API errors with error banner
    - _Requirements: 5.1_
  
  - [x] 16.4 Write unit tests for GrowthPlayFeed component
    - Test loading state
    - Test empty state
    - Test error state
    - Test successful data display
    - _Requirements: 5.1_
  
  - [x] 16.5 Create EditDraftModal component
    - Allow users to edit draft content before approval
    - Show character count and word limit warnings
    - Preserve original draft for comparison
    - Apply Sesari UI standards
    - _Requirements: 5.4, 5.5_
  
  - [x] 16.6 Write unit tests for EditDraftModal component
    - Test edit functionality
    - Test word limit validation
    - Test save and cancel actions
    - _Requirements: 5.4, 5.5_

- [x] 17. Create Growth Plays dashboard page
  - [x] 17.1 Create /app/growth-plays/page.tsx
    - Integrate GrowthPlayFeed component
    - Add page header with title and description
    - Apply Sesari UI standards (calm design, high whitespace)
    - Add Command Palette integration (Cmd + K)
    - _Requirements: 5.1_
  
  - [x] 17.2 Write integration tests for dashboard page
    - Test full approval workflow
    - Test full dismissal workflow
    - Test edit and approve workflow
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  
  - [ ]* 17.3 Write accessibility tests for dashboard page
    - Test keyboard navigation
    - Test screen reader compatibility
    - Test color contrast compliance
    - _Requirements: 5.1_

- [x] 18. Implement audit trail and explainability features
  - [x] 18.1 Create ThoughtTraceDisplay component
    - Display risk factors with severity indicators
    - Show signal sources (Mixpanel, HubSpot, Stripe)
    - Display natural language reasoning
    - Apply visual hierarchy with Sesari color palette
    - _Requirements: 8.2, 8.5_
  
  - [x] 18.2 Create AuditTrailView component
    - Display chronological list of all actions
    - Show timestamps and user IDs
    - Include metadata for each action
    - _Requirements: 8.3, 8.5_
  
  - [ ]* 18.3 Write property test for audit trail completeness
    - **Property 23: Audit trail completeness**
    - **Validates: Requirements 8.2, 8.3**
  
  - [x] 18.4 Write unit tests for audit components
    - Test rendering of different action types
    - Test timestamp formatting
    - _Requirements: 8.3, 8.5_

- [x] 19. Implement success rate calculation and analytics
  - [x] 19.1 Create analytics calculation functions
    - Implement `calculateSuccessRate()` function
    - Query executed Growth Plays with retention outcomes
    - Calculate percentage of retained customers
    - _Requirements: 8.4_
  
  - [ ]* 19.2 Write property test for success rate calculation
    - **Property 24: Success rate calculation**
    - **Validates: Requirements 8.4**
  
  - [x] 19.3 Create analytics dashboard component
    - Display success rate metric
    - Show total executed Growth Plays count
    - Display retention vs churn breakdown
    - _Requirements: 8.4_
  
  - [ ]* 19.4 Write unit tests for analytics components
    - Test calculation accuracy
    - Test display formatting
    - _Requirements: 8.4_

- [x] 20. Checkpoint - Ensure all frontend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 21. Wire all components together and configure deployment
  - [x] 21.1 Create Lambda deployment configurations
    - Configure environment variables for all Lambdas
    - Set memory allocation to 512MB for Free Tier compliance
    - Configure IAM roles and permissions
    - Set up Lambda function URLs or API Gateway integration
    - _Requirements: 7.1, 7.6_
  
  - [x] 21.2 Create infrastructure as code
    - Write CloudFormation or CDK stack for all resources
    - Configure DynamoDB tables with on-demand billing
    - Set up EventBridge rule with daily schedule
    - Configure AWS SES for email sending
    - _Requirements: 7.1, 7.3_
  
  - [x] 21.3 Configure Next.js environment variables
    - Add API endpoint URLs for Lambda functions
    - Add DynamoDB table names
    - Add AWS region configuration
    - _Requirements: 7.1_
  
  - [x] 21.4 Create deployment documentation
    - Document deployment steps
    - Document environment variable requirements
    - Document AWS Free Tier compliance checks
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 22. Final checkpoint - End-to-end validation
  - Run all unit tests and property tests
  - Verify all 24 correctness properties pass
  - Test complete workflow from signal collection to execution
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All Lambda functions must include proper error handling and structured logging
- All UI components must follow Sesari UI standards (Agentic Editorial aesthetic)
- AWS Free Tier compliance is enforced through memory limits and on-demand billing
- Checkpoints ensure incremental validation throughout implementation
