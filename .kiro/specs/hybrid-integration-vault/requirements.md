# Requirements Document

## Introduction

The Hybrid Integration Vault is a secure credential management system that handles three distinct authentication patterns for third-party service integrations: OAuth 2.0 (HubSpot), Restricted API Keys (Stripe), and Service Account credentials (Mixpanel). The system provides a unified interface for users to connect services while implementing service-specific security protocols behind the scenes. All credentials are encrypted at rest using AWS KMS and stored in DynamoDB to maintain AWS Free Tier compliance.

## Glossary

- **Integration_Vault**: The system responsible for securely storing and managing third-party service credentials
- **Credential_Store**: The DynamoDB table that persists encrypted credentials
- **OAuth_Handler**: The Lambda function that manages OAuth 2.0 authorization flows and token refresh
- **Validation_Engine**: The Lambda function that verifies credential validity through smoke tests
- **KMS_Encryptor**: The AWS KMS service used for field-level encryption of sensitive data
- **Refresh_Token**: A long-lived OAuth token used to obtain new access tokens without user interaction
- **Access_Token**: A short-lived OAuth token used to authenticate API requests
- **Restricted_API_Key**: A Stripe API key with limited permissions (format: sk_test_...)
- **Service_Account**: A Mixpanel authentication credential consisting of username and secret
- **Smoke_Test**: A minimal API call to verify credential validity without side effects
- **Key_Masking**: The practice of displaying only the last 4 characters of sensitive credentials in the UI

## Requirements

### Requirement 1: Credential Storage Schema

**User Story:** As a system architect, I want a unified storage schema for all credential types, so that the system can manage different authentication patterns consistently.

#### Acceptance Criteria

1. THE Credential_Store SHALL store records with fields for user_id, service_name, credential_type, encrypted_data, created_at, and updated_at
2. WHEN storing OAuth credentials, THE Credential_Store SHALL include refresh_token and token_expiry in the encrypted_data field
3. WHEN storing API key credentials, THE Credential_Store SHALL include api_key in the encrypted_data field
4. WHEN storing service account credentials, THE Credential_Store SHALL include username and secret in the encrypted_data field
5. THE Credential_Store SHALL use a composite primary key of user_id and service_name to ensure one credential per user per service

### Requirement 2: Field-Level Encryption

**User Story:** As a security engineer, I want all sensitive credential data encrypted at rest, so that credentials remain secure even if the database is compromised.

#### Acceptance Criteria

1. WHEN storing any credential, THE KMS_Encryptor SHALL encrypt the encrypted_data field before writing to the Credential_Store
2. WHEN retrieving any credential, THE KMS_Encryptor SHALL decrypt the encrypted_data field after reading from the Credential_Store
3. THE Integration_Vault SHALL use a dedicated KMS key for credential encryption
4. IF encryption fails, THEN THE Integration_Vault SHALL return an error and prevent credential storage
5. IF decryption fails, THEN THE Integration_Vault SHALL return an error and prevent credential retrieval

### Requirement 3: HubSpot OAuth Flow

**User Story:** As a user, I want to connect my HubSpot account via OAuth, so that Sesari can access my HubSpot data securely.

#### Acceptance Criteria

1. WHEN a user clicks the Connect HubSpot button, THE OAuth_Handler SHALL redirect the user to HubSpot's authorization page
2. WHEN HubSpot redirects back with an authorization code, THE OAuth_Handler SHALL exchange it for a refresh_token and access_token
3. WHEN OAuth tokens are received, THE OAuth_Handler SHALL encrypt and store the refresh_token in the Credential_Store
4. WHEN an access_token expires, THE OAuth_Handler SHALL use the refresh_token to obtain a new access_token without user interaction
5. IF the OAuth callback receives an error parameter, THEN THE OAuth_Handler SHALL display a user-friendly error message and prevent credential storage

### Requirement 4: Stripe API Key Management

**User Story:** As a user, I want to securely store my Stripe API key, so that Sesari can access my Stripe data.

#### Acceptance Criteria

1. WHEN a user pastes a Stripe API key, THE Integration_Vault SHALL validate the key format matches the pattern sk_test_ or sk_live_ followed by alphanumeric characters
2. WHEN a valid Stripe key is provided, THE Validation_Engine SHALL perform a smoke test by calling the Stripe API to verify the key works
3. IF the smoke test succeeds, THEN THE Integration_Vault SHALL encrypt and store the key in the Credential_Store
4. IF the smoke test fails, THEN THE Integration_Vault SHALL return a descriptive error message and prevent storage
5. WHEN displaying a stored Stripe key, THE Integration_Vault SHALL mask all characters except the last 4 digits

