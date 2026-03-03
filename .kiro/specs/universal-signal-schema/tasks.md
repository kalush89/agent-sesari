# Implementation Plan: Universal Signal Schema

## Overview

This plan implements a normalization layer that translates platform-specific signals (Stripe, HubSpot, Mixpanel) into a unified Universal_Signal format. The implementation follows a bottom-up approach: core types and interfaces first, then translators, entity resolution, storage, and finally the Lambda integration layer.

## Tasks

- [x] 1. Set up project structure and core types
  - Create `packages/lambdas/signal-translator/` directory
  - Define Universal_Signal TypeScript interfaces and types
  - Define UniversalEventType taxonomy and EVENT_TAXONOMY mapping
  - Define NormalizedMetrics and platform-specific detail types
  - Set up package.json with dependencies (AWS SDK v3, fast-check, vitest)
  - Configure vitest.config.ts for testing
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 7.1, 7.2, 7.3_

- [ ]* 1.1 Write property test for Universal_Signal schema completeness
  - **Property 1: Universal Signal Schema Completeness**
  - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7**

- [x] 2. Implement Signal_Translator interface and Stripe translator
  - [x] 2.1 Create Signal_Translator interface with translate(), validate(), and extractCorrelationKeys() methods
    - Write TypeScript interface definition
    - _Requirements: 2.1, 8.2_
  
  - [x] 2.2 Implement StripeSignalTranslator class
    - Implement translate() to convert RevenueSignalEvent to Universal_Signal
    - Implement validate() to check required fields
    - Implement extractCorrelationKeys() to extract customer email/ID
    - Map Stripe event types to universal taxonomy
    - Normalize revenue metrics to standard format
    - Preserve Stripe-specific details in platformDetails
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  
  - [ ]* 2.3 Write property tests for signal translation
    - **Property 2: Signal Translation Preserves Essential Information**
    - **Property 3: Platform IDs Are Correctly Mapped**
    - **Property 4: Metrics Are Normalized to Standard Format**
    - **Property 5: Event Types Map to Universal Taxonomy**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 7.1, 7.2, 7.3, 8.1**
  
  - [x] 2.4 Write unit tests for StripeSignalTranslator
    - Test translation with valid RevenueSignalEvent
    - Test validation with missing required fields
    - Test error handling with malformed input
    - _Requirements: 2.1, 8.4_

- [x] 3. Implement HubSpot and Mixpanel translators
  - [x] 3.1 Implement HubSpotSignalTranslator class
    - Implement translate() to convert RelationshipSignalEvent to Universal_Signal
    - Implement validate() and extractCorrelationKeys()
    - Map HubSpot event types to universal taxonomy
    - Normalize relationship metrics
    - Preserve HubSpot-specific details
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  
  - [x] 3.2 Implement MixpanelSignalTranslator class
    - Implement translate() to convert BehavioralSignalEvent to Universal_Signal
    - Implement validate() and extractCorrelationKeys()
    - Map Mixpanel event types to universal taxonomy
    - Normalize behavioral metrics
    - Preserve Mixpanel-specific details
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  
  - [ ]* 3.3 Write property tests for HubSpot and Mixpanel translators
    - Test Property 2, 3, 4, 5 for both platforms
    - **Validates: Requirements 3.1-3.5, 4.1-4.5, 8.1**
  
  - [x] 3.4 Write unit tests for HubSpot and Mixpanel translators
    - Test translation with valid signals
    - Test validation and error handling
    - _Requirements: 3.1, 4.1, 8.4_

