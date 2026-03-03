# Implementation Plan: Revenue Senses Stripe

## Overview

This implementation plan creates a serverless Stripe webhook monitoring system that detects critical revenue signals (expansion, churn, failed payments) for B2B SaaS businesses. The system uses AWS Lambda for webhook processing, DynamoDB for event storage, and follows AWS Free Tier optimization principles with high reliability standards.

## Tasks

- [x] 1. Set up project structure and core types
  - Create directory structure at `/packages/lambdas/stripe-connector`
  - Define TypeScript interfaces for RevenueSignalEvent, ExpansionDetails, ChurnDetails, FailedPaymentDetails
  - Set up package.json with dependencies (aws-sdk, stripe, fast-check for testing)
  - Configure TypeScript with strict mode and proper AWS Lambda types
  - Create .env.example file with required environment variables
  - _Requirements: 8.3, 8.4_

- [ ]* 1.1 Write property test for data model validation
  - **Property 9: Event Persistence**
  - **Validates: Requirements 5.1**

- [x] 2. Implement DynamoDB Event Store access layer
  - [x] 2.1 Create event-store.ts with DynamoDB client configuration
    - Initialize DynamoDB DocumentClient with region from environment
    - Implement connection error handling with proper logging
    - _Requirements: 5.1, 8.2, 8.4_
  
  - [x] 2.2 Implement putEvent function
    - Write function to store RevenueSignalEvent in DynamoDB
    - Add exponential backoff retry logic for write failures
    - Include error handling for throttling and unavailability
    - _Requirements: 5.1, 7.1, 7.5_
  
  - [ ]* 2.3 Write property test for putEvent
    - **Property 9: Event Persistence**
    - **Validates: Requirements 5.1**
  
  - [x] 2.4 Implement eventExists function
    - Write function to check if event ID already exists in DynamoDB
    - Use GetItem operation for fast lookup by primary key
    - Handle conditional check failures gracefully
    - _Requirements: 6.3, 6.4_
  
  - [ ]* 2.5 Write property test for idempotency
    - **Property 12: Idempotent Event Processing**
    - **Property 13: Event ID Uniqueness**
    - **Validates: Requirements 6.1, 6.4**
  
  - [x] 2.6 Implement queryEventsByCustomer function
    - Write function to query events by customer ID and date range
    - Use GSI (customerId-timestamp-index) for efficient queries
    - Return results ordered by timestamp
    - _Requirements: 5.2, 5.3, 5.5_
  
  - [ ]* 2.7 Write property test for customer queries
    - **Property 10: Event Query by Customer and Date Range**
    - **Validates: Requirements 5.5**
  
  - [x] 2.8 Implement queryEventsByType function
    - Write function to query events by type and date range
    - Filter results by eventType field
    - _Requirements: 5.5_
  
  - [ ]* 2.9 Write property test for type queries
    - **Property 11: Event Query by Type**
    - **Validates: Requirements 5.5**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement webhook signature verification
  - [x] 4.1 Create webhook-security.ts module
    - Import Stripe SDK for signature verification
    - Retrieve webhook signing secret from environment variables
    - _Requirements: 4.1, 4.4_
  
  - [x] 4.2 Implement verifyWebhookSignature function
    - Use Stripe.webhooks.constructEvent for signature verification
    - Check timestamp age (reject if older than 5 minutes)
    - Return boolean indicating verification success
    - _Requirements: 4.1, 4.3_
  
  - [ ]* 4.3 Write property test for signature verification
    - **Property 5: Webhook Signature Verification**
    - **Validates: Requirements 4.1**
  
  - [x] 4.4 Write unit tests for signature verification edge cases
    - Test invalid signature rejection (401 response)
    - Test expired timestamp rejection (>5 minutes)
    - Test valid signature acceptance
    - _Requirements: 4.2, 4.3_
  
  - [ ]* 4.5 Write property test for invalid signature rejection
    - **Property 6: Invalid Signature Rejection**
    - **Validates: Requirements 4.2**
  
  - [ ]* 4.6 Write property test for replay attack prevention
    - **Property 7: Replay Attack Prevention**
    - **Validates: Requirements 4.3**
  
  - [x] 4.7 Implement security logging
    - Log signature verification failures with source IP
    - Log replay attack attempts
    - Include event ID in all security logs
    - _Requirements: 4.5, 9.4_
  
  - [ ]* 4.8 Write property test for security logging
    - **Property 8: Security Failure Logging**
    - **Validates: Requirements 4.5**