### Requirement 5: Mixpanel Service Account Management

**User Story:** As a user, I want to securely store my Mixpanel service account credentials, so that Sesari can access my Mixpanel data.

#### Acceptance Criteria

1. WHEN a user provides Mixpanel username and secret, THE Integration_Vault SHALL validate both fields are non-empty
2. WHEN valid Mixpanel credentials are provided, THE Validation_Engine SHALL perform a smoke test by calling the Mixpanel API to verify the credentials work
3. IF the smoke test succeeds, THEN THE Integration_Vault SHALL encrypt and store both username and secret in the Credential_Store
4. IF the smoke test fails, THEN THE Integration_Vault SHALL return a descriptive error message and prevent storage
5. WHEN displaying stored Mixpanel credentials, THE Integration_Vault SHALL mask the secret showing only the last 4 characters

### Requirement 6: Credential Validation Engine

**User Story:** As a system administrator, I want immediate validation of pasted credentials, so that users know their credentials work before they are stored.

#### Acceptance Criteria

1. WHEN validating a Stripe key, THE Validation_Engine SHALL call the Stripe API retrieve account endpoint with the provided key
2. WHEN validating Mixpanel credentials, THE Validation_Engine SHALL call the Mixpanel API query endpoint with the provided credentials
3. WHEN a validation smoke test succeeds, THE Validation_Engine SHALL return a success status with the service name
4. WHEN a validation smoke test fails, THE Validation_Engine SHALL return an error status with a descriptive message indicating the failure reason
5. THE Validation_Engine SHALL complete all smoke tests within 5 seconds to provide timely user feedback

### Requirement 7: Key Masking in UI

**User Story:** As a user, I want my stored credentials to be masked in the UI, so that my sensitive data is not exposed on screen.

#### Acceptance Criteria

1. WHEN displaying any stored credential in the UI, THE Integration_Vault SHALL show only the last 4 characters of sensitive fields
2. WHEN displaying a masked credential, THE Integration_Vault SHALL replace all other characters with asterisks or dots
3. THE Integration_Vault SHALL apply masking to API keys, secrets, and refresh tokens
4. THE Integration_Vault SHALL NOT apply masking to non-sensitive fields like username or service_name
5. WHEN a user views the connections screen, THE Integration_Vault SHALL display masked credentials for all connected services

### Requirement 8: Credential Retrieval for Agent Use

**User Story:** As the Sesari agent, I want to retrieve decrypted credentials, so that I can make authenticated API calls to integrated services.

#### Acceptance Criteria

1. WHEN the agent requests credentials for a service, THE Integration_Vault SHALL retrieve the encrypted record from the Credential_Store
2. WHEN credentials are retrieved, THE KMS_Encryptor SHALL decrypt the encrypted_data field
3. WHEN OAuth credentials are retrieved, THE OAuth_Handler SHALL check if the access_token is expired and refresh it if necessary
4. WHEN credentials are successfully retrieved, THE Integration_Vault SHALL return the decrypted credential data to the agent
5. IF credentials do not exist for the requested service, THEN THE Integration_Vault SHALL return an error indicating the service is not connected

### Requirement 9: Error Handling and Resilience

**User Story:** As a system operator, I want robust error handling for all credential operations, so that the system degrades gracefully under failure conditions.

#### Acceptance Criteria

1. IF a DynamoDB operation fails, THEN THE Integration_Vault SHALL log the error and return a user-friendly error message
2. IF a KMS encryption operation fails, THEN THE Integration_Vault SHALL log the error and prevent credential storage
3. IF a KMS decryption operation fails, THEN THE Integration_Vault SHALL log the error and return an error to the caller
4. IF an external API call times out during validation, THEN THE Validation_Engine SHALL return a timeout error after 5 seconds
5. WHEN any error occurs, THE Integration_Vault SHALL NOT expose sensitive credential data in error messages or logs

### Requirement 10: AWS Free Tier Compliance

**User Story:** As a cost-conscious founder, I want the credential vault to operate within AWS Free Tier limits, so that infrastructure costs remain minimal.

#### Acceptance Criteria

1. THE Integration_Vault SHALL use DynamoDB on-demand pricing to avoid provisioned capacity costs
2. THE Integration_Vault SHALL use AWS Lambda for all compute operations to leverage the free 1 million requests per month
3. THE Integration_Vault SHALL use a single KMS key for all credential encryption to stay within the free 20,000 requests per month
4. THE Integration_Vault SHALL implement efficient DynamoDB queries using the primary key to minimize read capacity consumption
5. THE Integration_Vault SHALL avoid storing large payloads in DynamoDB to minimize storage costs
