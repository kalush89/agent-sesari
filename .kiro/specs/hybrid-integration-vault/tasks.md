# Implementation Plan: Hybrid Integration Vault

## Overview

This implementation plan breaks down the Hybrid Integration Vault into discrete coding tasks. The vault handles three authentication patterns (OAuth 2.0, API keys, and service accounts) with field-level KMS encryption and DynamoDB storage. The implementation follows a bottom-up approach: shared utilities first, then service-specific handlers, then API routes, and finally UI integration.

## Tasks

- [x] 1. Set up project structure and shared utilities
  - Create Lambda function directories under `/packages/lambdas/credential-vault/`
  - Create shared TypeScript types for credential records and payloads
  - Set up package.json with AWS SDK v3 dependencies
  - Configure TypeScript compiler options for Lambda deployment
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [-] 2. Implement KMS encryption/decryption module
  - [x] 2.1 Create encryption utility functions
    - Implement `encryptCredential()` function using AWS KMS EncryptCommand
    - Implement `decryptCredential()` function using AWS KMS DecryptCommand
    - Add proper error handling for KMS failures
    - Return Base64 encoded ciphertext from encryption
    - _Requirements: 2.1, 2.2, 2.4, 2.5_
  
  - [ ]* 2.2 Write property test for encryption round-trip preservation
    - **Property 1: Encryption Round-Trip Preservation**
    - **Validates: Requirements 2.1, 2.2**
  
  - [ ]* 2.3 Write property test for encrypted payload completeness
    - **Property 3: Encrypted Payload Completeness**
    - **Validates: Requirements 1.2, 1.3, 1.4**

- [ ] 3. Implement DynamoDB storage operations
  - [ ] 3.1 Create storage utility functions
    - Implement `storeCredential()` with PutItem operation
    - Implement `getCredential()` with GetItem operation
    - Implement `updateCredential()` with UpdateItem operation
    - Implement `deleteCredential()` with DeleteItem operation
    - Add retry logic with exponential backoff for DynamoDB failures
    - _Requirements: 1.1, 1.5, 9.1_
  
  - [ ]* 3.2 Write property test for credential uniqueness per user-service pair
    - **Property 2: Credential Uniqueness Per User-Service Pair**
    - **Validates: Requirements 1.5**
  
  - [ ]* 3.3 Write property test for DynamoDB payload size limit
    - **Property 10: DynamoDB Payload Size Limit**
    - **Validates: Requirements 10.5**
  
  - [ ]* 3.4 Write unit tests for DynamoDB operations
    - Test successful store, retrieve, update, delete operations
    - Test retry logic on transient failures
    - Test error handling for permanent failures
    - _Requirements: 9.1_

- [ ] 4. Implement credential masking utilities
  - [ ] 4.1 Create masking functions
    - Implement `maskCredential()` to show only last 4 characters
    - Implement `generateMaskedDisplay()` for different credential types
    - Apply masking only to sensitive fields (api_key, secret, refresh_token)
    - _Requirements: 4.5, 5.5, 7.1, 7.2, 7.3, 7.4_
  
  - [ ]* 4.2 Write property test for credential masking consistency
    - **Property 6: Credential Masking Consistency**
    - **Validates: Requirements 7.1, 7.2**
  
  - [ ]* 4.3 Write property test for selective field masking
    - **Property 7: Selective Field Masking**
    - **Validates: Requirements 7.3, 7.4**

- [ ] 5. Implement Stripe API key validation
  - [ ] 5.1 Create Stripe validation Lambda function
    - Implement format validation using regex pattern `sk_(test|live)_[a-zA-Z0-9]+`
    - Implement smoke test by calling Stripe account retrieval endpoint
    - Add 5-second timeout using AbortSignal
    - Encrypt and store valid credentials using KMS and DynamoDB utilities
    - Return descriptive error messages for validation failures
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 6.1, 6.3, 6.4, 6.5_
  
  - [ ]* 5.2 Write property test for Stripe key format validation
    - **Property 4: Stripe Key Format Validation**
    - **Validates: Requirements 4.1**
  
  - [ ]* 5.3 Write unit tests for Stripe validation
    - Test valid test and live keys
    - Test invalid formats
    - Test smoke test failures (401, 403, 5xx)
    - Test timeout scenarios
    - _Requirements: 4.4, 6.4, 6.5_

