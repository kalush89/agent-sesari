# Implementation Plan: Relationship Senses HubSpot

## Overview

This implementation plan creates a serverless HubSpot webhook monitoring system that detects critical relationship signals (deal progression, communication gaps, customer sentiment) for B2B SaaS businesses. The system uses AWS Lambda for webhook processing and scheduled gap detection, DynamoDB for event storage, and follows AWS Free Tier optimization principles with high reliability standards.

## Tasks

- [x] 1. Set up project structure and core types
  - Create directory structure at `/packages/lambdas/hubspot-connector`
  - Define TypeScript interfaces for RelationshipSignalEvent, DealProgressionDetails, CommunicationGapDetails, SentimentDetails
  - Set up package.json with dependencies (@hubspot/api-client, aws-sdk, fast-check for testing)
  - Configure TypeScript with strict mode and proper AWS Lambda types
  - Create .env.example file with required environment variables
  - _Requirements: 8.3, 8.4_

- [ ]* 1.1 Write property test for data model validation
  - **Property 18: Event Persistence**
  - **Validates: Requirements 5.1**

- [x] 2. Implement DynamoDB Event Store access layer
  - [x] 2.1 Create event-store.ts with DynamoDB client configuration
    - Initialize DynamoDB DocumentClient with region from environment
    - Implement connection error handling with proper logging
    - _Requirements: 5.1, 8.2, 8.4_
  
  - [x] 2.2 Implement putEvent function
    - Write function to store RelationshipSignalEvent in DynamoDB
    - Add exponential backoff retry logic for write failures
    - Include error handling for throttling and unavailability
    - _Requirements: 5.1, 7.1, 7.5_
  
  - [ ]* 2.3 Write property test for putEvent
    - **Property 18: Event Persistence**
    - **Validates: Requirements 5.1**
  
  - [x] 2.4 Implement eventExists function
    - Write function to check if event ID already exists in DynamoDB
    - Use GetItem operation for fast lookup by primary key
    - Handle conditional check failures gracefully
    - _Requirements: 6.3, 6.4_
  
  - [ ]* 2.5 Write property test for idempotency
    - **Property 22: Idempotent Event Processing**
    - **Property 24: Event ID Uniqueness**
    - **Validates: Requirements 6.1, 6.4**
  
  - [x] 2.6 Implement queryEventsByCompany function
    - Write function to query events by company ID and date range
    - Use GSI (companyId-timestamp-index) for efficient queries
    - Return results ordered by timestamp
    - Ensure query completes within 200ms
    - _Requirements: 5.2, 5.3, 5.5_
  
  - [ ]* 2.7 Write property test for company queries
    - **Property 21: Event Query by Type, Company, Contact, and Date Range**
    - **Validates: Requirements 5.5**
  
  - [x] 2.8 Implement queryEventsByType function
    - Write function to query events by type and date range
    - Filter results by eventType field
    - _Requirements: 5.5_
  
  - [ ]* 2.9 Write property test for type queries
    - **Property 21: Event Query by Type, Company, Contact, and Date Range**
    - **Validates: Requirements 5.5**
  
  - [x] 2.10 Implement queryEventsByContact function
    - Write function to query events by contact ID and date range
    - Support filtering by event type
    - _Requirements: 5.5_
  
  - [ ]* 2.11 Write property test for contact queries
    - **Property 21: Event Query by Type, Company, Contact, and Date Range**
    - **Validates: Requirements 5.5**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement webhook signature verification
  - [x] 4.1 Create webhook-security.ts module
    - Import HubSpot SDK for signature verification
    - Retrieve webhook signing secret from environment variables
    - _Requirements: 4.1, 4.4_
  
  - [x] 4.2 Implement verifyWebhookSignature function
    - Use HubSpot signature verification algorithm (HMAC SHA-256)
    - Check timestamp age (reject if older than 5 minutes)
    - Return boolean indicating verification success
    - _Requirements: 4.1, 4.3_
  
  - [ ]* 4.3 Write property test for signature verification
    - **Property 14: Webhook Signature Verification**
    - **Validates: Requirements 4.1**
  
  - [x] 4.4 Write unit tests for signature verification edge cases
    - Test invalid signature rejection (401 response)
    - Test expired timestamp rejection (>5 minutes)
    - Test valid signature acceptance
    - _Requirements: 4.2, 4.3_
  
  - [ ]* 4.5 Write property test for invalid signature rejection
    - **Property 15: Invalid Signature Rejection**
    - **Validates: Requirements 4.2**
  
  - [ ]* 4.6 Write property test for replay attack prevention
    - **Property 16: Replay Attack Prevention**
    - **Validates: Requirements 4.3**
  
  - [x] 4.7 Implement security logging
    - Log signature verification failures with source IP
    - Log replay attack attempts
    - Include event ID in all security logs
    - _Requirements: 4.5, 9.4_
  
  - [ ]* 4.8 Write property test for security logging
    - **Property 17: Security Failure Logging**
    - **Validates: Requirements 4.5**