- [x] 5. Implement revenue signal extraction
  - [x] 5.1 Create signal-extractor.ts module
    - Define function to map Stripe events to revenue signals
    - Implement event type filtering logic
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
  
  - [x] 5.2 Implement extractExpansionSignal function
    - Parse customer.subscription.updated events
    - Detect plan upgrades, quantity increases, and additional products
    - Calculate old MRR and new MRR from subscription data
    - Create ExpansionDetails with change type and specifics
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  
  - [ ]* 5.3 Write property test for expansion event creation
    - **Property 1: Expansion Event Creation**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
  
  - [x] 5.4 Write unit tests for expansion scenarios
    - Test plan upgrade from $99 to $199
    - Test quantity increase from 5 to 10 seats
    - Test additional product addition
    - Test subscription update with no MRR change (should not create event)
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [x] 5.5 Implement extractChurnSignal function
    - Parse customer.subscription.deleted events
    - Distinguish between immediate and end-of-period cancellations
    - Extract cancellation reason if provided
    - Calculate MRR lost from subscription data
    - Create ChurnDetails with cancellation type and reason
    - _Requirements: 2.1, 2.2, 2.3, 2.5_
  
  - [ ]* 5.6 Write property test for churn event creation
    - **Property 2: Churn Event Creation**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.5**
  
  - [x] 5.7 Write unit tests for churn scenarios
    - Test immediate cancellation
    - Test end-of-period cancellation
    - Test cancellation with reason "too_expensive"
    - Test cancellation without reason
    - _Requirements: 2.1, 2.2, 2.3, 2.5_
  
  - [x] 5.8 Implement extractFailedPaymentSignal function
    - Parse invoice.payment_failed events
    - Categorize failure reasons (card_declined, expired_card, insufficient_funds, other)
    - Extract failure code and attempt count
    - Calculate next retry timestamp if available
    - Create FailedPaymentDetails with categorized failure
    - _Requirements: 3.1, 3.2, 3.3, 3.5_
  
  - [ ]* 5.9 Write property test for failed payment event creation
    - **Property 3: Failed Payment Event Creation**
    - **Validates: Requirements 3.1, 3.2, 3.3**
  
  - [ ]* 5.10 Write property test for multiple payment failures
    - **Property 4: Multiple Payment Failures**
    - **Validates: Requirements 3.5**
  
  - [x] 5.11 Write unit tests for failed payment scenarios
    - Test card_declined failure
    - Test expired_card failure
    - Test insufficient_funds failure
    - Test unknown failure code (categorized as "other")
    - Test multiple retry attempts for same subscription
    - _Requirements: 3.1, 3.2, 3.3, 3.5_
  
  - [x] 5.12 Implement event filtering logic
    - Return null for non-revenue event types
    - Log ignored event types for monitoring
    - Return 200 status for ignored events
    - _Requirements: 10.4, 10.5_
  
  - [ ]* 5.13 Write property test for revenue event processing
    - **Property 21: Revenue Event Type Processing**
    - **Validates: Requirements 10.1, 10.2, 10.3**
  
  - [ ]* 5.14 Write property test for non-revenue event filtering
    - **Property 22: Non-Revenue Event Filtering**
    - **Validates: Requirements 10.4**
  
  - [ ]* 5.15 Write property test for ignored event logging
    - **Property 23: Ignored Event Logging**
    - **Validates: Requirements 10.5**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement Lambda handler and orchestration
  - [x] 7.1 Create index.ts with main handler function
    - Define handler function with APIGatewayProxyEvent input
    - Return APIGatewayProxyResult with proper status codes
    - _Requirements: 7.2, 7.4_
  
  - [x] 7.2 Implement request parsing and validation
    - Extract webhook payload and signature from event
    - Parse JSON payload with error handling
    - Validate required fields presence
    - _Requirements: 7.4_
  
  - [ ]* 7.3 Write property test for malformed payload handling
    - **Property 17: Malformed Payload Handling**
    - **Validates: Requirements 7.4**
  
  - [x] 7.4 Write unit tests for parsing edge cases
    - Test empty payload
    - Test malformed JSON
    - Test missing customer ID
    - Test missing signature header
    - _Requirements: 7.4_
  
  - [x] 7.5 Implement webhook processing orchestration
    - Call verifyWebhookSignature with payload and signature
    - Check eventExists for idempotency
    - Call extractRevenueSignal to parse event
    - Call storeRevenueSignal to persist event
    - Return appropriate HTTP status codes (200, 400, 401, 500)
    - _Requirements: 1.5, 2.4, 3.4, 4.2, 6.1, 7.1, 7.2_
  
  - [ ]* 7.6 Write property test for idempotent processing
    - **Property 12: Idempotent Event Processing**
    - **Validates: Requirements 6.1**
  
  - [ ]* 7.7 Write property test for duplicate webhook logging
    - **Property 14: Duplicate Webhook Logging**
    - **Validates: Requirements 6.5**
  
  - [x] 7.8 Implement comprehensive error handling
    - Catch all exceptions at handler level
    - Return 500 for database unavailability
    - Return 500 for unexpected errors
    - Return 400 for parsing errors
    - Return 401 for signature verification failures
    - Log all errors with full context
    - _Requirements: 7.1, 7.2, 7.4_
  
  - [ ]* 7.9 Write property test for database unavailability
    - **Property 15: Database Unavailability Error Handling**
    - **Validates: Requirements 7.1**
  
  - [ ]* 7.10 Write property test for unexpected error handling
    - **Property 16: Unexpected Error Handling**
    - **Validates: Requirements 7.2**
  
  - [x] 7.11 Write unit tests for error scenarios
    - Test DynamoDB unavailable (500 response)
    - Test DynamoDB throttling with retries
    - Test unhandled exception (500 response)
    - Test timeout warning at 8 seconds
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 8. Implement logging and observability
  - [x] 8.1 Create logger.ts utility module
    - Implement structured logging with JSON format
    - Include event ID in all log entries
    - Support log levels (info, warn, error)
    - Read LOG_LEVEL from environment variables
    - _Requirements: 8.4, 9.4_
  
  - [x] 8.2 Add webhook processing logs
    - Log each processed webhook with event type and duration
    - Log warning when processing exceeds 5 seconds
    - Include Stripe event ID in all log entries
    - _Requirements: 9.1, 9.4, 9.5_
  
  - [ ]* 8.3 Write property test for webhook processing logging
    - **Property 18: Webhook Processing Logging**
    - **Validates: Requirements 9.1, 9.4**
  
  - [x] 8.4 Add error logging with context
    - Log errors with event ID, event type, error message, and stack trace
    - Log duplicate webhook attempts
    - Log ignored event types
    - _Requirements: 9.3, 9.4, 6.5, 10.5_
  
  - [ ]* 8.5 Write property test for error context logging
    - **Property 20: Error Context Logging**
    - **Validates: Requirements 9.3, 9.4**
  
  - [x] 8.6 Implement CloudWatch metrics emission
    - Emit metric for successful event processing
    - Emit metric for failed event processing
    - Emit metric for processing latency
    - Use AWS SDK PutMetricData for custom metrics
    - _Requirements: 9.2_
  
  - [ ]* 8.7 Write property test for metrics emission
    - **Property 19: Metrics Emission**
    - **Validates: Requirements 9.2**

