# Implementation Plan: Dynamic ICP Refinement Engine

## Overview

This implementation plan breaks down the Dynamic ICP Refinement Engine into discrete coding tasks. The approach follows a bottom-up strategy: start with data fetching and correlation, build the scoring and masking layers, implement trait analysis with Nova Lite, and finally wire everything together in a Lambda function with EventBridge scheduling. Each step includes property-based tests to validate correctness properties from the design document.

## Tasks

- [x] 1. Set up project structure and core types
  - Create directory structure in `/packages/agent/src/icp-refinement/`
  - Define TypeScript interfaces for all data models (HubSpotCompany, MixpanelCohort, StripeCustomer, CorrelatedCustomer, ScoredCustomer, MaskedCustomer, ICPProfile, ICPAnalysisRecord)
  - Set up fast-check for property-based testing
  - Configure AWS SDK clients (Bedrock Runtime, Bedrock Agent Runtime, DynamoDB, EventBridge)
  - Create configuration interface (EngineConfig) with default values
  - _Requirements: NFR-5, NFR-6, 1.1, 1.2, 1.3_

- [x] 2. Implement data fetching layer
  - [x] 2.1 Create HubSpot API client
    - Write `fetchHubSpotCompanies(userId: string, limit: number): Promise<HubSpotCompany[]>` function
    - Integrate with credential vault using getServiceCredentials(userId, 'hubspot')
    - Use OAuth access tokens with automatic refresh via credential vault
    - Implement pagination handling for large datasets
    - Implement retry logic with exponential backoff (3 attempts)
    - Parse API response into HubSpotCompany interface
    - Handle rate limiting with 1-second delays between batches (100 companies per batch)
    - _Requirements: 1.1, 1.4_
    - _Bugfix: vault-integration-data-fetching (completed)_
  
  - [x] 2.2 Create Mixpanel API client
    - Write `fetchMixpanelCohorts(userId: string, companyIds: string[]): Promise<MixpanelCohort[]>` function
    - Integrate with credential vault using getServiceCredentials(userId, 'mixpanel')
    - Use service account credentials (username + secret) with Basic auth
    - Query Mixpanel for 'Aha! Moment' event counts per company
    - Calculate 30-day retention rate for each company
    - Implement batch processing (50 companies per batch, 500ms delay)
    - Handle missing data gracefully (return null for unavailable companies)
    - _Requirements: 1.2, 1.4_
    - _Bugfix: vault-integration-data-fetching (completed)_
  
  - [x] 2.3 Create Stripe API client
    - Write `fetchStripeCustomers(userId: string, companyIds: string[]): Promise<StripeCustomer[]>` function
    - Integrate with credential vault using getServiceCredentials(userId, 'stripe')
    - Use encrypted API keys retrieved from vault
    - Retrieve subscription status and payment history
    - Identify churn signals (cancelled subscriptions, failed payments)
    - Retrieve MRR for each customer
    - Implement batch processing (100 customers per batch, 1-second delay)
    - Handle missing data gracefully (return null for unavailable companies)
    - _Requirements: 1.3, 1.4_
    - _Bugfix: vault-integration-data-fetching (completed)_
  
  - [x] 2.4 Implement error handling for API failures
    - Wrap all API calls in try-catch blocks
    - Log errors with full context (API name, error message, retry attempt)
    - Handle credential retrieval failures (service not connected)
    - Abort analysis if HubSpot fails after all retries
    - Continue with null values if Mixpanel or Stripe fail
    - Track data completeness metrics
    - _Requirements: 10.1, 10.2_
    - _Bugfix: vault-integration-data-fetching (completed)_
  
  - [x] 2.5 Write unit tests for data fetching
    - Test successful API calls with mock responses
    - Test credential vault integration with mocked getServiceCredentials
    - Test retry logic for transient failures
    - Test batch processing with pagination
    - Test rate limiting delays
    - Test graceful degradation for Mixpanel/Stripe failures
    - Test credential retrieval error handling
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 10.1, 10.2_
    - _Bugfix: vault-integration-data-fetching (completed)_