- [-] 5. Implement sentiment analysis
  - [x] 5.1 Create sentiment-analyzer.ts module
    - Define positive and negative sentiment keyword lists
    - Implement keyword-based sentiment scoring
    - _Requirements: 3.4_
  
  - [x] 5.2 Implement analyzeSentiment function
    - Parse text and count positive/negative keywords
    - Calculate sentiment score (-1.0 to 1.0)
    - Categorize as positive (>0.3), neutral (-0.3 to 0.3), or negative (<-0.3)
    - Extract first 200 characters as text excerpt
    - Return detected keywords
    - _Requirements: 3.3, 3.4_
  
  - [ ]* 5.3 Write property test for sentiment categorization
    - **Property 12: Sentiment Categorization**
    - **Validates: Requirements 3.4**
  
  - [x] 5.4 Write unit tests for sentiment analysis
    - Test text with positive keywords ("excited", "love", "great")
    - Test text with negative keywords ("frustrated", "disappointed", "cancel")
    - Test text with mixed sentiment
    - Test text with no sentiment keywords (neutral)
    - _Requirements: 3.1, 3.2, 3.4_
  
  - [ ]* 5.5 Write property test for positive sentiment detection
    - **Property 10: Positive Sentiment Detection**
    - **Validates: Requirements 3.2, 3.3**
  
  - [ ]* 5.6 Write property test for negative sentiment detection
    - **Property 9: Negative Sentiment Detection**
    - **Validates: Requirements 3.1, 3.3**