- [ ] 6. Implement Mixpanel service account validation
  - [ ] 6.1 Create Mixpanel validation Lambda function
    - Implement non-empty validation for username and secret
    - Implement smoke test by calling Mixpanel engage endpoint with Basic auth
    - Add 5-second timeout using AbortSignal
    - Encrypt and store valid credentials using KMS and DynamoDB utilities
    - Return descriptive error messages for validation failures
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.2, 6.3, 6.4, 6.5_
  
  - [ ]* 6.2 Write property test for Mixpanel credential non-empty validation
    - **Property 5: Mixpanel Credential Non-Empty Validation**
    - **Validates: Requirements 5.1**
  
  - [ ]* 6.3 Write unit tests for Mixpanel validation
    - Test valid credentials
    - Test empty username or secret
    - Test smoke test failures
    - Test timeout scenarios
    - _Requirements: 5.4, 6.4, 6.5_

- [ ] 7. Checkpoint - Ensure validation tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Implement HubSpot OAuth flow
  - [ ] 8.1 Create CSRF state token management
    - Implement `generateStateToken()` with HMAC signature
    - Implement `validateStateToken()` with signature verification and timestamp check
    - Ensure state tokens expire after 10 minutes
    - _Requirements: 3.1, 3.5_
  
  - [ ] 8.2 Create OAuth Handler Lambda function
    - Implement `generateAuthorizationURL()` to redirect to HubSpot
    - Implement `handleOAuthCallback()` to exchange authorization code for tokens
    - Store refresh_token, access_token, and token_expiry in encrypted format
    - Handle OAuth error parameters (access_denied, etc.)
    - _Requirements: 3.1, 3.2, 3.3, 3.5_
  
  - [ ] 8.3 Implement token refresh logic
    - Implement `refreshAccessToken()` to get new access token using refresh token
    - Update stored credential with new access_token and token_expiry
    - Handle refresh failures gracefully
    - _Requirements: 3.4_
  
  - [ ]* 8.4 Write unit tests for OAuth flow
    - Test authorization URL generation
    - Test successful token exchange
    - Test OAuth error handling
    - Test token refresh logic
    - Test state token validation
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 9. Implement credential retrieval for agent use
  - [ ] 9.1 Create Retrieval Lambda function
    - Implement `getCredentials()` to retrieve and decrypt credentials
    - Check if OAuth access_token is expired and trigger refresh if needed
    - Return decrypted credential data to agent
    - Return error if service is not connected
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [ ]* 9.2 Write property test for expired token refresh trigger
    - **Property 8: Expired Token Refresh Trigger**
    - **Validates: Requirements 3.4, 8.3**
  
  - [ ]* 9.3 Write unit tests for credential retrieval
    - Test successful retrieval for all credential types
    - Test automatic token refresh for expired OAuth tokens
    - Test error when service not connected
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 10. Implement error handling and security
  - [ ] 10.1 Create error types and sanitization utilities
    - Define `CredentialError` class with error codes
    - Implement `sanitizeErrorMessage()` to remove sensitive data from errors
    - Implement `getErrorMessageForStatus()` for HTTP status code mapping
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_
  
  - [ ]* 10.2 Write property test for error message PII exclusion
    - **Property 9: Error Message PII Exclusion**
    - **Validates: Requirements 9.5**
  
  - [ ]* 10.3 Write unit tests for error handling
    - Test KMS encryption/decryption failures
    - Test DynamoDB operation failures
    - Test validation timeout errors
    - Test OAuth failures
    - Verify no sensitive data in error messages or logs
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 11. Checkpoint - Ensure core Lambda functions work
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Create Next.js API routes for credential management
  - [ ] 12.1 Implement Stripe connection API route
    - Create POST `/api/integrations/connect/stripe` route
    - Authenticate user using session
    - Invoke Validation Lambda with user_id and api_key
    - Return success with masked_value or error message
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  
  - [ ] 12.2 Implement Mixpanel connection API route
    - Create POST `/api/integrations/connect/mixpanel` route
    - Authenticate user using session
    - Invoke Validation Lambda with user_id, username, and secret
    - Return success with masked_value or error message
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [ ] 12.3 Implement HubSpot OAuth API routes
    - Create GET `/api/integrations/oauth/hubspot/authorize` route to initiate OAuth
    - Create GET `/api/integrations/oauth/hubspot/callback` route to handle callback
    - Generate and validate CSRF state tokens
    - Invoke OAuth Handler Lambda for token exchange
    - _Requirements: 3.1, 3.2, 3.3, 3.5_
  
  - [ ] 12.4 Implement list integrations API route
    - Create GET `/api/integrations/list` route
    - Query DynamoDB for all user credentials
    - Return list with masked values for display
    - _Requirements: 7.5_
  
  - [ ] 12.5 Implement disconnect API route
    - Create DELETE `/api/integrations/disconnect/:serviceName` route
    - Authenticate user using session
    - Delete credential from DynamoDB
    - Return success confirmation
    - _Requirements: 1.5_
  
  - [ ]* 12.6 Write integration tests for API routes
    - Test all routes with mocked Lambda invocations
    - Test authentication failures
    - Test error responses
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3_

