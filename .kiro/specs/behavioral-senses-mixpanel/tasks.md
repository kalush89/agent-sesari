# Implementation Plan: Behavioral Senses Mixpanel

## Overview

This implementation plan creates a serverless Mixpanel webhook monitoring system that detects critical behavioral signals (feature adoption drops, power user patterns) for B2B SaaS businesses. The system uses AWS Lambda for webhook processing and scheduled usage baseline calculation, DynamoDB for event storage, and follows AWS Free Tier optimization principles with high reliability standards.

## Tasks

- [x] 1. Set up project structure and core types
  - Create directory structure at `/packages/lambdas/mixpanel-connector`
  - Define TypeScript interfaces for BehavioralSignalEvent, FeatureAdoptionDropDetails, PowerUserDetails, UsageBaseline, UsageEvent
  - Set up package.json with dependencies (mixpanel, aws-sdk, fast-check for testing)
  - Configure TypeScript with strict mode and proper AWS Lambda types
  - Create .env.example file with required environment variables
  - _Requirements: 8.3, 8.4_

- [ ]* 1.1 Write property test for data model validation
  - **Property 8: Event Persistence**
  - **Validates: Requirements 4.1**

- [x] 2. Implement DynamoDB Event Store access layer
  - [x] 2.1 Create event-store.ts with DynamoDB client configuration
    - Initialize DynamoDB DocumentClient with region from environment
    - Implement connection error handling with proper logging
    - _Requirements: 4.1, 8.2, 8.4_
  
  - [x] 2.2 Implement putEvent function for behavioral signals
    - Write function to store BehavioralSignalEvent in behavioral-signals table
    - Add exponential backoff retry logic for write failures
    - Include error handling for throttling and unavailability
    - _Requirements: 4.1, 6.1, 6.2_
  
  - [ ]* 2.3 Write property test for putEvent
    - **Property 8: Event Persistence**
    - **Validates: Requirements 4.1**
  
  - [x] 2.4 Implement eventExists function
    - Write function to check if event ID already exists in DynamoDB
    - Use GetItem operation for fast lookup by primary key
    - Handle conditional check failures gracefully
    - _Requirements: 5.1, 5.4_
  
  - [ ]* 2.5 Write property test for idempotency
    - **Property 10: Idempotent Event Processing**
    - **Property 11: Event ID Uniqueness Enforcement**
    - **Validates: Requirements 5.1, 5.4**
  
  - [x] 2.6 Implement queryEventsByUser function
    - Write function to query events by user ID and date range
    - Use GSI (userId-timestamp-index) for efficient queries
    - Return results ordered by timestamp
    - _Requirements: 4.5_
  
  - [ ]* 2.7 Write property test for user queries
    - **Property 9: Event Query by Filters**
    - **Validates: Requirements 4.5**
  
  - [x] 2.8 Implement queryEventsByType function
    - Write function to query events by type and date range
    - Filter results by eventType field
    - _Requirements: 4.5_
  
  - [ ]* 2.9 Write property test for type queries
    - **Property 9: Event Query by Filters**
    - **Validates: Requirements 4.5**
  
  - [x] 2.10 Implement queryEventsByFeature function
    - Write function to query events by feature name and date range
    - Support filtering by event type
    - _Requirements: 4.5_
  
  - [ ]* 2.11 Write property test for feature queries
    - **Property 9: Event Query by Filters**
    - **Validates: Requirements 4.5**
  
  - [x] 2.12 Implement storeUsageEvent function
    - Write function to store UsageEvent in behavioral-signals table
    - Set TTL to 90 days from event timestamp
    - Handle duplicate event IDs gracefully
    - _Requirements: 4.1, 4.4_
  
  - [x] 2.13 Implement getUsageBaseline function
    - Write function to retrieve usage baseline for user-feature combination
    - Query usage-baselines table by composite key (userId#feature)
    - Return null if baseline doesn't exist
    - _Requirements: 10.1, 10.2_
  
  - [x] 2.14 Implement storeUsageBaseline function
    - Write function to store UsageBaseline in usage-baselines table
    - Set TTL to 90 days from lastCalculated timestamp
    - Use composite key format "userId#feature"
    - _Requirements: 10.1, 10.2, 10.5_
  
  - [ ]* 2.15 Write property test for usage baseline TTL
    - **Property 19: Usage Baseline TTL**
    - **Validates: Requirements 10.5**
  
  - [x] 2.16 Implement getUsageHistory function
    - Write function to retrieve usage events for user-feature combination
    - Query by userId and filter by feature name
    - Support configurable time window (7-30 days)
    - _Requirements: 10.1, 10.2_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement webhook signature verification
  - [x] 4.1 Create webhook-security.ts module
    - Import Mixpanel SDK for signature verification
    - Retrieve webhook signing secret from environment variables
    - _Requirements: 3.1, 3.3_
  
  - [x] 4.2 Implement verifyWebhookSignature function
    - Use Mixpanel signature verification algorithm (HMAC SHA-256)
    - Check timestamp age (reject if older than 5 minutes)
    - Return boolean indicating verification success
    - _Requirements: 3.1, 3.3_
  
  - [ ]* 4.3 Write property test for signature verification
    - **Property 6: Webhook Signature Verification**
    - **Validates: Requirements 3.1**
  
  - [x] 4.4 Write unit tests for signature verification edge cases
    - Test invalid signature rejection (401 response)
    - Test expired timestamp rejection (>5 minutes)
    - Test valid signature acceptance
    - _Requirements: 3.2, 3.3_
  
  - [ ]* 4.5 Write property test for invalid signature rejection
    - **Property 7: Invalid Signature Rejection**
    - **Validates: Requirements 3.2, 3.3**
  
  - [x] 4.6 Implement security logging
    - Log signature verification failures with source IP
    - Log replay attack attempts with timestamp details
    - Include event ID in all security logs
    - _Requirements: 3.5, 8.4_
  
  - [ ]* 4.7 Write property test for security logging
    - **Property 7: Invalid Signature Rejection**
    - **Validates: Requirements 3.5**

- [x] 5. Implement behavioral signal extraction
  - [x] 5.1 Create signal-extractor.ts module
    - Define function to map Mixpanel events to behavioral signals
    - Implement event type filtering logic
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  
  - [x] 5.2 Implement extractBehavioralSignal function
    - Parse Mixpanel webhook events
    - Extract user ID (distinct_id) and event properties
    - Determine feature name from event name or properties
    - Create UsageEvent for baseline calculation
    - Return null for non-behavioral events
    - _Requirements: 9.1, 9.2_
  
  - [x] 5.3 Write unit tests for signal extraction
    - Test feature usage event extraction
    - Test engagement summary event extraction
    - Test system event filtering (should return null)
    - Test event with missing user ID (should return null)
    - _Requirements: 9.1, 9.2, 9.3_
  
  - [x] 5.4 Implement event filtering logic
    - Return null for system events (Session Start, App Opened)
    - Return null for non-feature-specific events
    - Log ignored event types for monitoring
    - Return 200 status for ignored events
    - _Requirements: 9.3, 9.4_
  
  - [ ]* 5.5 Write property test for event type filtering
    - **Property 17: Event Type Filtering**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
  
  - [x] 5.6 Implement batch event processing
    - Parse webhook payloads containing multiple events
    - Process each event in the batch
    - Create usage events for all relevant events
    - _Requirements: 9.5_
  
  - [ ]* 5.7 Write property test for batch processing
    - **Property 18: Batch Event Processing**
    - **Validates: Requirements 9.5**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement usage baseline calculator Lambda
  - [x] 7.1 Create baseline-calculator.ts with handler function
    - Define handler function with EventBridgeEvent input
    - Configure for daily scheduled execution
    - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.2_
  
  - [x] 7.2 Implement getUserFeatureCombinations function
    - Query DynamoDB for all unique user-feature combinations from last 30 days
    - Extract distinct userId and feature pairs
    - Handle pagination for large datasets
    - _Requirements: 10.1_
  
  - [x] 7.3 Implement calculateUsageBaseline function
    - Query usage history for user-feature combination (30-day window)
    - Calculate average usage frequency (total uses / days)
    - Skip if less than 7 days of data
    - Create UsageBaseline with all required fields
    - _Requirements: 1.4, 10.1, 10.2, 10.3_
  
  - [ ]* 7.4 Write property test for baseline calculation
    - **Property 2: Usage Baseline Calculation**
    - **Validates: Requirements 1.4, 10.1, 10.2**
  
  - [ ]* 7.5 Write property test for insufficient data handling
    - **Property 3: Insufficient Data Handling**
    - **Validates: Requirements 10.3**
  
  - [x] 7.6 Write unit tests for baseline calculation
    - Test 30 events over 30 days (average = 1.0)
    - Test 60 events over 30 days (average = 2.0)
    - Test 5 events over 5 days (skip - insufficient data)
    - Test 10 events over 10 days (average = 1.0, 10 days >= 7)
    - _Requirements: 1.4, 10.1, 10.2, 10.3_
  
  - [x] 7.7 Implement detectAdoptionDrop function
    - Compare current usage to baseline average
    - Calculate drop percentage
    - Check if drop >= 50% threshold
    - Check if days since last use >= 14 days
    - Determine detection reason (percentage_drop, inactivity, both)
    - Return FeatureAdoptionDropDetails if drop detected
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [ ]* 7.8 Write property test for adoption drop detection
    - **Property 1: Feature Adoption Drop Detection**
    - **Validates: Requirements 1.1, 1.2, 1.3**
  
  - [x] 7.9 Write unit tests for drop detection
    - Test 50% drop (baseline 10, current 5) - should detect
    - Test 49% drop (baseline 10, current 5.1) - should not detect
    - Test 14 days inactivity - should detect
    - Test 13 days inactivity - should not detect
    - Test both conditions met (50% drop + 14 days) - detection reason "both"
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [x] 7.10 Implement calculateEngagementScore function
    - Calculate event frequency (total events in 30 days)
    - Calculate feature diversity (distinct features used)
    - Combine metrics into engagement score (0-100 scale)
    - Weight frequency and diversity appropriately
    - _Requirements: 2.4_
  
  - [ ]* 7.11 Write property test for engagement score calculation
    - **Property 5: Engagement Score Calculation**
    - **Validates: Requirements 2.4**
  
  - [x] 7.12 Write unit tests for engagement score
    - Test high frequency + high diversity (score > 80)
    - Test high frequency + low diversity (score 50-80)
    - Test low frequency + high diversity (score 50-80)
    - Test low frequency + low diversity (score < 50)
    - _Requirements: 2.4_
  
  - [x] 7.13 Implement identifyPowerUsers function
    - Query all users with events in last 30 days
    - Calculate days active for each user
    - Calculate engagement score for each user
    - Determine 90th percentile threshold
    - Identify users with 20+ days active OR score > 90th percentile
    - Extract top 5 most used features per user
    - Create PowerUserDetails for each power user
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  
  - [ ]* 7.14 Write property test for power user detection
    - **Property 4: Power User Detection**
    - **Validates: Requirements 2.1, 2.2, 2.3**
  
  - [x] 7.15 Write unit tests for power user identification
    - Test user with 25 days active (should be power user)
    - Test user with 19 days active but high engagement score (should be power user)
    - Test user with 15 days active and low engagement (should not be power user)
    - Test user exactly at 20-day threshold (should be power user)
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 7.16 Implement batch processing logic
    - Process user-feature combinations in batches
    - Continue processing on individual calculation failures
    - Log failed calculations for manual review
    - Ensure Lambda completes within 5-minute timeout
    - _Requirements: 6.1, 6.4_
  
  - [x] 7.17 Write unit tests for error handling
    - Test query timeout (skip current cycle, log error)
    - Test calculation error (skip that combination, continue others)
    - Test insufficient data (skip, log informational message)
    - _Requirements: 6.4_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement webhook Lambda handler
  - [x] 9.1 Create index.ts with main handler function
    - Define handler function with APIGatewayProxyEvent input
    - Return APIGatewayProxyResult with proper status codes
    - _Requirements: 6.2, 6.4_
  
  - [x] 9.2 Implement request parsing and validation
    - Extract webhook payload and signature from event
    - Parse JSON payload with error handling
    - Validate required fields presence (distinct_id, event name)
    - _Requirements: 6.4_
  
  - [ ]* 9.3 Write property test for malformed payload handling
    - **Property 13: Malformed Payload Handling**
    - **Validates: Requirements 6.4**
  
  - [x] 9.4 Write unit tests for parsing edge cases
    - Test empty payload
    - Test malformed JSON
    - Test missing user ID (distinct_id)
    - Test missing signature header
    - Test missing timestamp header
    - _Requirements: 6.4_
  
  - [x] 9.5 Implement webhook processing orchestration
    - Call verifyWebhookSignature with payload and signature
    - Check eventExists for idempotency
    - Call extractBehavioralSignal to parse event
    - Call storeUsageEvent to persist usage data
    - Return appropriate HTTP status codes (200, 400, 401, 500)
    - _Requirements: 3.2, 5.1, 5.5, 6.1_
  
  - [ ]* 9.6 Write property test for idempotent processing
    - **Property 10: Idempotent Event Processing**
    - **Validates: Requirements 5.1, 5.5**
  
  - [x] 9.7 Implement comprehensive error handling
    - Catch all exceptions at handler level
    - Return 500 for database unavailability (trigger Mixpanel retry)
    - Return 500 for unexpected errors (trigger Mixpanel retry)
    - Return 400 for parsing errors (no retry)
    - Return 401 for signature verification failures (no retry)
    - Log all errors with full context
    - _Requirements: 6.1, 6.2, 6.4_
  
  - [ ]* 9.8 Write property test for database unavailability
    - **Property 12: Database Unavailability Error Handling**
    - **Validates: Requirements 6.1, 6.2**
  
  - [x] 9.9 Write unit tests for error scenarios
    - Test DynamoDB unavailable (500 response)
    - Test DynamoDB throttling with retries
    - Test unhandled exception (500 response)
    - Test timeout warning at 8 seconds
    - _Requirements: 6.1, 6.2_

- [x] 10. Implement logging and observability
  - [x] 10.1 Create logger.ts utility module
    - Implement structured logging with JSON format
    - Include event ID in all log entries
    - Support log levels (info, warn, error)
    - Read LOG_LEVEL from environment variables
    - _Requirements: 8.4_
  
  - [x] 10.2 Add webhook processing logs
    - Log each processed webhook with event type and duration
    - Log warning when processing exceeds 5 seconds
    - Include Mixpanel event ID in all log entries
    - _Requirements: 8.1, 8.4_
  
  - [ ]* 10.3 Write property test for webhook processing logging
    - **Property 14: Webhook Processing Logging**
    - **Validates: Requirements 8.1, 8.4**
  
  - [x] 10.4 Add error logging with context
    - Log errors with event ID, event type, error message, and stack trace
    - Log duplicate webhook attempts
    - Log ignored event types
    - _Requirements: 8.3, 8.4_
  
  - [ ]* 10.5 Write property test for error context logging
    - **Property 16: Error Context Logging**
    - **Validates: Requirements 8.3, 8.4**
  
  - [x] 10.6 Implement CloudWatch metrics emission
    - Create metrics.ts module
    - Emit metric for successful event processing
    - Emit metric for failed event processing
    - Emit metric for processing latency
    - Emit metric for event type distribution
    - Use AWS SDK PutMetricData for custom metrics
    - _Requirements: 8.2_
  
  - [ ]* 10.7 Write property test for metrics emission
    - **Property 15: Metrics Emission**
    - **Validates: Requirements 8.2**
  
  - [x] 10.8 Add baseline calculator logging
    - Log start and completion of baseline calculation runs
    - Log number of user-feature combinations processed
    - Log number of drop events created
    - Log number of power user events created
    - Log any calculation failures or insufficient data cases
    - _Requirements: 8.1, 8.2, 8.3_

- [x] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Create infrastructure deployment scripts
  - [x] 12.1 Create infrastructure/setup-dynamodb.ts
    - Define behavioral-signals table schema with eventId primary key
    - Create GSI for userId-timestamp-index
    - Define usage-baselines table schema with userFeatureKey primary key
    - Configure on-demand billing mode for Free Tier compliance
    - Set TTL attribute (expiresAt) for both tables (90 days)
    - _Requirements: 4.1, 4.4, 8.2_
  
  - [x] 12.2 Create infrastructure/deploy-webhook-lambda.ts
    - Package webhook Lambda function with dependencies
    - Configure Lambda with 512MB memory and 10-second timeout
    - Set environment variables (MIXPANEL_WEBHOOK_SECRET, DYNAMODB_SIGNALS_TABLE, DYNAMODB_BASELINES_TABLE, AWS_REGION, LOG_LEVEL)
    - Attach IAM role with DynamoDB and CloudWatch permissions
    - _Requirements: 8.1, 8.4_
  
  - [x] 12.3 Create infrastructure/deploy-baseline-calculator-lambda.ts
    - Package baseline calculator Lambda function with dependencies
    - Configure Lambda with 1024MB memory and 5-minute timeout
    - Set environment variables (DYNAMODB_SIGNALS_TABLE, DYNAMODB_BASELINES_TABLE, AWS_REGION, ADOPTION_DROP_THRESHOLD, INACTIVITY_THRESHOLD_DAYS, POWER_USER_DAYS_THRESHOLD, POWER_USER_PERCENTILE)
    - Attach IAM role with DynamoDB, CloudWatch, and SSM Parameter Store permissions
    - Set concurrency to 1 to prevent overlapping runs
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 8.1, 8.4_
  
  - [x] 12.4 Create infrastructure/setup-api-gateway.ts
    - Create API Gateway REST API
    - Configure POST endpoint for webhook at /mixpanel-webhook
    - Integrate with webhook Lambda function
    - Enable CORS if needed
    - Deploy to stage
    - _Requirements: Architecture requirements_
  
  - [x] 12.5 Create infrastructure/setup-eventbridge.ts
    - Create EventBridge rule with daily schedule (cron(0 10 * * ? *))
    - Set target to baseline calculator Lambda
    - Configure rule to trigger at 10 AM UTC daily
    - _Requirements: 1.1, 1.2, 2.1, 2.2_
  
  - [x] 12.6 Create infrastructure/README.md
    - Document deployment steps
    - List required AWS permissions
    - Explain environment variable configuration
    - Include Mixpanel webhook setup instructions
    - Add Mixpanel signing secret setup instructions
    - Add troubleshooting guide
    - Document EventBridge schedule configuration
    - Document threshold configuration via SSM Parameter Store
    - _Requirements: Documentation_

- [x] 13. Integration and wiring
  - [x] 13.1 Wire all components together in index.ts
    - Import all modules (event-store, webhook-security, signal-extractor, logger, metrics)
    - Connect handler to all sub-functions
    - Ensure proper error propagation
    - Validate environment variables at startup
    - _Requirements: All webhook requirements_
  
  - [x] 13.2 Wire baseline calculator components in baseline-calculator.ts
    - Import all modules (event-store, logger, metrics)
    - Connect handler to calculation functions
    - Ensure proper error handling for batch processing
    - Validate environment variables at startup
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4_
  
  - [ ]* 13.3 Write integration tests for webhook processing
    - Test end-to-end webhook processing with LocalStack
    - Test complete flow from webhook receipt to DynamoDB storage
    - Test error handling across component boundaries
    - Test usage event creation
    - Test batch event processing
    - _Requirements: All webhook requirements_
  
  - [ ]* 13.4 Write integration tests for baseline calculation
    - Test end-to-end baseline calculation with mocked DynamoDB
    - Test batch processing of multiple user-feature combinations
    - Test drop event creation and storage
    - Test power user identification and storage
    - Test error handling for calculation failures
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4_
  
  - [x] 13.5 Create package.json scripts
    - Add build script for TypeScript compilation
    - Add test script for Vitest
    - Add test:watch script for development
    - Add deploy script for infrastructure deployment
    - Add deploy:webhook script for webhook Lambda only
    - Add deploy:baseline-calculator script for baseline calculator Lambda only
    - _Requirements: Development workflow_

- [x] 14. Final checkpoint - Ensure all tests pass
  - Run all unit tests and property tests
  - Verify error handling works correctly
  - Test both Lambda functions independently
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check (minimum 100 iterations)
- Unit tests validate specific examples and edge cases
- All code follows AWS Free Tier optimization and high reliability standards
- TypeScript is used throughout for type safety
- Infrastructure scripts use AWS SDK v3 for modern API patterns
- Two Lambda functions: webhook processor (event-driven) and baseline calculator (scheduled)
- Two DynamoDB tables: behavioral-signals (events) and usage-baselines (calculated baselines)
- Baseline calculator runs daily to minimize Lambda invocations and stay within Free Tier
- Usage events stored for 90 days to enable historical trend analysis
- Thresholds configurable via SSM Parameter Store for runtime adjustment