- [x] 3. Implement data correlation engine
  - [x] 3.1 Create correlation function
    - Write `correlateCustomerData(hubspotCompanies: HubSpotCompany[], mixpanelCohorts: MixpanelCohort[], stripeCustomers: StripeCustomer[]): CorrelatedCustomer[]` function
    - Use HubSpot company ID as primary key
    - Perform left join with Mixpanel and Stripe data
    - Handle missing data with null values
    - _Requirements: 2.1, 2.2_
  
  - [x] 3.2 Implement data completeness tracking
    - Calculate percentage of customers with Mixpanel data
    - Calculate percentage of customers with Stripe data
    - Store completeness metrics in analysis record
    - Log warnings for customers with incomplete data
    - _Requirements: 2.2_
  
  - [x] 3.3 Write property test for correlation completeness
    - **Property 1: Data Correlation Completeness**
    - **Validates: Requirements 2.1**
    - Test that exactly one CorrelatedCustomer is created per HubSpot company
    - Test with various combinations of missing Mixpanel/Stripe data
  
  - [x] 3.4 Write unit tests for correlation logic
    - Test correlation with complete data
    - Test correlation with missing Mixpanel data
    - Test correlation with missing Stripe data
    - Test correlation with both Mixpanel and Stripe missing
    - _Requirements: 2.1, 2.2_

- [x] 4. Checkpoint - Ensure data fetching and correlation tests pass
  - Run all unit tests and property tests for data fetching and correlation
  - Verify error handling works correctly
  - Ensure all tests pass, ask the user if questions arise

- [x] 5. Implement customer scoring engine
  - [x] 5.1 Create normalization functions
    - Write `normalizeLTV(revenue: number, allRevenues: number[]): number` function using percentile ranking
    - Write `normalizeEngagement(eventCount: number, allEventCounts: number[]): number` function using percentile ranking
    - Write `calculateRetentionScore(retentionRate: number, hasChurnSignal: boolean): number` function
    - Ensure all functions return values in [0, 100] range
    - Handle edge cases (all zeros, single customer, NaN/Infinity)
    - _Requirements: 3.1, 3.2, 3.3_
  
  - [x] 5.2 Create scoring function
    - Write `calculateIdealCustomerScore(customer: CorrelatedCustomer, allCustomers: CorrelatedCustomer[]): ScoredCustomer` function
    - Calculate component scores (LTV, engagement, retention)
    - Apply weighted average: LTV (40%), Engagement (30%), Retention (30%)
    - Store score breakdown for transparency
    - Use default values (0) for missing data
    - _Requirements: 3.1, 3.4_
  
  - [ ]* 5.3 Write property test for score normalization bounds
    - **Property 2: Score Normalization Bounds**
    - **Validates: Requirements 3.1, 3.2**
    - Test that all scores (idealCustomerScore, ltvScore, engagementScore, retentionScore) are in [0, 100]
    - Test with various input ranges and edge cases
  
  - [ ]* 5.4 Write property test for score weighting consistency
    - **Property 3: Score Weighting Consistency**
    - **Validates: Requirements 3.1**
    - Test that idealCustomerScore equals weighted sum of component scores
    - Test with various scoring weights that sum to 1.0
  
  - [ ]* 5.5 Write property test for churn signal penalty
    - **Property 8: Churn Signal Penalty**
    - **Validates: Requirements 3.3**
    - Test that customers with churn signals score lower than identical customers without churn
    - Test with various LTV and engagement combinations
  
  - [ ]* 5.6 Write property test for empty data handling
    - **Property 9: Empty Data Handling**
    - **Validates: Requirements 3.1, 3.4**
    - Test that scoring works with missing Mixpanel or Stripe data
    - Test that no errors are thrown for null values
  
  - [x] 5.7 Write unit tests for scoring logic
    - Test specific score calculations with known inputs/outputs
    - Test edge cases (all zeros, single customer, extreme values)
    - Test default value handling for missing data
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 6. Implement top customer selection
  - [x] 6.1 Create percentile selection function
    - Write `selectTopCustomers(customers: ScoredCustomer[], percentile: number): ScoredCustomer[]` function
    - Sort customers by idealCustomerScore descending
    - Select top ceil(N * percentile/100) customers
    - _Requirements: 4.1_
  
  - [x] 6.2 Implement sample size validation
    - Write `validateSampleSize(customers: ScoredCustomer[], minSize: number): void` function
    - Check that dataset contains at least minSize customers
    - Check that top 10% contains at least 5 customers
    - Throw error with diagnostic information if validation fails
    - _Requirements: 4.1, 4.2, 10.3_
  
  - [ ]* 6.3 Write property test for top percentile selection
    - **Property 4: Top Percentile Selection**
    - **Validates: Requirements 4.1**
    - Test that exactly ceil(N * P/100) customers are selected
    - Test with various dataset sizes and percentile thresholds
  
  - [x] 6.4 Write unit tests for selection logic
    - Test selection with various dataset sizes
    - Test sample size validation (pass and fail cases)
    - Test edge cases (exactly 10 customers, 1 customer, 1000 customers)
    - _Requirements: 4.1, 4.2_

