# Vault Integration for Data Fetching Bugfix Design

## Overview

The ICP refinement engine's data-fetching module currently reads API credentials directly from environment variables, bypassing the secure credential vault system. This creates a security vulnerability where credentials are exposed in plaintext in the Lambda execution environment and prevents the system from benefiting from automatic OAuth token refresh for HubSpot.

The fix integrates the data-fetching module with the credential vault by replacing direct environment variable access with secure credential retrieval through the vault's Retrieval Lambda. This ensures all API calls use properly authenticated, encrypted credentials with automatic token refresh for OAuth services.

The fix is minimal and targeted: add a credential retrieval layer before API calls, construct service-specific authentication headers, and pass userId through the system. All existing data fetching logic, retry mechanisms, rate limiting, and data transformation remain unchanged.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug - when data-fetching functions read credentials from process.env instead of the credential vault
- **Property (P)**: The desired behavior - data-fetching functions retrieve credentials from the vault using getCredentials(userId, serviceName)
- **Preservation**: Existing data fetching behavior (pagination, retry logic, rate limiting, data transformation) that must remain unchanged
- **getCredentials()**: The function in `packages/lambdas/credential-vault/src/handlers/credential-retrieval.ts` that retrieves and decrypts credentials from the vault
- **DecryptedCredential**: The return type from getCredentials() containing service_name, credential_type, and decrypted data
- **OAuthCredential**: Credential type for HubSpot containing access_token, refresh_token, and token_expiry
- **APIKeyCredential**: Credential type for Stripe containing api_key
- **ServiceAccountCredential**: Credential type for Mixpanel containing username and secret
- **userId**: User identifier that must be passed through the system to retrieve user-specific credentials

## Bug Details

### Fault Condition

The bug manifests when any of the three data-fetching functions (fetchHubSpotCompanies, fetchMixpanelCohorts, fetchStripeCustomers) are called. These functions read credentials directly from environment variables (process.env.HUBSPOT_API_KEY, process.env.MIXPANEL_API_KEY, process.env.STRIPE_API_KEY) instead of retrieving them from the credential vault.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { functionName: string, userId: string }
  OUTPUT: boolean
  
  RETURN input.functionName IN ['fetchHubSpotCompanies', 'fetchMixpanelCohorts', 'fetchStripeCustomers']
         AND credentialsReadFromEnvironmentVariables()
         AND NOT credentialsRetrievedFromVault(input.userId)