- [x] 6. Implement relationship signal extraction
  - [x] 6.1 Create signal-extractor.ts module
    - Define function to map HubSpot events to relationship signals
    - Implement event type filtering logic
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
  
  - [x] 6.2 Implement extractDealProgressionSignal function
    - Parse deal.propertyChange events for stage changes
    - Detect forward progression vs regression
    - Extract deal value, currency, and deal name
    - Handle "Closed Won" deals with close date
    - Create DealProgressionDetails with all required fields
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  
  - [ ]* 6.3 Write property test for deal progression (forward)
    - **Property 1: Deal Progression Event Creation (Forward)**
    - **Validates: Requirements 1.1, 1.4**
  
  - [ ]* 6.4 Write property test for deal progression (regression)
    - **Property 2: Deal Progression Event Creation (Regression)**
    - **Validates: Requirements 1.2, 1.4**
  
  - [ ]* 6.5 Write property test for closed won deals
    - **Property 3: Closed Won Deal Event**
    - **Validates: Requirements 1.3, 1.4**
  
  - [x] 6.6 Write unit tests for deal progression scenarios
    - Test deal moving from "Qualified" to "Proposal" (forward)
    - Test deal moving from "Proposal" to "Qualified" (regression)
    - Test deal marked as "Closed Won" with value and date
    - Test deal stage change with no actual change (should not create event)
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [x] 6.7 Implement extractSentimentSignal function
    - Parse engagement.created and note.created events
    - Extract text content from note or email body
    - Call analyzeSentiment to get sentiment analysis
    - Determine source type (note, email, call)
    - Create SentimentDetails with all required fields
    - _Requirements: 3.1, 3.2, 3.3_
  
  - [ ]* 6.8 Write property test for sentiment event completeness
    - **Property 11: Sentiment Event Completeness**
    - **Validates: Requirements 3.3**
  
  - [x] 6.9 Write unit tests for sentiment scenarios
    - Test note with text "Customer is frustrated with the product"
    - Test email with text "We're excited to expand our usage"
    - Test note with neutral text
    - Test engagement with no text content
    - _Requirements: 3.1, 3.2, 3.3_
  
  - [x] 6.10 Implement event filtering logic
    - Return null for non-relationship event types
    - Log ignored event types for monitoring
    - Return 200 status for ignored events
    - _Requirements: 10.4, 10.5_
  
  - [ ]* 6.11 Write property test for relationship event processing
    - **Property 35: Relationship Event Type Processing**
    - **Validates: Requirements 10.1, 10.2, 10.3**
  
  - [ ]* 6.12 Write property test for non-relationship event filtering
    - **Property 36: Non-Relationship Event Filtering**
    - **Validates: Requirements 10.4**
  
  - [ ]* 6.13 Write property test for ignored event logging
    - **Property 37: Ignored Event Logging**
    - **Validates: Requirements 10.5**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement webhook Lambda handler
  - [x] 8.1 Create index.ts with main handler function
    - Define handler function with APIGatewayProxyEvent input
    - Return APIGatewayProxyResult with proper status codes
    - _Requirements: 7.2, 7.4_
  
  - [x] 8.2 Implement request parsing and validation
    - Extract webhook payload and signature from event
    - Parse JSON payload with error handling
    - Validate required fields presence
    - _Requirements: 7.4_
  
  - [ ]* 8.3 Write property test for malformed payload handling
    - **Property 29: Malformed Payload Handling**
    - **Validates: Requirements 7.4**
  
  - [x] 8.4 Write unit tests for parsing edge cases
    - Test empty payload
    - Test malformed JSON
    - Test missing company ID
    - Test missing signature header
    - _Requirements: 7.4_
  
  - [x] 8.5 Implement webhook processing orchestration
    - Call verifyWebhookSignature with payload and signature
    - Check eventExists for idempotency
    - Call extractRelationshipSignal to parse event
    - Call storeRelationshipSignal to persist event
    - Return appropriate HTTP status codes (200, 400, 401, 500)
    - Ensure processing completes within 10 seconds
    - _Requirements: 1.5, 2.5, 3.5, 4.2, 6.1, 7.1, 7.2, 7.3_
  
  - [ ]* 8.6 Write property test for deal event storage latency
    - **Property 4: Deal Event Storage Latency**
    - **Validates: Requirements 1.5**
  
  - [ ]* 8.7 Write property test for sentiment event storage latency
    - **Property 13: Sentiment Event Storage Latency**
    - **Validates: Requirements 3.5**
  
  - [ ]* 8.8 Write property test for idempotent processing
    - **Property 22: Idempotent Event Processing**
    - **Property 23: Event ID Deduplication**
    - **Validates: Requirements 6.1, 6.2, 6.3**
  
  - [ ]* 8.9 Write property test for duplicate webhook logging
    - **Property 25: Duplicate Webhook Logging**
    - **Validates: Requirements 6.5**
  
  - [x] 8.10 Implement comprehensive error handling
    - Catch all exceptions at handler level
    - Return 500 for database unavailability
    - Return 500 for unexpected errors
    - Return 400 for parsing errors
    - Return 401 for signature verification failures
    - Log all errors with full context
    - _Requirements: 7.1, 7.2, 7.4_
  
  - [ ]* 8.11 Write property test for database unavailability
    - **Property 26: Database Unavailability Error Handling**
    - **Validates: Requirements 7.1**
  
  - [ ]* 8.12 Write property test for unexpected error handling
    - **Property 27: Unexpected Error Handling**
    - **Validates: Requirements 7.2**
  
  - [ ]* 8.13 Write property test for processing timeout prevention
    - **Property 28: Processing Timeout Prevention**
    - **Validates: Requirements 7.3**
  
  - [ ]* 8.14 Write property test for exponential backoff
    - **Property 30: Exponential Backoff on Write Failures**
    - **Validates: Requirements 7.5**
  
  - [x] 8.15 Write unit tests for error scenarios
    - Test DynamoDB unavailable (500 response)
    - Test DynamoDB throttling with retries
    - Test unhandled exception (500 response)
    - Test timeout warning at 8 seconds
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 9. Implement communication gap detector Lambda
  - [x] 9.1 Create gap-detector.ts with handler function
    - Define handler function with EventBridgeEvent input
    - Configure for daily scheduled execution
    - _Requirements: 2.1, 2.2_
  
  - [x] 9.2 Implement HubSpot API client wrapper
    - Initialize HubSpot client with API key from environment
    - Implement error handling for API failures
    - Implement rate limiting handling with exponential backoff
    - _Requirements: 2.1, 2.2, 7.1_
  
  - [x] 9.3 Implement getActiveDeals function
    - Query HubSpot API for deals in active stages
    - Filter out closed deals
    - Extract deal ID, company ID, contact ID, deal value, and stage
    - _Requirements: 2.1_
  
  - [x] 9.4 Implement getExistingCustomers function
    - Query HubSpot API for contacts marked as customers
    - Extract contact ID, company ID, and customer lifetime value
    - _Requirements: 2.2_
  
  - [x] 9.5 Implement getDaysSinceLastContact function
    - Query HubSpot API for last engagement with contact
    - Calculate days elapsed since last communication
    - Handle contacts with no communication history
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 9.6 Implement calculateImportanceLevel function
    - Determine importance based on deal value or customer lifetime value
    - High: >$10k, Medium: $1k-$10k, Low: <$1k
    - Consider deal stage for active deals
    - _Requirements: 2.4_
  
  - [ ]* 9.7 Write property test for importance level calculation
    - **Property 7: Importance Level Calculation**
    - **Validates: Requirements 2.4**
  
  - [x] 9.8 Write unit tests for importance calculation
    - Test high-value deal ($50k) → high importance
    - Test medium-value deal ($5k) → medium importance
    - Test low-value deal ($500) → low importance
    - Test customer with high lifetime value → high importance
    - _Requirements: 2.4_
  
  - [x] 9.9 Implement createGapEventIfNeeded function
    - Check if days since contact exceeds threshold (14 for deals, 30 for customers)
    - Generate unique event ID for gap events
    - Create CommunicationGapDetails with all required fields
    - Store gap event in DynamoDB
    - _Requirements: 2.1, 2.2, 2.3, 2.5_
  
  - [ ]* 9.10 Write property test for gap detection (active deals)
    - **Property 5: Communication Gap Detection (Active Deals)**
    - **Validates: Requirements 2.1, 2.3**
  
  - [ ]* 9.11 Write property test for gap detection (customers)
    - **Property 6: Communication Gap Detection (Existing Customers)**
    - **Validates: Requirements 2.2, 2.3**
  
  - [ ]* 9.12 Write property test for gap event storage latency
    - **Property 8: Gap Event Storage Latency**
    - **Validates: Requirements 2.5**
  
  - [x] 9.13 Write unit tests for gap detection scenarios
    - Test active deal with 15 days since contact (should create event)
    - Test active deal with 10 days since contact (should not create event)
    - Test customer with 35 days since contact (should create event)
    - Test customer with 20 days since contact (should not create event)
    - Test contact exactly at 14-day threshold
    - _Requirements: 2.1, 2.2_
  
  - [x] 9.14 Implement batch processing logic
    - Process deals and customers in batches to avoid memory issues
    - Continue processing on individual contact failures
    - Log failed contacts for manual review
    - Ensure Lambda completes within 5-minute timeout
    - _Requirements: 7.1, 7.2_
  
  - [x] 9.15 Write unit tests for HubSpot API error handling
    - Test rate limiting with exponential backoff
    - Test API unavailable (skip cycle, log error)
    - Test authentication failure (log critical error)
    - Test individual contact query failure (continue batch)
    - _Requirements: 7.1, 7.2_

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement logging and observability
  - [x] 11.1 Create logger.ts utility module
    - Implement structured logging with JSON format
    - Include event ID in all log entries
    - Support log levels (info, warn, error)
    - Read LOG_LEVEL from environment variables
    - _Requirements: 8.4, 9.4_
  
  - [x] 11.2 Add webhook processing logs
    - Log each processed webhook with event type and duration
    - Log warning when processing exceeds 5 seconds
    - Include HubSpot event ID in all log entries
    - _Requirements: 9.1, 9.4, 9.5_
  
  - [ ]* 11.3 Write property test for webhook processing logging
    - **Property 31: Webhook Processing Logging**
    - **Validates: Requirements 9.1, 9.4**
  
  - [ ]* 11.4 Write property test for processing time warning
    - **Property 34: Processing Time Warning**
    - **Validates: Requirements 9.5**
  
  - [x] 11.5 Add error logging with context
    - Log errors with event ID, event type, error message, and stack trace
    - Log duplicate webhook attempts
    - Log ignored event types
    - _Requirements: 9.3, 9.4, 6.5, 10.5_
  
  - [ ]* 11.6 Write property test for error context logging
    - **Property 33: Error Context Logging**
    - **Validates: Requirements 9.3, 9.4**
  
  - [x] 11.7 Implement CloudWatch metrics emission
    - Create metrics.ts module
    - Emit metric for successful event processing
    - Emit metric for failed event processing
    - Emit metric for processing latency
    - Use AWS SDK PutMetricData for custom metrics
    - _Requirements: 9.2_
  
  - [ ]* 11.8 Write property test for metrics emission
    - **Property 32: Metrics Emission**
    - **Validates: Requirements 9.2**
  
  - [x] 11.9 Add gap detection logging
    - Log start and completion of gap detection runs
    - Log number of deals and customers processed
    - Log number of gap events created
    - Log any API failures or rate limiting events
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 12. Create infrastructure deployment scripts
  - [x] 12.1 Create infrastructure/setup-dynamodb.ts
    - Define DynamoDB table schema with eventId primary key
    - Create GSI for companyId-timestamp-index
    - Configure on-demand billing mode for Free Tier compliance
    - Set TTL for 90-day retention
    - _Requirements: 5.1, 5.2, 5.4, 8.2_
  
  - [x] 12.2 Create infrastructure/deploy-webhook-lambda.ts
    - Package webhook Lambda function with dependencies
    - Configure Lambda with 512MB memory and 10-second timeout
    - Set environment variables (HUBSPOT_WEBHOOK_SECRET, DYNAMODB_TABLE_NAME, AWS_REGION, LOG_LEVEL)
    - Attach IAM role with DynamoDB and CloudWatch permissions
    - _Requirements: 7.3, 8.1, 8.4_
  
  - [x] 12.3 Create infrastructure/deploy-gap-detector-lambda.ts
    - Package gap detector Lambda function with dependencies
    - Configure Lambda with 1024MB memory and 5-minute timeout
    - Set environment variables (HUBSPOT_API_KEY, DYNAMODB_TABLE_NAME, AWS_REGION, DEAL_GAP_THRESHOLD_DAYS, CUSTOMER_GAP_THRESHOLD_DAYS)
    - Attach IAM role with DynamoDB, CloudWatch, and Secrets Manager permissions
    - Set concurrency to 1 to prevent overlapping runs
    - _Requirements: 2.1, 2.2, 8.1, 8.4_
  
  - [x] 12.4 Create infrastructure/setup-api-gateway.ts
    - Create API Gateway REST API
    - Configure POST endpoint for webhook at /hubspot-webhook
    - Integrate with webhook Lambda function
    - Enable CORS if needed
    - Deploy to stage
    - _Requirements: Architecture requirements_
  
  - [x] 12.5 Create infrastructure/setup-eventbridge.ts
    - Create EventBridge rule with daily schedule (cron(0 9 * * ? *))
    - Set target to gap detector Lambda
    - Configure rule to trigger at 9 AM UTC daily
    - _Requirements: 2.1, 2.2_
  
  - [x] 12.6 Create infrastructure/README.md
    - Document deployment steps
    - List required AWS permissions
    - Explain environment variable configuration
    - Include HubSpot webhook setup instructions
    - Add HubSpot API key setup instructions
    - Add troubleshooting guide
    - Document EventBridge schedule configuration
    - _Requirements: Documentation_