- [x] 7. Checkpoint - Ensure scoring and selection tests pass
  - Run all unit tests and property tests for scoring and selection
  - Verify all edge cases are handled correctly
  - Ensure all tests pass, ask the user if questions arise

- [-] 8. Implement data masking layer
  - [x] 8.1 Create masking function
    - Write `maskCustomerData(customers: ScoredCustomer[]): MaskedCustomer[]` function
    - Remove company names (keep industry only)
    - Remove all email addresses using regex
    - Remove personal names and contact information
    - Replace exact revenue with buckets: "<$10K", "$10K-$50K", "$50K-$100K", ">$100K"
    - Replace exact employee counts with ranges: "1-10", "11-50", "51-200", "200+"
    - Keep: companyId, industry, size range, region, aggregated metrics
    - _Requirements: 5.1_
  
  - [x] 8.2 Implement PII detection validation
    - Write `validateNoPII(maskedData: MaskedCustomer[]): boolean` function
    - Run regex checks for email patterns: `/[\w\.-]+@[\w\.-]+\.\w+/g`
    - Run regex checks for phone number patterns
    - Log warning if potential PII detected
    - Throw error if PII validation fails
    - _Requirements: 5.2_
  
  - [x] 8.3 Implement audit trail logging
    - Log count of emails removed
    - Log count of names removed
    - Log count of records masked
    - Never log actual PII values
    - _Requirements: 5.3_
  
  - [ ]* 8.4 Write property test for PII masking completeness
    - **Property 5: PII Masking Completeness**
    - **Validates: Requirements 5.1, 5.2**
    - Test that no email addresses remain in masked data
    - Test that no personal names remain in masked data
    - Test with various PII patterns
  
  - [x] 8.5 Write unit tests for masking logic
    - Test email removal with various email formats
    - Test revenue bucketing with various values
    - Test employee count range conversion
    - Test that required fields are preserved
    - _Requirements: 5.1, 5.2, 5.3_

- [ ] 9. Implement trait analysis engine
  - [x] 9.1 Create prompt construction function
    - Write `constructTraitAnalysisPrompt(topCustomers: MaskedCustomer[], previousICP: ICPProfile | null): string` function
    - Include masked customer data as JSON array
    - Include previous ICP profile if available
    - Request identification of: industries, size range, regions, usage patterns
    - Request reasoning and confidence score
    - Specify JSON output format matching TraitAnalysisOutput interface
    - _Requirements: 6.1, 6.2_
  
  - [-] 9.2 Implement Nova Lite invocation
    - Write `analyzeTraits(topCustomers: MaskedCustomer[], previousICP: ICPProfile | null): Promise<TraitAnalysisOutput>` function
    - Configure BedrockRuntimeClient with region from environment
    - Use InvokeModelCommand with Amazon Nova Lite model ID
    - Parse JSON response into TraitAnalysisOutput interface
    - Implement retry logic (once after 5-second delay)
    - _Requirements: 6.1, 6.3_
  
  - [x] 9.3 Implement fallback heuristic analysis
    - Write `fallbackTraitAnalysis(topCustomers: MaskedCustomer[]): TraitAnalysisOutput` function
    - Calculate mode for industry and region
    - Calculate median for size range
    - Mark analysis as "degraded" in metadata
    - Use if Nova Lite fails after retry
    - _Requirements: 6.4, 10.4_
  
  - [x] 9.4 Implement confidence score handling
    - Check if confidence score < 50
    - Flag analysis as uncertain if low confidence
    - Log low confidence warnings
    - Include confidence warning in ICP profile
    - _Requirements: 6.3, 10.4_
  
  - [ ]* 9.5 Write property test for trait analysis determinism
    - **Property 10: Trait Analysis Determinism**
    - **Validates: Requirements 6.1**
    - Test that identical masked customers produce semantically similar traits
    - Use mocked LLM responses for deterministic testing
  
  - [x] 9.6 Write unit tests for trait analysis
    - Test prompt construction with and without previous ICP
    - Test Nova Lite invocation with mock responses
    - Test fallback analysis logic
    - Test confidence score handling
    - Test retry logic for API failures
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 10. Checkpoint - Ensure masking and trait analysis tests pass
  - Run all unit tests and property tests for masking and trait analysis
  - Verify PII detection works correctly
  - Ensure all tests pass, ask the user if questions arise