END FUNCTION
```

### Examples

- **HubSpot**: fetchHubSpotCompanies(100) reads process.env.HUBSPOT_API_KEY instead of calling getCredentials(userId, 'hubspot') and using the OAuth access_token
- **Mixpanel**: fetchMixpanelCohorts(['comp1', 'comp2']) reads process.env.MIXPANEL_API_KEY instead of calling getCredentials(userId, 'mixpanel') and constructing Basic auth from username:secret
- **Stripe**: fetchStripeCustomers(['comp1', 'comp2']) reads process.env.STRIPE_API_KEY instead of calling getCredentials(userId, 'stripe') and using the encrypted API key
- **Edge case**: When HubSpot OAuth token expires, the current implementation fails with 401 errors instead of automatically refreshing the token through the vault

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Pagination logic for HubSpot and Stripe must continue to work exactly as before
- Retry logic with exponential backoff must continue to work for all services
- Rate limiting delays (1000ms for HubSpot/Stripe, 500ms for Mixpanel) must remain unchanged
- Batch processing logic (100 for HubSpot/Stripe, 50 for Mixpanel) must remain unchanged
- Data transformation into HubSpotCompany, MixpanelCohort, and StripeCustomer types must remain unchanged
- Error handling for API failures must continue to work as before
- Data completeness metrics calculation must remain unchanged
- fetchAllCustomerData() orchestration logic must remain unchanged

**Scope:**
All data fetching logic that does NOT involve credential retrieval should be completely unaffected by this fix. This includes:
- API request construction (URLs, query parameters, request bodies)
- Response parsing and data transformation
- Batch processing and pagination
- Rate limiting and retry logic
- Error handling for non-authentication errors
- Logging and metrics

## Hypothesized Root Cause

Based on the bug description, the root cause is clear:

1. **Missing Credential Vault Integration**: The data-fetching module was implemented before the credential vault system existed, so it uses the simpler environment variable approach

2. **No userId Parameter**: The fetch functions don't accept a userId parameter, which is required to retrieve user-specific credentials from the vault

3. **Incorrect Authentication Header Construction**: The current implementation uses Bearer tokens for all services, but Mixpanel requires Basic authentication with Base64-encoded username:secret

4. **No Lambda Invocation Logic**: The module doesn't have code to invoke the credential retrieval Lambda or handle the DecryptedCredential response

## Correctness Properties

Property 1: Fault Condition - Credential Vault Integration

_For any_ data-fetching function call (fetchHubSpotCompanies, fetchMixpanelCohorts, fetchStripeCustomers) with a valid userId, the fixed function SHALL retrieve credentials from the credential vault using getCredentials(userId, serviceName) instead of reading from environment variables, and SHALL construct service-specific authentication headers (Bearer for HubSpot/Stripe, Basic for Mixpanel).

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12**

Property 2: Preservation - Data Fetching Behavior

_For any_ data-fetching function call, the fixed function SHALL produce the same API requests, response parsing, pagination, retry logic, rate limiting, and data transformation as the original function, preserving all existing data fetching behavior.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `packages/agent/src/icp-refinement/data-fetching.ts`

**Specific Changes**:

1. **Add Credential Retrieval Function**: Create a helper function that invokes the credential retrieval Lambda and returns decrypted credentials
   - Import LambdaClient and InvokeCommand from @aws-sdk/client-lambda
   - Create getServiceCredentials(userId, serviceName) function
   - Handle Lambda invocation errors with descriptive messages

2. **Add Authentication Header Construction**: Create helper functions to construct service-specific auth headers
   - createHubSpotAuthHeader(accessToken): Returns { 'Authorization': `Bearer ${accessToken}` }
   - createStripeAuthHeader(apiKey): Returns { 'Authorization': `Bearer ${apiKey}` }
   - createMixpanelAuthHeader(username, secret): Returns { 'Authorization': `Basic ${base64(username:secret)}` }

3. **Update fetchHubSpotCompanies Signature**: Add userId parameter
   - Change: fetchHubSpotCompanies(limit: number)
   - To: fetchHubSpotCompanies(userId: string, limit: number)
   - Replace process.env.HUBSPOT_API_KEY with getServiceCredentials(userId, 'hubspot')
   - Extract access_token from OAuthCredential
   - Use createHubSpotAuthHeader(access_token) for API calls

4. **Update fetchMixpanelCohorts Signature**: Add userId parameter
   - Change: fetchMixpanelCohorts(companyIds: string[])
   - To: fetchMixpanelCohorts(userId: string, companyIds: string[])
   - Replace process.env.MIXPANEL_API_KEY with getServiceCredentials(userId, 'mixpanel')
   - Extract username and secret from ServiceAccountCredential
   - Use createMixpanelAuthHeader(username, secret) for API calls

5. **Update fetchStripeCustomers Signature**: Add userId parameter
   - Change: fetchStripeCustomers(companyIds: string[])
   - To: fetchStripeCustomers(userId: string, companyIds: string[])
   - Replace process.env.STRIPE_API_KEY with getServiceCredentials(userId, 'stripe')
   - Extract api_key from APIKeyCredential
   - Use createStripeAuthHeader(api_key) for API calls

6. **Update fetchAllCustomerData Signature**: Add userId parameter and pass through
   - Change: fetchAllCustomerData(limit: number)
   - To: fetchAllCustomerData(userId: string, limit: number)
   - Pass userId to all three fetch functions

7. **Add Error Handling**: Handle credential retrieval failures
   - Catch CredentialError with code 'NOT_FOUND'
   - Throw descriptive error: "Service not connected. Please connect {serviceName} first."
   - Preserve existing error handling for API failures

8. **Add Type Imports**: Import credential types from vault package
   - Import DecryptedCredential, OAuthCredential, APIKeyCredential, ServiceAccountCredential from packages/lambdas/credential-vault/src/types

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Fault Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm that the current implementation reads from environment variables instead of the vault.

**Test Plan**: Write tests that mock environment variables and verify they are being read. Run these tests on the UNFIXED code to confirm the bug exists.

**Test Cases**:
1. **HubSpot Environment Variable Test**: Mock process.env.HUBSPOT_API_KEY and verify fetchHubSpotCompanies reads it (will pass on unfixed code, confirming the bug)
2. **Mixpanel Environment Variable Test**: Mock process.env.MIXPANEL_API_KEY and verify fetchMixpanelCohorts reads it (will pass on unfixed code, confirming the bug)
3. **Stripe Environment Variable Test**: Mock process.env.STRIPE_API_KEY and verify fetchStripeCustomers reads it (will pass on unfixed code, confirming the bug)
4. **No Vault Invocation Test**: Verify that no Lambda invocation occurs during data fetching (will pass on unfixed code, confirming the bug)

**Expected Counterexamples**:
- Environment variables are read directly instead of calling getCredentials()
- No Lambda invocation to credential retrieval handler
- Authentication headers use environment variable values instead of vault-retrieved credentials

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function retrieves credentials from the vault.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fetchFunction_fixed(input.userId, ...args)
  ASSERT credentialsRetrievedFromVault(input.userId)
  ASSERT authHeadersConstructedCorrectly(result)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs, the fixed function produces the same API requests, response parsing, and data transformation as the original function.

**Pseudocode:**
```
FOR ALL input DO
  // Mock vault to return same credentials as environment variables
  mockVaultCredentials(input.userId, environmentVariableValues)
  
  result_original := fetchFunction_original(...args)
  result_fixed := fetchFunction_fixed(input.userId, ...args)
  
  ASSERT result_original = result_fixed
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all inputs

**Test Plan**: Mock the credential vault to return the same values as environment variables, then verify that API requests and responses are identical.

**Test Cases**:
1. **HubSpot Pagination Preservation**: Verify that pagination logic works identically with vault credentials
2. **Mixpanel Batch Processing Preservation**: Verify that batch processing works identically with vault credentials
3. **Stripe Rate Limiting Preservation**: Verify that rate limiting delays work identically with vault credentials
4. **Error Handling Preservation**: Verify that API error handling works identically with vault credentials
5. **Data Transformation Preservation**: Verify that response parsing produces identical HubSpotCompany, MixpanelCohort, and StripeCustomer objects

### Unit Tests

- Test getServiceCredentials() with mocked Lambda invocation for each service
- Test authentication header construction for each service (Bearer vs Basic)
- Test error handling when credentials are not found (NOT_FOUND error)
- Test error handling when Lambda invocation fails
- Test userId parameter passing through all functions
- Test that environment variables are no longer read

### Property-Based Tests

- Generate random userIds and verify credentials are retrieved for each
- Generate random company IDs and verify batch processing works with vault credentials
- Generate random API responses and verify data transformation is identical
- Test that for any valid userId, all three services can be called successfully

### Integration Tests

- Test full data fetching flow with mocked credential vault Lambda
- Test OAuth token refresh scenario (HubSpot token expired, vault returns refreshed token)
- Test error scenario where service is not connected (vault returns NOT_FOUND)
- Test fetchAllCustomerData() with all three services using vault credentials
