# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Fault Condition** - Environment Variable Credential Access
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists (credentials read from environment variables instead of vault)
  - **Scoped PBT Approach**: Scope the property to concrete failing cases - verify each fetch function reads from process.env instead of calling getCredentials()
  - Test that fetchHubSpotCompanies() reads process.env.HUBSPOT_API_KEY (from Fault Condition in design)
  - Test that fetchMixpanelCohorts() reads process.env.MIXPANEL_API_KEY (from Fault Condition in design)
  - Test that fetchStripeCustomers() reads process.env.STRIPE_API_KEY (from Fault Condition in design)
  - Test that no Lambda invocation to credential vault occurs during data fetching
  - The test assertions should match the Expected Behavior Properties from design (credentials retrieved from vault using getCredentials)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found: environment variables are read directly, no vault invocation occurs
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Data Fetching Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for data fetching operations (pagination, retry logic, rate limiting, data transformation)
  - Write property-based tests capturing observed behavior patterns from Preservation Requirements
  - Test that HubSpot pagination logic produces same results with mocked vault credentials as with environment variables
  - Test that Mixpanel batch processing (batch size 50) produces same results with mocked vault credentials
  - Test that Stripe rate limiting delays (1000ms) work identically with mocked vault credentials
  - Test that API error handling and retry logic work identically with mocked vault credentials
  - Test that data transformation produces identical HubSpotCompany, MixpanelCohort, and StripeCustomer objects
  - Test that fetchAllCustomerData() orchestration logic works identically with mocked vault credentials
  - Property-based testing generates many test cases for stronger guarantees
  - Run tests on UNFIXED code with mocked vault returning same values as environment variables
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12_

- [x] 3. Fix for credential vault integration in data-fetching module

  - [x] 3.1 Add credential retrieval infrastructure
    - Import LambdaClient and InvokeCommand from @aws-sdk/client-lambda
    - Import credential types (DecryptedCredential, OAuthCredential, APIKeyCredential, ServiceAccountCredential) from packages/lambdas/credential-vault/src/types
    - Create getServiceCredentials(userId: string, serviceName: string) helper function
    - Implement Lambda invocation to credential retrieval handler
    - Handle credential retrieval errors (NOT_FOUND, Lambda invocation failures)
    - Throw descriptive error when service is not connected
    - _Bug_Condition: isBugCondition(input) where input.functionName IN ['fetchHubSpotCompanies', 'fetchMixpanelCohorts', 'fetchStripeCustomers'] AND credentialsReadFromEnvironmentVariables()_
    - _Expected_Behavior: Credentials retrieved from vault using getCredentials(userId, serviceName) with proper error handling_
    - _Preservation: No changes to existing data fetching logic_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.7, 2.11, 2.12_

  - [x] 3.2 Add authentication header construction
    - Create createHubSpotAuthHeader(accessToken: string) returning Bearer token header
    - Create createStripeAuthHeader(apiKey: string) returning Bearer token header
    - Create createMixpanelAuthHeader(username: string, secret: string) returning Basic auth header with Base64-encoded username:secret
    - _Bug_Condition: Authentication headers constructed incorrectly (Bearer for all services instead of service-specific patterns)_
    - _Expected_Behavior: Service-specific authentication headers (Bearer for HubSpot/Stripe, Basic for Mixpanel)_
    - _Preservation: No changes to API request construction beyond authentication headers_
    - _Requirements: 2.8, 2.9, 2.10_

  - [x] 3.3 Update fetchHubSpotCompanies function
    - Add userId parameter: fetchHubSpotCompanies(userId: string, limit: number)
    - Replace process.env.HUBSPOT_API_KEY with getServiceCredentials(userId, 'hubspot')
    - Extract access_token from OAuthCredential
    - Use createHubSpotAuthHeader(access_token) for API calls
    - Preserve all existing pagination, retry, and data transformation logic
    - _Bug_Condition: fetchHubSpotCompanies reads from process.env.HUBSPOT_API_KEY_
    - _Expected_Behavior: Retrieves OAuth credentials from vault, uses access_token with automatic refresh_
    - _Preservation: Pagination, retry logic, rate limiting (1000ms), data transformation unchanged_
    - _Requirements: 2.1, 2.5, 2.6, 2.8, 3.1, 3.4, 3.8, 3.11, 3.12_

  - [x] 3.4 Update fetchMixpanelCohorts function
    - Add userId parameter: fetchMixpanelCohorts(userId: string, companyIds: string[])
    - Replace process.env.MIXPANEL_API_KEY with getServiceCredentials(userId, 'mixpanel')
    - Extract username and secret from ServiceAccountCredential
    - Use createMixpanelAuthHeader(username, secret) for API calls
    - Preserve all existing batch processing, retry, and data transformation logic
    - _Bug_Condition: fetchMixpanelCohorts reads from process.env.MIXPANEL_API_KEY_
    - _Expected_Behavior: Retrieves service account credentials from vault, uses Basic auth_
    - _Preservation: Batch processing (size 50), retry logic, rate limiting (500ms), data transformation unchanged_
    - _Requirements: 2.2, 2.9, 3.2, 3.4, 3.9, 3.11, 3.12_

  - [x] 3.5 Update fetchStripeCustomers function
    - Add userId parameter: fetchStripeCustomers(userId: string, companyIds: string[])
    - Replace process.env.STRIPE_API_KEY with getServiceCredentials(userId, 'stripe')
    - Extract api_key from APIKeyCredential
    - Use createStripeAuthHeader(api_key) for API calls
    - Preserve all existing batch processing, retry, and data transformation logic
    - _Bug_Condition: fetchStripeCustomers reads from process.env.STRIPE_API_KEY_
    - _Expected_Behavior: Retrieves encrypted API key from vault_
    - _Preservation: Batch processing (size 100), retry logic, rate limiting (1000ms), data transformation unchanged_
    - _Requirements: 2.3, 2.10, 3.3, 3.4, 3.10, 3.11, 3.12_

  - [x] 3.6 Update fetchAllCustomerData function
    - Add userId parameter: fetchAllCustomerData(userId: string, limit: number)
    - Pass userId to fetchHubSpotCompanies(userId, limit)
    - Pass userId to fetchMixpanelCohorts(userId, companyIds)
    - Pass userId to fetchStripeCustomers(userId, companyIds)
    - Preserve all existing orchestration and data completeness metrics logic
    - _Bug_Condition: fetchAllCustomerData doesn't pass userId to child functions_
    - _Expected_Behavior: userId passed through to all fetch functions for credential retrieval_
    - _Preservation: Orchestration logic, data completeness metrics calculation unchanged_
    - _Requirements: 2.12, 3.6, 3.7_

  - [x] 3.7 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Vault Credential Retrieval
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior (credentials from vault, not environment variables)
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed - credentials now retrieved from vault)
    - Verify Lambda invocation to credential vault occurs for each fetch function
    - Verify environment variables are no longer read
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12_

  - [x] 3.8 Verify preservation tests still pass
    - **Property 2: Preservation** - Data Fetching Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Verify pagination logic works identically with vault credentials
    - Verify batch processing works identically with vault credentials
    - Verify rate limiting delays work identically with vault credentials
    - Verify retry logic works identically with vault credentials
    - Verify data transformation produces identical objects with vault credentials
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