- [x] 4. Checkpoint - Ensure all translator tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Entity_Resolver for cross-platform entity matching
  - [x] 5.1 Create EntityMapping interface and Entity_Resolver interface
    - Define EntityMapping type with primaryKey, alternateKeys, platformIds
    - Define Entity_Resolver interface with resolve(), getByPrimaryKey(), updateMapping()
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [x] 5.2 Implement DynamoDBEntityResolver class
    - Implement resolve() to match entities using correlation keys
    - Use email as primary key when available, fallback to alternative identifiers
    - Implement getByPrimaryKey() to retrieve mappings
    - Implement updateMapping() to add platform IDs
    - Handle partial platform coverage (entities in some platforms but not others)
    - Set confidence level based on correlation key quality
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [ ]* 5.3 Write property tests for entity resolution
    - **Property 6: Entity Resolution Uses Email as Primary Key**
    - **Property 7: Entity Resolution Falls Back to Alternative Identifiers**
    - **Property 8: Entity Mappings Round-Trip Through Storage**
    - **Property 9: Entity Mappings Support Partial Platform Coverage**
    - **Property 10: Multiple Correlation Keys Resolve to Same Entity**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
  
  - [x] 5.4 Write unit tests for DynamoDBEntityResolver
    - Test email-based resolution
    - Test fallback to alternative identifiers
    - Test conflicting mappings
    - Test partial platform coverage
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 6. Implement Signal_Store for DynamoDB operations
  - [x] 6.1 Create Signal_Store interface and DynamoDBSignalStore class
    - Define Signal_Store interface with store(), getByEntity(), getByType(), getByCategory()
    - Define QueryOptions interface
    - Implement DynamoDBSignalStore with all methods
    - Calculate TTL based on SIGNAL_TTL_DAYS environment variable
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [x] 6.2 Implement DynamoDB key construction and query logic
    - Construct PK as entity#{primaryKey}, SK as signal#{timestamp}#{signalId}
    - Construct GSI1PK as type#{eventType}, GSI1SK as timestamp#{signalId}
    - Construct GSI2PK as category#{category}, GSI2SK as timestamp#{signalId}
    - Implement query methods with time range filtering
    - _Requirements: 6.2, 6.3, 6.4_
  
  - [ ]* 6.3 Write property tests for signal storage
    - **Property 11: Signal Storage and Retrieval Round-Trip**
    - **Property 12: Signals Can Be Retrieved by Type**
    - **Property 13: Signals Can Be Retrieved by Time Range**
    - **Property 14: Signals Have Valid TTL**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
  
  - [x] 6.4 Write unit tests for DynamoDBSignalStore
    - Test storing and retrieving signals
    - Test querying by entity, type, and time range
    - Test TTL calculation
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 7. Checkpoint - Ensure all core component tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement Lambda function for signal translation
  - [x] 8.1 Create Lambda handler for DynamoDB Stream processing
    - Create index.ts with Lambda handler function
    - Parse DynamoDB Stream records
    - Determine source platform from stream ARN or table name
    - Instantiate appropriate Signal_Translator
    - Call Entity_Resolver to get/create entity mapping
    - Construct Universal_Signal with entity mapping
    - Write to UniversalSignals table via Signal_Store
    - Log translation metrics (success/failure counts)
    - _Requirements: 2.1, 3.1, 4.1, 5.1, 6.1_
  
  - [x] 8.2 Implement error handling and validation
    - Validate signals before translation
    - Log failed translations with original signal
    - Handle partial batch failures
    - Continue processing on individual signal failures
    - _Requirements: 8.2, 8.3, 8.5_
  
  - [ ]* 8.3 Write property tests for validation
    - **Property 15: Translation Validates Required Fields**
    - **Property 16: Malformed Signals Are Rejected**
    - **Validates: Requirements 8.2, 8.5**
  
  - [x] 8.4 Write unit tests for Lambda handler
    - Test processing DynamoDB Stream records
    - Test error handling with invalid signals
    - Test partial batch failures
    - _Requirements: 8.2, 8.3, 8.4_

- [x] 9. Create infrastructure setup scripts
  - [x] 9.1 Create setup-dynamodb.ts for table creation
    - Create UniversalSignals table with PK, SK, GSI1, GSI2, TTL
    - Create EntityMappings table with PK, SK, GSI1
    - Configure on-demand billing for Free Tier compliance
    - _Requirements: 6.1, 6.5_
  
  - [x] 9.2 Create deploy-lambda.ts for Lambda deployment
    - Package Lambda function with dependencies
    - Deploy with environment variables (table names, TTL days)
    - Configure DynamoDB Stream triggers from connector tables
    - Set up CloudWatch Logs
    - _Requirements: 2.1, 3.1, 4.1_
  
  - [x] 9.3 Create infrastructure README.md
    - Document setup steps
    - Document environment variables
    - Document DynamoDB Stream configuration
    - _Requirements: All_

- [x] 10. Write integration tests for end-to-end flow
  - Test complete flow from platform signal to Universal_Signal storage
  - Test cross-platform entity resolution
  - Test querying signals by entity across platforms
  - _Requirements: 2.1, 3.1, 4.1, 5.1, 6.1_

- [x] 11. Create fast-check arbitraries for property tests
  - [x] 11.1 Create signal-generators.ts with arbitraries
    - Implement revenueSignalArbitrary() for RevenueSignalEvent
    - Implement relationshipSignalArbitrary() for RelationshipSignalEvent
    - Implement behavioralSignalArbitrary() for BehavioralSignalEvent
    - Implement universalSignalArbitrary() for Universal_Signal
    - Implement malformedSignalArbitrary() for invalid signals
    - _Requirements: 8.1, 8.5_
  
  - [x] 11.2 Create entity-generators.ts with arbitraries
    - Implement entityMappingArbitrary() for EntityMapping
    - Implement correlationKeysArbitrary() for correlation key arrays
    - Implement partialEntityMappingArbitrary() for partial mappings
    - _Requirements: 5.1, 5.2, 5.4_

- [x] 12. Final checkpoint - Ensure all tests pass
  - Run all unit tests and property tests
  - Verify all 16 properties pass with 100+ iterations
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- All property tests must run with minimum 100 iterations
- Each property test must reference its design document property number in a comment
- The Lambda function integrates with existing connectors via DynamoDB Streams
- Infrastructure must comply with AWS Free Tier limits (on-demand DynamoDB, serverless Lambda)
- TypeScript is used throughout for type safety and AWS SDK v3 compatibility