- [x] 11. Implement Knowledge Base updater
  - [x] 11.1 Create ICP profile formatting function
    - Write `formatICPProfile(profile: ICPProfile): string` function
    - Format as markdown with metadata header (version, timestamp)
    - Format traits as bullet lists
    - Format reasoning as paragraphs
    - Include confidence score and sample size
    - _Requirements: 7.1, 7.3_
  
  - [x] 11.2 Implement version management
    - Write `getLatestICPVersion(knowledgeBaseId: string): Promise<number>` function
    - Read previous ICP profile from Knowledge Base
    - Extract version number
    - Return 0 if no previous profile exists
    - _Requirements: 7.2_
  
  - [x] 11.3 Create Knowledge Base update function
    - Write `updateICPProfile(profile: ICPProfile, knowledgeBaseId: string): Promise<void>` function
    - Format profile as markdown
    - Write to `icp_profile.md` in Knowledge Base
    - Implement retry logic with exponential backoff (3 attempts)
    - Store pending update in DynamoDB if all retries fail
    - _Requirements: 7.1, 7.2, 10.5_
  
  - [ ]* 11.4 Write property test for ICP profile versioning
    - **Property 6: ICP Profile Versioning**
    - **Validates: Requirements 7.2**
    - Test that version numbers are strictly monotonically increasing
    - Test that no gaps or duplicates exist in version sequence
  
  - [x] 11.5 Write unit tests for Knowledge Base updates
    - Test profile formatting with various inputs
    - Test version increment logic
    - Test retry logic for API failures
    - Test markdown formatting correctness
    - _Requirements: 7.1, 7.2, 7.3, 10.5_

- [x] 12. Implement analysis history store
  - [x] 12.1 Create DynamoDB client wrapper
    - Write `storeAnalysisRecord(record: ICPAnalysisRecord): Promise<void>` function
    - Use ISO timestamp as partition key
    - Store complete analysis record with all fields
    - Implement retry logic (once on failure)
    - Log error but continue if retry fails (non-critical)
    - _Requirements: 8.1, 8.2, 10.6_
  
  - [x] 12.2 Create analysis record builder
    - Write `buildAnalysisRecord(profile: ICPProfile, topCustomerIds: string[], scoreDistribution: object, executionMetrics: object): ICPAnalysisRecord` function
    - Calculate score distribution statistics (min, max, mean, p90)
    - Include execution metrics (duration, customer count, API call count)
    - Generate unique analysis ID from timestamp
    - _Requirements: 8.1, 8.2_
  
  - [ ]* 12.3 Write property test for analysis history persistence
    - **Property 7: Analysis History Persistence**
    - **Validates: Requirements 8.1, 8.2**
    - Test that querying DynamoDB with timestamp returns complete record
    - Test that all fields are populated correctly
  
  - [x] 12.4 Write unit tests for history storage
    - Test successful DynamoDB writes with mock client
    - Test retry logic for write failures
    - Test analysis record building with various inputs
    - Test score distribution calculations
    - _Requirements: 8.1, 8.2, 10.6_

- [x] 13. Checkpoint - Ensure Knowledge Base and history storage tests pass
  - Run all unit tests and property tests for KB updates and history storage
  - Verify version management works correctly
  - Ensure all tests pass, ask the user if questions arise