- [x] 9. Create infrastructure deployment scripts
  - [x] 9.1 Create infrastructure/setup-dynamodb.ts
    - Define DynamoDB table schema with eventId primary key
    - Create GSI for customerId-timestamp-index
    - Configure on-demand billing mode for Free Tier compliance
    - Set TTL for 90-day retention
    - _Requirements: 5.1, 5.2, 5.4, 8.2_
  
  - [x] 9.2 Create infrastructure/deploy-lambda.ts
    - Package Lambda function with dependencies
    - Configure Lambda with 512MB memory and 10-second timeout
    - Set environment variables (STRIPE_WEBHOOK_SECRET, DYNAMODB_TABLE_NAME, AWS_REGION, LOG_LEVEL)
    - Attach IAM role with DynamoDB and CloudWatch permissions
    - _Requirements: 7.3, 8.1, 8.4_
  
  - [x] 9.3 Create infrastructure/setup-api-gateway.ts
    - Create API Gateway REST API
    - Configure POST endpoint for webhook
    - Integrate with Lambda function
    - Enable CORS if needed
    - Deploy to stage
    - _Requirements: Architecture requirements_
  
  - [x] 9.4 Create infrastructure/README.md
    - Document deployment steps
    - List required AWS permissions
    - Explain environment variable configuration
    - Include Stripe webhook setup instructions
    - Add troubleshooting guide
    - _Requirements: Documentation_

- [x] 10. Integration and wiring
  - [x] 10.1 Wire all components together in index.ts
    - Import all modules (event-store, webhook-security, signal-extractor, logger)
    - Connect handler to all sub-functions
    - Ensure proper error propagation
    - Validate environment variables at startup
    - _Requirements: All requirements_
  
  - [x] 10.2 Write integration tests
    - Test end-to-end webhook processing with LocalStack
    - Test complete flow from webhook receipt to DynamoDB storage
    - Test error handling across component boundaries
    - _Requirements: All requirements_
  
  - [x] 10.3 Create package.json scripts
    - Add build script for TypeScript compilation
    - Add test script for Vitest
    - Add test:watch script for development
    - Add deploy script for infrastructure deployment
    - _Requirements: Development workflow_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check
- Unit tests validate specific examples and edge cases
- All code follows AWS Free Tier optimization and high reliability standards
- TypeScript is used throughout for type safety
- Infrastructure scripts use AWS SDK v3 for modern API patterns