- [ ] 13. Create infrastructure setup scripts
  - [ ] 13.1 Create DynamoDB table setup script
    - Write script to create `sesari-credentials` table
    - Configure composite primary key (user_id + service_name)
    - Set billing mode to PAY_PER_REQUEST for Free Tier compliance
    - _Requirements: 1.1, 1.5, 10.1, 10.2_
  
  - [ ] 13.2 Create KMS key setup script
    - Write script to create customer-managed KMS key
    - Create alias `alias/sesari-credential-vault`
    - Configure key policy for Lambda execution roles
    - _Requirements: 2.3, 10.3_
  
  - [ ] 13.3 Create IAM role and policy setup script
    - Write script to create Lambda execution role
    - Attach policies for KMS encrypt/decrypt operations
    - Attach policies for DynamoDB operations
    - Attach policies for CloudWatch logging
    - _Requirements: 2.3, 10.1, 10.2, 10.3_
  
  - [ ] 13.4 Create Lambda deployment script
    - Write script to package and deploy all Lambda functions
    - Configure environment variables for each function
    - Set appropriate timeout and memory settings
    - _Requirements: 10.2_

- [ ] 14. Implement monitoring and logging
  - [ ] 14.1 Add structured logging to all Lambda functions
    - Implement `log()` function with JSON output
    - Log all credential operations with context (user_id, service_name, action)
    - Ensure no sensitive data in logs
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_
  
  - [ ] 14.2 Add CloudWatch metrics
    - Implement `recordMetric()` function for custom metrics
    - Track CredentialStored, ValidationSuccess, ValidationFailure, TokenRefresh
    - _Requirements: 10.2_
  
  - [ ]* 14.3 Create CloudWatch alarm configuration
    - Define alarms for validation failure rate > 50%
    - Define alarms for KMS errors > 5 in 5 minutes
    - Define alarms for Lambda error rate > 10%
    - _Requirements: 9.1, 9.2, 9.3_

- [ ] 15. Create UI components for credential management
  - [ ] 15.1 Create integration connection page
    - Build page at `/app/integrations/page.tsx`
    - Display list of available integrations (HubSpot, Stripe, Mixpanel)
    - Show connection status for each service
    - Follow Agentic Editorial design system with calm aesthetics
    - _Requirements: 3.1, 4.1, 5.1, 7.5_
  
  - [ ] 15.2 Create Stripe connection form
    - Build form component for pasting Stripe API key
    - Add client-side format validation
    - Call `/api/integrations/connect/stripe` on submit
    - Display masked key on success
    - Show descriptive error messages on failure
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 7.1, 7.2_
  
  - [ ] 15.3 Create Mixpanel connection form
    - Build form component for entering username and secret
    - Add client-side non-empty validation
    - Call `/api/integrations/connect/mixpanel` on submit
    - Display masked credentials on success
    - Show descriptive error messages on failure
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 7.1, 7.2_
  
  - [ ] 15.4 Create HubSpot OAuth connection button
    - Build button component to initiate OAuth flow
    - Redirect to `/api/integrations/oauth/hubspot/authorize` on click
    - Handle OAuth callback and display connection status
    - Show error messages if OAuth fails
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 7.5_
  
  - [ ] 15.5 Create connected services display
    - Build component to list all connected services
    - Display masked credentials for each service
    - Add disconnect button for each service
    - Confirm before disconnecting
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 16. Final checkpoint - End-to-end testing
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples, edge cases, and error conditions
- Implementation uses TypeScript with AWS SDK v3 for all Lambda functions
- All infrastructure must comply with AWS Free Tier limits
- Follow engineering standards: KISS, YAGNI, single responsibility, proper error handling