- [-] 14. Implement main Lambda handler
  - [x] 14.1 Create orchestration function
    - Write `runICPRefinement(userId: string): Promise<void>` function as main entry point
    - Pass userId parameter through to data fetching functions for credential vault integration
    - Orchestrate all steps: fetch → correlate → score → filter → mask → analyze → update → store
    - Track execution time and metrics
    - Implement top-level error handling
    - _Requirements: NFR-1, NFR-3_
    - _Bugfix: vault-integration-data-fetching (userId parameter added)_
  
  - [x] 14.2 Implement batch processing with checkpoints
    - Store checkpoint in DynamoDB if processing > 500 companies
    - Implement resume capability from last checkpoint
    - Use Promise.all for parallel independent API calls
    - _Requirements: 1.4, NFR-1_
  
  - [x] 14.3 Create Lambda handler function
    - Write `handler(event: any): Promise<void>` function
    - Parse EventBridge event or manual invocation to extract userId
    - Call runICPRefinement(userId)
    - Handle errors and return appropriate responses
    - Log invocation type (scheduled vs manual)
    - _Requirements: 9.1, 9.2_
    - _Bugfix: vault-integration-data-fetching (userId extraction added)_
  
  - [ ] 14.4 Implement CloudWatch metrics publishing
    - Publish ICPAnalysisSuccess metric (1 for success, 0 for failure)
    - Publish CustomersAnalyzed metric (count)
    - Publish AnalysisDurationMs metric (execution time)
    - Publish ICPConfidenceScore metric (0-100)
    - Publish metrics even on failure (where applicable)
    - _Requirements: 11.1_
  
  - [ ] 14.5 Implement structured logging
    - Log all operations with correlation ID for tracing
    - Use appropriate log levels: INFO, WARN, ERROR
    - Never log PII in CloudWatch
    - Include execution phase in all logs
    - _Requirements: 11.3_
  
  - [ ] 14.6 Write integration tests for complete flow
    - Test successful end-to-end analysis with mocked AWS services
    - Test graceful degradation with Mixpanel/Stripe failures
    - Test error handling for HubSpot failure
    - Test insufficient sample size handling
    - Test checkpoint and resume logic
    - _Requirements: 10.1, 10.2, 10.3, NFR-1, NFR-3_

- [ ] 15. Configure EventBridge scheduler
  - [ ] 15.1 Create EventBridge schedule
    - Create schedule with "rate(7 days)" expression
    - Configure target as ICP refinement Lambda function
    - Enable schedule by default
    - _Requirements: 9.1_
  
  - [ ] 15.2 Document manual trigger support
    - Document how to invoke Lambda manually via AWS console
    - Document how to invoke Lambda via AWS CLI
    - Document event payload format for manual invocations
    - _Requirements: 9.2_
  
  - [ ] 15.3 Write deployment script or CDK/Terraform config
    - Create infrastructure-as-code for EventBridge schedule
    - Include Lambda function configuration (memory, timeout, environment variables)
    - Include IAM role with required permissions
    - _Requirements: 9.1, NFR-4_

- [ ] 16. Configure environment and IAM
  - [ ] 16.1 Create environment configuration
    - Document required environment variables (AWS_REGION, KNOWLEDGE_BASE_ID, NOVA_MODEL_ID, ANALYSIS_TABLE_NAME, MIN_SAMPLE_SIZE, CREDENTIAL_VAULT_LAMBDA_ARN)
    - Add environment variable validation at startup
    - Create `.env.example` file with placeholder values
    - _Requirements: NFR-4_
    - _Note: API keys (HUBSPOT_API_KEY, MIXPANEL_API_KEY, STRIPE_API_KEY) are now managed by credential vault, not environment variables_
  
  - [ ] 16.2 Configure credential vault integration
    - Document that API credentials are retrieved from credential vault Lambda
    - Document userId requirement for credential retrieval
    - Document credential vault Lambda ARN configuration
    - Document error handling for service not connected scenarios
    - _Requirements: NFR-4_
    - _Bugfix: vault-integration-data-fetching (replaces AWS Secrets Manager integration)_
  
  - [ ] 16.3 Create IAM policy
    - Document required IAM permissions for Lambda execution role
    - Include: bedrock:InvokeModel, bedrock:Retrieve, bedrock:UpdateKnowledgeBase
    - Include: dynamodb:PutItem, dynamodb:GetItem
    - Include: logs:CreateLogGroup, logs:CreateLogStream, logs:PutLogEvents
    - Include: lambda:InvokeFunction (for credential vault Lambda invocation)
    - Create example IAM policy JSON
    - _Requirements: NFR-4_
    - _Bugfix: vault-integration-data-fetching (added lambda:InvokeFunction permission)_