- [x] 13. Integration and wiring
  - [x] 13.1 Wire all components together in index.ts
    - Import all modules (event-store, webhook-security, signal-extractor, sentiment-analyzer, logger, metrics)
    - Connect handler to all sub-functions
    - Ensure proper error propagation
    - Validate environment variables at startup
    - _Requirements: All requirements_
  
  - [x] 13.2 Wire gap detector components in gap-detector.ts
    - Import all modules (event-store, logger, metrics)
    - Connect handler to HubSpot API functions
    - Ensure proper error handling for batch processing
    - Validate environment variables at startup
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  
  - [x] 13.3 Write integration tests for webhook processing
    - Test end-to-end webhook processing with LocalStack
    - Test complete flow from webhook receipt to DynamoDB storage
    - Test error handling across component boundaries
    - Test deal progression event creation
    - Test sentiment event creation
    - _Requirements: All webhook requirements_
  
  - [x] 13.4 Write integration tests for gap detection
    - Test end-to-end gap detection with mocked HubSpot API
    - Test batch processing of multiple deals and customers
    - Test gap event creation and storage
    - Test error handling for API failures
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  
  - [x] 13.5 Create package.json scripts
    - Add build script for TypeScript compilation
    - Add test script for Vitest
    - Add test:watch script for development
    - Add deploy script for infrastructure deployment
    - Add deploy:webhook script for webhook Lambda only
    - Add deploy:gap-detector script for gap detector Lambda only
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
- Two Lambda functions: webhook processor (event-driven) and gap detector (scheduled)
- Sentiment analysis uses keyword-based approach to avoid additional AI costs
- Gap detection runs daily to minimize API calls and Lambda invocations