- [ ] 17. Configure CloudWatch alarms
  - [ ] 17.1 Create alarm for analysis failures
    - Create alarm for 2 consecutive analysis failures
    - Configure SNS notification
    - _Requirements: 11.2_
  
  - [ ] 17.2 Create alarm for low confidence
    - Create alarm for confidence score < 50
    - Configure SNS notification
    - _Requirements: 11.2_
  
  - [ ] 17.3 Create alarm for insufficient sample size
    - Create alarm for sample size below minimum
    - Configure SNS notification
    - _Requirements: 11.2_

- [ ] 18. Final checkpoint - Ensure all tests pass and system is deployable
  - Run all unit tests and property tests
  - Run integration tests with mocked AWS services
  - Verify error handling works correctly
  - Verify all CloudWatch metrics are published
  - Verify all logs are structured correctly
  - Test manual Lambda invocation
  - Ensure all tests pass, ask the user if questions arise

- [ ] 19. Deploy and validate
  - [ ] 19.1 Deploy Lambda function to AWS
    - Package Lambda function with dependencies
    - Deploy to AWS using deployment script or CDK/Terraform
    - Verify Lambda configuration (memory, timeout, environment variables)
    - _Requirements: NFR-1, NFR-2_
  
  - [ ] 19.2 Deploy EventBridge schedule
    - Create EventBridge schedule in AWS
    - Verify schedule is enabled
    - Verify target Lambda function is correct
    - _Requirements: 9.1_
  
  - [ ] 19.3 Manual testing checklist
    - Invoke Lambda manually and verify successful execution
    - Monitor Lambda execution time (must stay under 15 minutes)
    - Verify Knowledge Base updates appear in Bedrock console
    - Check CloudWatch logs for errors
    - Validate ICP profile markdown formatting
    - Verify DynamoDB records are created
    - Verify CloudWatch metrics are published
    - Verify CloudWatch alarms are configured correctly
    - _Requirements: NFR-1, NFR-2, NFR-3_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties with minimum 100 iterations each
- Unit tests validate specific examples and edge cases
- All AWS SDK calls must follow error handling patterns from engineering-standards.md
- Lambda function must complete within 15 minutes to stay within timeout limits
- All costs must stay within AWS Free Tier limits
- PII must never be logged or sent to LLM
- All functions should be small (<20 lines) and follow single responsibility principle
- Use JSDoc comments on all functions for maintainability

## Property-Based Test Summary

The following properties from the design document will be validated:

1. **Property 1: Data Correlation Completeness** (Task 3.3)
2. **Property 2: Score Normalization Bounds** (Task 5.3)
3. **Property 3: Score Weighting Consistency** (Task 5.4)
4. **Property 4: Top Percentile Selection** (Task 6.3)
5. **Property 5: PII Masking Completeness** (Task 8.4)
6. **Property 6: ICP Profile Versioning** (Task 11.4)
7. **Property 7: Analysis History Persistence** (Task 12.3)
8. **Property 8: Churn Signal Penalty** (Task 5.5)
9. **Property 9: Empty Data Handling** (Task 5.6)
10. **Property 10: Trait Analysis Determinism** (Task 9.5)

## Deployment Checklist

Before deploying to production:

- [ ] All unit tests pass
- [ ] All property tests pass
- [ ] Integration tests pass with mocked AWS services
- [ ] Environment variables configured in Lambda
- [ ] API keys stored in AWS Secrets Manager
- [ ] IAM role created with correct permissions
- [ ] EventBridge schedule created and enabled
- [ ] CloudWatch alarms configured
- [ ] DynamoDB table created
- [ ] Bedrock Knowledge Base configured
- [ ] Lambda timeout set to 15 minutes
- [ ] Lambda memory set to 1024 MB
- [ ] Manual invocation tested successfully
- [ ] Logs reviewed for errors
- [ ] Metrics published to CloudWatch
- [ ] ICP profile markdown validated
