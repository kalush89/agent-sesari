# Design Document: Hybrid Integration Vault

## Overview

The Hybrid Integration Vault is a secure credential management system that handles three distinct authentication patterns for third-party service integrations: OAuth 2.0 (HubSpot), Restricted API Keys (Stripe), and Service Account credentials (Mixpanel). The system provides a unified interface for users to connect services while implementing service-specific security protocols behind the scenes.

All credentials are encrypted at rest using AWS KMS with field-level encryption, stored in DynamoDB for serverless scalability, and validated through smoke tests before storage. The vault operates entirely within AWS Free Tier limits using Lambda functions for compute and on-demand DynamoDB pricing.

The system serves two primary use cases:
1. **User-facing credential management**: Secure connection flows with immediate validation and masked display
2. **Agent credential retrieval**: Decrypted credential access for authenticated API calls to integrated services

## Architecture

### System Components

```mermaid
graph TB
    User[User] -->|Connect Service| Web[Next.js Web App]
    Web -->|API Route| ConnectAPI[/api/integrations/connect]
    ConnectAPI -->|OAuth Flow| OAuthLambda[OAuth Handler Lambda]
    ConnectAPI -->|API Key/Service Account| ValidateLambda[Validation Lambda]
    
    OAuthLambda -->|Exchange Code| HubSpot[HubSpot OAuth]
    ValidateLambda -->|Smoke Test| Stripe[Stripe API]
    ValidateLambda -->|Smoke Test| Mixpanel[Mixpanel API]
    
    OAuthLambda -->|Encrypt & Store| KMS[AWS KMS]
    ValidateLambda -->|Encrypt & Store| KMS
    KMS -->|Encrypted Data| DDB[(DynamoDB Credential Store)]
    
    Agent[Sesari Agent] -->|Get Credentials| RetrieveLambda[Retrieval Lambda]
    RetrieveLambda -->|Read| DDB
    RetrieveLambda -->|Decrypt| KMS
    RetrieveLambda -->|Refresh if needed| OAuthLambda
    RetrieveLambda -->|Decrypted Creds| Agent
    
    Web -->|List Connections| ListAPI[/api/integrations/list]
    ListAPI -->|Query| DDB
    ListAPI -->|Masked Display| User
```

### Data Flow

**OAuth Flow (HubSpot)**:
1. User clicks "Connect HubSpot"
2. Web app redirects to HubSpot authorization page
3. User authorizes, HubSpot redirects back with authorization code
4. OAuth Handler Lambda exchanges code for refresh_token and access_token
5. Lambda encrypts refresh_token using KMS
6. Lambda stores encrypted credential in DynamoDB
7. Web app displays success with masked credential

**API Key Flow (Stripe)**:
1. User pastes Stripe API key
2. Web app sends key to Validation Lambda
3. Lambda validates key format (sk_test_* or sk_live_*)
4. Lambda performs smoke test (Stripe API account retrieval)
5. If valid, Lambda encrypts key using KMS
6. Lambda stores encrypted credential in DynamoDB
7. Web app displays success with masked key (last 4 chars visible)

**Service Account Flow (Mixpanel)**:
1. User enters Mixpanel username and secret
2. Web app sends credentials to Validation Lambda
3. Lambda validates both fields are non-empty
4. Lambda performs smoke test (Mixpanel API query)
5. If valid, Lambda encrypts both fields using KMS
6. Lambda stores encrypted credential in DynamoDB
7. Web app displays success with masked secret

**Agent Retrieval Flow**:
1. Agent requests credentials for a service (e.g., "stripe")
2. Retrieval Lambda queries DynamoDB by user_id and service_name
3. Lambda decrypts encrypted_data using KMS
4. For OAuth: Check if access_token expired, refresh if needed
5. Lambda returns decrypted credentials to agent
6. Agent makes authenticated API call to service

### AWS Free Tier Compliance

- **Lambda**: 4 functions (OAuth, Validation, Retrieval, Refresh), estimated <10K invocations/month (well within 1M free)
- **DynamoDB**: On-demand pricing, minimal storage (~1KB per credential × estimated 100 users = 100KB)
- **KMS**: Single customer-managed key, estimated <1K operations/month (within 20K free)
- **API Gateway**: Not needed (using Next.js API routes)
- **Secrets Manager**: Not used (credentials stored in DynamoDB with KMS encryption)

## Components and Interfaces

### 1. DynamoDB Credential Store

**Purpose**: Persist encrypted credentials with metadata

**Table Schema**:
```typescript
interface CredentialRecord {
  // Primary Key
  user_id: string;           // PK: User identifier
  service_name: string;      // SK: "hubspot" | "stripe" | "mixpanel"
  
  // Metadata
  credential_type: "oauth" | "api_key" | "service_account";
  created_at: string;        // ISO 8601 timestamp
  updated_at: string;        // ISO 8601 timestamp
  
  // Encrypted payload (KMS encrypted JSON string)
  encrypted_data: string;    // Base64 encoded encrypted blob
  
  // Display metadata (not encrypted)
  display_name: string;      // e.g., "HubSpot", "Stripe"
  masked_value: string;      // e.g., "****1234" for UI display
}
```

**Encrypted Data Payloads**:
```typescript
// OAuth (HubSpot)
interface OAuthCredential {
  refresh_token: string;
  access_token?: string;     // Optional, can be refreshed
  token_expiry?: string;     // ISO 8601 timestamp
  scope?: string;            // OAuth scopes granted
}

// API Key (Stripe)
interface APIKeyCredential {
  api_key: string;
}

// Service Account (Mixpanel)
interface ServiceAccountCredential {
  username: string;
  secret: string;
}
```

**Table Configuration**:
- **Primary Key**: `user_id` (partition key) + `service_name` (sort key)
- **Billing Mode**: On-demand (no provisioned capacity)
- **Encryption**: AWS managed encryption at rest (default DynamoDB encryption)
- **TTL**: Not used (credentials persist until user disconnects)

**Indexes**: None required (queries always use primary key)

### 2. KMS Encryption Service

**Purpose**: Encrypt and decrypt sensitive credential data

**Key Configuration**:
```typescript
interface KMSKeyConfig {
  keyId: string;             // Customer-managed KMS key ARN
  alias: string;             // "alias/sesari-credential-vault"
  description: string;       // "Encryption key for integration credentials"
  keyPolicy: {
    allowedPrincipals: string[];  // Lambda execution role ARNs
    allowedOperations: string[];  // ["Encrypt", "Decrypt"]
  };
}
```

**Encryption Functions**:
```typescript
/**
 * Encrypts credential data using KMS
 * @param plaintext - Credential object to encrypt
 * @param keyId - KMS key ID or ARN
 * @returns Base64 encoded encrypted blob
 */
async function encryptCredential(
  plaintext: OAuthCredential | APIKeyCredential | ServiceAccountCredential,
  keyId: string
): Promise<string>

/**
 * Decrypts credential data using KMS
 * @param ciphertext - Base64 encoded encrypted blob
 * @param keyId - KMS key ID or ARN
 * @returns Decrypted credential object
 */
async function decryptCredential(
  ciphertext: string,
  keyId: string
): Promise<OAuthCredential | APIKeyCredential | ServiceAccountCredential>
```

**Implementation Pattern**:
```typescript
import { KMSClient, EncryptCommand, DecryptCommand } from "@aws-sdk/client-kms";

async function encryptCredential(plaintext: any, keyId: string): Promise<string> {
  const client = new KMSClient({ region: process.env.AWS_REGION });
  
  try {
    const response = await client.send(new EncryptCommand({
      KeyId: keyId,
      Plaintext: Buffer.from(JSON.stringify(plaintext), 'utf-8')
    }));
    
    return Buffer.from(response.CiphertextBlob!).toString('base64');
  } catch (error) {
    console.error('KMS encryption failed:', error);
    throw new Error('Failed to encrypt credential');
  }
}
```

### 3. OAuth Handler Lambda

**Purpose**: Manage OAuth 2.0 authorization flows and token refresh

**Environment Variables**:
```typescript
interface OAuthConfig {
  HUBSPOT_CLIENT_ID: string;
  HUBSPOT_CLIENT_SECRET: string;
  HUBSPOT_REDIRECT_URI: string;
  KMS_KEY_ID: string;
  CREDENTIAL_TABLE_NAME: string;
}
```

**Functions**:

```typescript
/**
 * Initiates OAuth flow by generating authorization URL
 * @param userId - User identifier
 * @param state - CSRF protection token
 * @returns Authorization URL to redirect user to
 */
function generateAuthorizationURL(userId: string, state: string): string

/**
 * Handles OAuth callback and exchanges authorization code for tokens
 * @param code - Authorization code from OAuth provider
 * @param state - CSRF token to validate
 * @returns Encrypted credential record
 */
async function handleOAuthCallback(
  code: string,
  state: string
): Promise<CredentialRecord>

/**
 * Refreshes expired OAuth access token using refresh token
 * @param userId - User identifier
 * @param serviceName - Service to refresh (e.g., "hubspot")
 * @returns New access token and expiry
 */
async function refreshAccessToken(
  userId: string,
  serviceName: string
): Promise<{ access_token: string; expires_at: string }>
```

**OAuth Flow Implementation**:
```typescript
async function handleOAuthCallback(code: string, state: string): Promise<CredentialRecord> {
  // 1. Validate state token (CSRF protection)
  const { userId } = validateState(state);
  
  // 2. Exchange authorization code for tokens
  const tokenResponse = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.HUBSPOT_CLIENT_ID!,
      client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
      redirect_uri: process.env.HUBSPOT_REDIRECT_URI!,
      code
    })
  });
  
  if (!tokenResponse.ok) {
    throw new Error('OAuth token exchange failed');
  }
  
  const tokens = await tokenResponse.json();
  
  // 3. Encrypt refresh token
  const credential: OAuthCredential = {
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    scope: tokens.scope
  };
  
  const encryptedData = await encryptCredential(credential, process.env.KMS_KEY_ID!);
  
  // 4. Store in DynamoDB
  const record: CredentialRecord = {
    user_id: userId,
    service_name: 'hubspot',
    credential_type: 'oauth',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    encrypted_data: encryptedData,
    display_name: 'HubSpot',
    masked_value: 'Connected'
  };
  
  await storeCredential(record);
  
  return record;
}
```

**Token Refresh Logic**:
```typescript
async function refreshAccessToken(userId: string, serviceName: string) {
  // 1. Retrieve credential from DynamoDB
  const record = await getCredential(userId, serviceName);
  
  // 2. Decrypt to get refresh token
  const credential = await decryptCredential(record.encrypted_data, process.env.KMS_KEY_ID!) as OAuthCredential;
  
  // 3. Request new access token
  const tokenResponse = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.HUBSPOT_CLIENT_ID!,
      client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
      refresh_token: credential.refresh_token
    })
  });
  
  const tokens = await tokenResponse.json();
  
  // 4. Update stored credential with new access token
  credential.access_token = tokens.access_token;
  credential.token_expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  
  const encryptedData = await encryptCredential(credential, process.env.KMS_KEY_ID!);
  
  await updateCredential(userId, serviceName, {
    encrypted_data: encryptedData,
    updated_at: new Date().toISOString()
  });
  
  return {
    access_token: tokens.access_token,
    expires_at: credential.token_expiry
  };
}
```

### 4. Validation Lambda

**Purpose**: Validate API keys and service accounts through smoke tests

**Environment Variables**:
```typescript
interface ValidationConfig {
  KMS_KEY_ID: string;
  CREDENTIAL_TABLE_NAME: string;
  VALIDATION_TIMEOUT_MS: number;  // Default: 5000
}
```

**Functions**:

```typescript
/**
 * Validates and stores a Stripe API key
 * @param userId - User identifier
 * @param apiKey - Stripe API key (sk_test_* or sk_live_*)
 * @returns Validation result and stored credential
 */
async function validateStripeKey(
  userId: string,
  apiKey: string
): Promise<ValidationResult>

/**
 * Validates and stores Mixpanel service account credentials
 * @param userId - User identifier
 * @param username - Mixpanel service account username
 * @param secret - Mixpanel service account secret
 * @returns Validation result and stored credential
 */
async function validateMixpanelCredentials(
  userId: string,
  username: string,
  secret: string
): Promise<ValidationResult>

interface ValidationResult {
  success: boolean;
  service_name: string;
  error_message?: string;
  credential_record?: CredentialRecord;
}
```

**Stripe Validation Implementation**:
```typescript
async function validateStripeKey(userId: string, apiKey: string): Promise<ValidationResult> {
  // 1. Validate format
  if (!apiKey.match(/^sk_(test|live)_[a-zA-Z0-9]+$/)) {
    return {
      success: false,
      service_name: 'stripe',
      error_message: 'Invalid Stripe API key format. Must start with sk_test_ or sk_live_'
    };
  }
  
  // 2. Smoke test: Retrieve account
  try {
    const response = await fetch('https://api.stripe.com/v1/account', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      signal: AbortSignal.timeout(5000)
    });
    
    if (!response.ok) {
      return {
        success: false,
        service_name: 'stripe',
        error_message: 'Stripe API key is invalid or lacks required permissions'
      };
    }
    
    // 3. Encrypt and store
    const credential: APIKeyCredential = { api_key: apiKey };
    const encryptedData = await encryptCredential(credential, process.env.KMS_KEY_ID!);
    
    const record: CredentialRecord = {
      user_id: userId,
      service_name: 'stripe',
      credential_type: 'api_key',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      encrypted_data: encryptedData,
      display_name: 'Stripe',
      masked_value: `****${apiKey.slice(-4)}`
    };
    
    await storeCredential(record);
    
    return {
      success: true,
      service_name: 'stripe',
      credential_record: record
    };
  } catch (error) {
    return {
      success: false,
      service_name: 'stripe',
      error_message: error instanceof Error ? error.message : 'Validation timeout'
    };
  }
}
```

**Mixpanel Validation Implementation**:
```typescript
async function validateMixpanelCredentials(
  userId: string,
  username: string,
  secret: string
): Promise<ValidationResult> {
  // 1. Validate non-empty
  if (!username || !secret) {
    return {
      success: false,
      service_name: 'mixpanel',
      error_message: 'Username and secret are required'
    };
  }
  
  // 2. Smoke test: Query API
  try {
    const auth = Buffer.from(`${username}:${secret}`).toString('base64');
    const response = await fetch('https://mixpanel.com/api/2.0/engage', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        where: 'properties["$email"] == "test@example.com"',
        limit: 1
      }),
      signal: AbortSignal.timeout(5000)
    });
    
    if (!response.ok) {
      return {
        success: false,
        service_name: 'mixpanel',
        error_message: 'Mixpanel credentials are invalid'
      };
    }
    
    // 3. Encrypt and store
    const credential: ServiceAccountCredential = { username, secret };
    const encryptedData = await encryptCredential(credential, process.env.KMS_KEY_ID!);
    
    const record: CredentialRecord = {
      user_id: userId,
      service_name: 'mixpanel',
      credential_type: 'service_account',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      encrypted_data: encryptedData,
      display_name: 'Mixpanel',
      masked_value: `${username} / ****${secret.slice(-4)}`
    };
    
    await storeCredential(record);
    
    return {
      success: true,
      service_name: 'mixpanel',
      credential_record: record
    };
  } catch (error) {
    return {
      success: false,
      service_name: 'mixpanel',
      error_message: error instanceof Error ? error.message : 'Validation timeout'
    };
  }
}
```

### 5. Retrieval Lambda

**Purpose**: Provide decrypted credentials to the Sesari agent

**Environment Variables**:
```typescript
interface RetrievalConfig {
  KMS_KEY_ID: string;
  CREDENTIAL_TABLE_NAME: string;
}
```

**Functions**:

```typescript
/**
 * Retrieves and decrypts credentials for a service
 * @param userId - User identifier
 * @param serviceName - Service to retrieve credentials for
 * @returns Decrypted credential data
 */
async function getCredentials(
  userId: string,
  serviceName: string
): Promise<DecryptedCredential>

interface DecryptedCredential {
  service_name: string;
  credential_type: string;
  data: OAuthCredential | APIKeyCredential | ServiceAccountCredential;
}
```

**Implementation**:
```typescript
async function getCredentials(userId: string, serviceName: string): Promise<DecryptedCredential> {
  // 1. Query DynamoDB
  const record = await getCredential(userId, serviceName);
  
  if (!record) {
    throw new Error(`No credentials found for service: ${serviceName}`);
  }
  
  // 2. Decrypt credential data
  const decryptedData = await decryptCredential(record.encrypted_data, process.env.KMS_KEY_ID!);
  
  // 3. For OAuth, check if token needs refresh
  if (record.credential_type === 'oauth') {
    const oauthCred = decryptedData as OAuthCredential;
    
    if (oauthCred.token_expiry && new Date(oauthCred.token_expiry) < new Date()) {
      // Token expired, refresh it
      const refreshed = await refreshAccessToken(userId, serviceName);
      oauthCred.access_token = refreshed.access_token;
      oauthCred.token_expiry = refreshed.expires_at;
    }
  }
  
  return {
    service_name: serviceName,
    credential_type: record.credential_type,
    data: decryptedData
  };
}
```

### 6. Key Masking Utility

**Purpose**: Mask sensitive credential data for UI display

**Functions**:

```typescript
/**
 * Masks a credential value for safe display
 * @param value - Full credential value
 * @param visibleChars - Number of characters to show at end (default: 4)
 * @returns Masked string (e.g., "****1234")
 */
function maskCredential(value: string, visibleChars: number = 4): string

/**
 * Generates display-friendly masked value based on credential type
 * @param credentialType - Type of credential
 * @param data - Decrypted credential data
 * @returns Masked display string
 */
function generateMaskedDisplay(
  credentialType: string,
  data: OAuthCredential | APIKeyCredential | ServiceAccountCredential
): string
```

**Implementation**:
```typescript
function maskCredential(value: string, visibleChars: number = 4): string {
  if (value.length <= visibleChars) {
    return '*'.repeat(value.length);
  }
  
  const masked = '*'.repeat(value.length - visibleChars);
  const visible = value.slice(-visibleChars);
  
  return masked + visible;
}

function generateMaskedDisplay(credentialType: string, data: any): string {
  switch (credentialType) {
    case 'oauth':
      return 'Connected';
    
    case 'api_key':
      return maskCredential(data.api_key);
    
    case 'service_account':
      return `${data.username} / ${maskCredential(data.secret)}`;
    
    default:
      return 'Connected';
  }
}
```

### 7. Next.js API Routes

**Purpose**: Expose credential management endpoints to the web app

**Routes**:

```typescript
// POST /api/integrations/connect/stripe
interface ConnectStripeRequest {
  apiKey: string;
}

interface ConnectStripeResponse {
  success: boolean;
  masked_value?: string;
  error_message?: string;
}

// POST /api/integrations/connect/mixpanel
interface ConnectMixpanelRequest {
  username: string;
  secret: string;
}

interface ConnectMixpanelResponse {
  success: boolean;
  masked_value?: string;
  error_message?: string;
}

// GET /api/integrations/oauth/hubspot/authorize
// Redirects to HubSpot authorization page

// GET /api/integrations/oauth/hubspot/callback?code=...&state=...
// Handles OAuth callback and stores credentials

// GET /api/integrations/list
interface ListIntegrationsResponse {
  integrations: {
    service_name: string;
    display_name: string;
    credential_type: string;
    masked_value: string;
    connected_at: string;
  }[];
}

// DELETE /api/integrations/disconnect/:serviceName
interface DisconnectResponse {
  success: boolean;
}
```

**Implementation Example**:
```typescript
// app/api/integrations/connect/stripe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

export async function POST(request: NextRequest) {
  const { apiKey } = await request.json();
  const userId = request.headers.get('x-user-id'); // From auth middleware
  
  if (!userId) {
    return NextResponse.json({ success: false, error_message: 'Unauthorized' }, { status: 401 });
  }
  
  // Invoke Validation Lambda
  const lambda = new LambdaClient({ region: process.env.AWS_REGION });
  const response = await lambda.send(new InvokeCommand({
    FunctionName: 'sesari-validation-lambda',
    Payload: JSON.stringify({
      action: 'validate_stripe',
      user_id: userId,
      api_key: apiKey
    })
  }));
  
  const result = JSON.parse(Buffer.from(response.Payload!).toString());
  
  if (result.success) {
    return NextResponse.json({
      success: true,
      masked_value: result.credential_record.masked_value
    });
  } else {
    return NextResponse.json({
      success: false,
      error_message: result.error_message
    }, { status: 400 });
  }
}
```

## Data Models

### Core Data Types

```typescript
// Credential types
type CredentialType = "oauth" | "api_key" | "service_account";
type ServiceName = "hubspot" | "stripe" | "mixpanel";

// Credential payloads (before encryption)
type CredentialPayload = OAuthCredential | APIKeyCredential | ServiceAccountCredential;

// DynamoDB record structure
interface CredentialRecord {
  user_id: string;
  service_name: ServiceName;
  credential_type: CredentialType;
  created_at: string;
  updated_at: string;
  encrypted_data: string;
  display_name: string;
  masked_value: string;
}

// Decrypted credential for agent use
interface DecryptedCredential {
  service_name: ServiceName;
  credential_type: CredentialType;
  data: CredentialPayload;
}
```

### Service-Specific Configurations

```typescript
interface ServiceConfig {
  hubspot: {
    authorizationURL: string;
    tokenURL: string;
    clientId: string;
    clientSecret: string;
    redirectURI: string;
    scopes: string[];
  };
  stripe: {
    apiBaseURL: string;
    keyPattern: RegExp;
    smokeTestEndpoint: string;
  };
  mixpanel: {
    apiBaseURL: string;
    smokeTestEndpoint: string;
  };
}

const SERVICE_CONFIG: ServiceConfig = {
  hubspot: {
    authorizationURL: 'https://app.hubspot.com/oauth/authorize',
    tokenURL: 'https://api.hubapi.com/oauth/v1/token',
    clientId: process.env.HUBSPOT_CLIENT_ID!,
    clientSecret: process.env.HUBSPOT_CLIENT_SECRET!,
    redirectURI: process.env.HUBSPOT_REDIRECT_URI!,
    scopes: ['crm.objects.companies.read', 'crm.objects.deals.read']
  },
  stripe: {
    apiBaseURL: 'https://api.stripe.com/v1',
    keyPattern: /^sk_(test|live)_[a-zA-Z0-9]+$/,
    smokeTestEndpoint: '/account'
  },
  mixpanel: {
    apiBaseURL: 'https://mixpanel.com/api/2.0',
    smokeTestEndpoint: '/engage'
  }
};
```

### Error Types

```typescript
class CredentialError extends Error {
  constructor(
    message: string,
    public code: string,
    public serviceName?: string
  ) {
    super(message);
    this.name = 'CredentialError';
  }
}

// Error codes
const ERROR_CODES = {
  INVALID_FORMAT: 'INVALID_FORMAT',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  ENCRYPTION_FAILED: 'ENCRYPTION_FAILED',
  DECRYPTION_FAILED: 'DECRYPTION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  OAUTH_EXCHANGE_FAILED: 'OAUTH_EXCHANGE_FAILED',
  REFRESH_FAILED: 'REFRESH_FAILED',
  TIMEOUT: 'TIMEOUT',
  STORAGE_FAILED: 'STORAGE_FAILED'
} as const;
```



## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property 1: Encryption Round-Trip Preservation

*For any* credential payload (OAuth, API key, or service account), encrypting then decrypting should produce an equivalent credential object with all fields intact.

**Validates: Requirements 2.1, 2.2, 3.3, 4.3, 5.3, 8.2**

### Property 2: Credential Uniqueness Per User-Service Pair

*For any* user_id and service_name combination, storing a second credential should overwrite the first, ensuring exactly one credential exists per user-service pair.

**Validates: Requirements 1.5**

### Property 3: Encrypted Payload Completeness

*For any* credential type, the decrypted payload should contain all required fields: refresh_token and token_expiry for OAuth, api_key for API keys, username and secret for service accounts.

**Validates: Requirements 1.2, 1.3, 1.4**

### Property 4: Stripe Key Format Validation

*For any* string input, the Stripe key validator should accept only strings matching the pattern `sk_(test|live)_[a-zA-Z0-9]+` and reject all other formats.

**Validates: Requirements 4.1**

### Property 5: Mixpanel Credential Non-Empty Validation

*For any* username and secret pair, the Mixpanel validator should reject credentials where either field is empty or contains only whitespace.

**Validates: Requirements 5.1**

### Property 6: Credential Masking Consistency

*For any* credential value with length > 4, masking should produce a string where only the last 4 characters are visible and all preceding characters are replaced with asterisks.

**Validates: Requirements 4.5, 5.5, 7.1, 7.2**

### Property 7: Selective Field Masking

*For any* credential record, masking should be applied to sensitive fields (api_key, secret, refresh_token) but NOT to non-sensitive fields (username, service_name, display_name).

**Validates: Requirements 7.3, 7.4**

### Property 8: Expired Token Refresh Trigger

*For any* OAuth credential with an expired access_token (token_expiry < current time), retrieving the credential should trigger an automatic token refresh before returning to the caller.

**Validates: Requirements 3.4, 8.3**

### Property 9: Error Message PII Exclusion

*For any* error that occurs during credential operations, the error message should not contain sensitive data patterns (API keys, secrets, tokens, passwords) verified by regex matching.

**Validates: Requirements 9.5**

### Property 10: DynamoDB Payload Size Limit

*For any* credential record stored in DynamoDB, the total item size (including all attributes) should be less than 10KB to ensure efficient storage and retrieval.

**Validates: Requirements 10.5**

## Error Handling

### Encryption/Decryption Failures

**KMS Encryption Failure**:
- Log error with context (user_id, service_name) but NOT credential data
- Return user-friendly error: "Unable to securely store credentials. Please try again."
- Do not write to DynamoDB
- HTTP status: 500

**KMS Decryption Failure**:
- Log error with context (user_id, service_name)
- Return user-friendly error: "Unable to retrieve credentials. Please reconnect the service."
- HTTP status: 500

**Implementation Pattern**:
```typescript
try {
  const encryptedData = await encryptCredential(credential, kmsKeyId);
} catch (error) {
  console.error('KMS encryption failed', {
    user_id: userId,
    service_name: serviceName,
    error: error.message
  });
  throw new CredentialError(
    'Unable to securely store credentials',
    ERROR_CODES.ENCRYPTION_FAILED,
    serviceName
  );
}
```

### Validation Failures

**Invalid Format (Stripe)**:
- Return immediately without API call
- Error message: "Invalid Stripe API key format. Must start with sk_test_ or sk_live_"
- HTTP status: 400

**Smoke Test Failure**:
- Log the API response status and error
- Return descriptive error based on status code:
  - 401: "Invalid credentials. Please check your API key/credentials."
  - 403: "Credentials lack required permissions."
  - 429: "Rate limit exceeded. Please try again in a few minutes."
  - 5xx: "Service temporarily unavailable. Please try again later."
- HTTP status: 400

**Timeout (5 seconds)**:
- Abort API request using AbortSignal
- Return error: "Validation timeout. Please check your network connection."
- HTTP status: 408

**Implementation Pattern**:
```typescript
try {
  const response = await fetch(apiUrl, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(5000)
  });
  
  if (!response.ok) {
    const errorMessage = getErrorMessageForStatus(response.status);
    throw new CredentialError(errorMessage, ERROR_CODES.VALIDATION_FAILED, serviceName);
  }
} catch (error) {
  if (error.name === 'TimeoutError') {
    throw new CredentialError(
      'Validation timeout. Please check your network connection.',
      ERROR_CODES.TIMEOUT,
      serviceName
    );
  }
  throw error;
}
```

### OAuth Failures

**Authorization Code Exchange Failure**:
- Log OAuth error response
- Return error: "Failed to connect to HubSpot. Please try again."
- Redirect user back to connections page with error message
- HTTP status: 400

**Token Refresh Failure**:
- Log refresh error with user_id and service_name
- Mark credential as "needs reconnection" in UI
- Return error to agent: "HubSpot credentials expired. User must reconnect."
- Do not delete existing credential (user may want to reconnect)
- HTTP status: 401

**OAuth Error Parameter**:
- If callback receives `?error=access_denied`, show: "Authorization cancelled. No credentials were stored."
- If callback receives other error, show: "Authorization failed: {error_description}"
- HTTP status: 400

### DynamoDB Failures

**PutItem Failure**:
- Retry once with exponential backoff (1 second delay)
- If retry fails, log error and return: "Unable to save credentials. Please try again."
- HTTP status: 500

**GetItem Failure**:
- Retry once with exponential backoff
- If retry fails, log error and return: "Unable to retrieve credentials. Please try again."
- HTTP status: 500

**Credential Not Found**:
- Return error: "Service not connected. Please connect {service_name} first."
- HTTP status: 404

**Implementation Pattern**:
```typescript
async function storeCredential(record: CredentialRecord, retries = 1): Promise<void> {
  const client = new DynamoDBClient({ region: process.env.AWS_REGION });
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await client.send(new PutItemCommand({
        TableName: process.env.CREDENTIAL_TABLE_NAME,
        Item: marshall(record)
      }));
      return;
    } catch (error) {
      console.error('DynamoDB PutItem failed', {
        attempt: attempt + 1,
        user_id: record.user_id,
        service_name: record.service_name,
        error: error.message
      });
      
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      } else {
        throw new CredentialError(
          'Unable to save credentials',
          ERROR_CODES.STORAGE_FAILED,
          record.service_name
        );
      }
    }
  }
}
```

### Security Considerations

**Never Log Sensitive Data**:
```typescript
// ❌ BAD
console.error('Validation failed', { apiKey, secret });

// ✅ GOOD
console.error('Validation failed', {
  user_id: userId,
  service_name: serviceName,
  error: error.message
});
```

**Sanitize Error Messages**:
```typescript
function sanitizeErrorMessage(error: Error): string {
  // Remove any potential credential data from error messages
  let message = error.message;
  
  // Remove API keys (sk_test_*, sk_live_*)
  message = message.replace(/sk_(test|live)_[a-zA-Z0-9]+/g, '[REDACTED]');
  
  // Remove tokens
  message = message.replace(/[a-zA-Z0-9_-]{20,}/g, '[REDACTED]');
  
  // Remove email addresses
  message = message.replace(/[\w\.-]+@[\w\.-]+\.\w+/g, '[REDACTED]');
  
  return message;
}
```

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests for comprehensive coverage:

- **Unit tests**: Verify specific examples, edge cases, and error conditions
- **Property tests**: Verify universal properties across all inputs
- Both are complementary and necessary

### Unit Testing Focus

Unit tests should cover:
- Specific OAuth flow examples with mocked HubSpot API
- Specific Stripe/Mixpanel validation examples with mocked APIs
- Edge cases: empty strings, malformed keys, timeout scenarios
- Error conditions: KMS failures, DynamoDB failures, API errors
- Integration points: Lambda invocations, API route handlers
- Token refresh logic with expired tokens

Avoid writing excessive unit tests for scenarios better covered by property tests (e.g., testing masking with many different string lengths).

### Property-Based Testing

**Library**: Use `fast-check` for TypeScript/Node.js property-based testing

**Configuration**:
- Minimum 100 iterations per property test
- Each test must reference its design document property
- Tag format: `Feature: hybrid-integration-vault, Property {number}: {property_text}`

**Property Test Coverage**:

```typescript
// Example property test structure
import fc from 'fast-check';

describe('Feature: hybrid-integration-vault, Property 1: Encryption Round-Trip Preservation', () => {
  it('should preserve all credential fields through encrypt-decrypt cycle', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          refresh_token: fc.string({ minLength: 20 }),
          access_token: fc.string({ minLength: 20 }),
          token_expiry: fc.date().map(d => d.toISOString()),
          scope: fc.string()
        }),
        async (credential) => {
          const encrypted = await encryptCredential(credential, TEST_KMS_KEY_ID);
          const decrypted = await decryptCredential(encrypted, TEST_KMS_KEY_ID);
          
          expect(decrypted).toEqual(credential);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

**Test Organization**:
```
/packages/lambdas/credential-vault/__tests__/
  encryption.property.test.ts      # Properties 1, 3
  validation.property.test.ts      # Properties 4, 5
  masking.property.test.ts         # Properties 6, 7
  retrieval.property.test.ts       # Property 8
  security.property.test.ts        # Property 9
  storage.property.test.ts         # Properties 2, 10
  
  oauth.test.ts                    # Unit tests for OAuth flow
  stripe-validation.test.ts        # Unit tests for Stripe validation
  mixpanel-validation.test.ts      # Unit tests for Mixpanel validation
  error-handling.test.ts           # Unit tests for error scenarios
```

### Integration Testing

**Mock External Services**:
- Mock HubSpot OAuth endpoints (authorization, token exchange, refresh)
- Mock Stripe API (account retrieval)
- Mock Mixpanel API (engage query)
- Mock AWS services (KMS, DynamoDB) using AWS SDK mocks

**Test Scenarios**:
- Complete OAuth flow from authorization to storage
- Complete API key validation and storage flow
- Complete service account validation and storage flow
- Credential retrieval with automatic token refresh
- Error recovery paths for all failure modes

**Local Testing Setup**:
```typescript
// Use LocalStack for local AWS service emulation
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { KMSClient } from '@aws-sdk/client-kms';

const localConfig = {
  endpoint: 'http://localhost:4566',
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test'
  }
};

const dynamoClient = new DynamoDBClient(localConfig);
const kmsClient = new KMSClient(localConfig);
```

### Manual Testing Checklist

- [ ] Deploy Lambda functions to AWS
- [ ] Create DynamoDB table with correct schema
- [ ] Create KMS key and configure IAM permissions
- [ ] Test OAuth flow end-to-end in browser
- [ ] Test Stripe key validation with real test key
- [ ] Test Mixpanel validation with real credentials
- [ ] Verify credentials are encrypted in DynamoDB console
- [ ] Verify masked display in Next.js UI
- [ ] Test agent credential retrieval
- [ ] Test token refresh with expired token
- [ ] Verify CloudWatch logs contain no sensitive data
- [ ] Test error scenarios (invalid keys, timeouts, etc.)

## Implementation Notes

### Lambda Function Organization

Create separate Lambda functions for clear separation of concerns:

```
/packages/lambdas/credential-vault/
  src/
    oauth-handler/
      index.ts              # Lambda entry point
      hubspot.ts            # HubSpot-specific OAuth logic
      state-manager.ts      # CSRF state token management
    
    validation/
      index.ts              # Lambda entry point
      stripe.ts             # Stripe validation logic
      mixpanel.ts           # Mixpanel validation logic
      validators.ts         # Shared validation utilities
    
    retrieval/
      index.ts              # Lambda entry point
      refresh.ts            # Token refresh logic
    
    shared/
      encryption.ts         # KMS encryption/decryption
      storage.ts            # DynamoDB operations
      masking.ts            # Credential masking utilities
      errors.ts             # Error types and handlers
      types.ts              # Shared TypeScript types
```

### Environment Variables

**OAuth Handler Lambda**:
```bash
HUBSPOT_CLIENT_ID=your_client_id
HUBSPOT_CLIENT_SECRET=your_client_secret
HUBSPOT_REDIRECT_URI=https://yourdomain.com/api/integrations/oauth/hubspot/callback
KMS_KEY_ID=arn:aws:kms:us-east-1:123456789012:key/...
CREDENTIAL_TABLE_NAME=sesari-credentials
AWS_REGION=us-east-1
STATE_SECRET=random_secret_for_csrf_tokens
```

**Validation Lambda**:
```bash
KMS_KEY_ID=arn:aws:kms:us-east-1:123456789012:key/...
CREDENTIAL_TABLE_NAME=sesari-credentials
AWS_REGION=us-east-1
VALIDATION_TIMEOUT_MS=5000
```

**Retrieval Lambda**:
```bash
KMS_KEY_ID=arn:aws:kms:us-east-1:123456789012:key/...
CREDENTIAL_TABLE_NAME=sesari-credentials
AWS_REGION=us-east-1
HUBSPOT_CLIENT_ID=your_client_id
HUBSPOT_CLIENT_SECRET=your_client_secret
```

### IAM Permissions

**Lambda Execution Role**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt"
      ],
      "Resource": "arn:aws:kms:us-east-1:123456789012:key/..."
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query"
      ],
      "Resource": "arn:aws:dynamodb:us-east-1:123456789012:table/sesari-credentials"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```

### DynamoDB Table Creation

```typescript
import { DynamoDBClient, CreateTableCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({ region: 'us-east-1' });

await client.send(new CreateTableCommand({
  TableName: 'sesari-credentials',
  KeySchema: [
    { AttributeName: 'user_id', KeyType: 'HASH' },
    { AttributeName: 'service_name', KeyType: 'RANGE' }
  ],
  AttributeDefinitions: [
    { AttributeName: 'user_id', AttributeType: 'S' },
    { AttributeName: 'service_name', AttributeType: 'S' }
  ],
  BillingMode: 'PAY_PER_REQUEST'  // On-demand pricing for Free Tier
}));
```

### KMS Key Creation

```typescript
import { KMSClient, CreateKeyCommand, CreateAliasCommand } from '@aws-sdk/client-kms';

const client = new KMSClient({ region: 'us-east-1' });

// Create key
const keyResponse = await client.send(new CreateKeyCommand({
  Description: 'Encryption key for Sesari integration credentials',
  KeyUsage: 'ENCRYPT_DECRYPT',
  Origin: 'AWS_KMS'
}));

// Create alias
await client.send(new CreateAliasCommand({
  AliasName: 'alias/sesari-credential-vault',
  TargetKeyId: keyResponse.KeyMetadata!.KeyId
}));
```

### CSRF State Token Management

For OAuth flows, implement secure state token generation and validation:

```typescript
import { createHmac, randomBytes } from 'crypto';

interface StateToken {
  userId: string;
  timestamp: number;
  nonce: string;
}

function generateStateToken(userId: string): string {
  const state: StateToken = {
    userId,
    timestamp: Date.now(),
    nonce: randomBytes(16).toString('hex')
  };
  
  const payload = Buffer.from(JSON.stringify(state)).toString('base64');
  const signature = createHmac('sha256', process.env.STATE_SECRET!)
    .update(payload)
    .digest('hex');
  
  return `${payload}.${signature}`;
}

function validateStateToken(token: string): StateToken {
  const [payload, signature] = token.split('.');
  
  // Verify signature
  const expectedSignature = createHmac('sha256', process.env.STATE_SECRET!)
    .update(payload)
    .digest('hex');
  
  if (signature !== expectedSignature) {
    throw new Error('Invalid state token signature');
  }
  
  // Parse and validate timestamp (must be within 10 minutes)
  const state: StateToken = JSON.parse(Buffer.from(payload, 'base64').toString());
  
  if (Date.now() - state.timestamp > 10 * 60 * 1000) {
    throw new Error('State token expired');
  }
  
  return state;
}
```

### Next.js API Route Implementation

**Example: Stripe Connection Route**:
```typescript
// app/api/integrations/connect/stripe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { getServerSession } from 'next-auth';

export async function POST(request: NextRequest) {
  // 1. Authenticate user
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error_message: 'Unauthorized' },
      { status: 401 }
    );
  }
  
  // 2. Parse request
  const { apiKey } = await request.json();
  
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error_message: 'API key is required' },
      { status: 400 }
    );
  }
  
  // 3. Invoke validation Lambda
  const lambda = new LambdaClient({ region: process.env.AWS_REGION });
  
  try {
    const response = await lambda.send(new InvokeCommand({
      FunctionName: process.env.VALIDATION_LAMBDA_ARN,
      Payload: JSON.stringify({
        action: 'validate_stripe',
        user_id: session.user.id,
        api_key: apiKey
      })
    }));
    
    const result = JSON.parse(Buffer.from(response.Payload!).toString());
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        masked_value: result.credential_record.masked_value
      });
    } else {
      return NextResponse.json(
        { success: false, error_message: result.error_message },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Lambda invocation failed', {
      user_id: session.user.id,
      error: error.message
    });
    
    return NextResponse.json(
      { success: false, error_message: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### Performance Optimization

**Lambda Cold Start Mitigation**:
- Keep Lambda bundle size small (<5MB)
- Use AWS SDK v3 with modular imports
- Initialize AWS clients outside handler function
- Consider Lambda provisioned concurrency for critical paths (if needed)

**DynamoDB Query Optimization**:
- Always query using primary key (user_id + service_name)
- Avoid scans (not needed for this use case)
- Use consistent reads only when necessary (eventually consistent is fine for most cases)

**KMS Operation Batching**:
- Encrypt/decrypt in batches when processing multiple credentials
- Cache decrypted credentials in Lambda memory for duration of execution
- Do not cache across invocations (security risk)

### Monitoring and Observability

**CloudWatch Metrics**:
```typescript
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

async function recordMetric(metricName: string, value: number, unit: string) {
  const cloudwatch = new CloudWatchClient({ region: process.env.AWS_REGION });
  
  await cloudwatch.send(new PutMetricDataCommand({
    Namespace: 'Sesari/CredentialVault',
    MetricData: [{
      MetricName: metricName,
      Value: value,
      Unit: unit,
      Timestamp: new Date()
    }]
  }));
}

// Usage
await recordMetric('CredentialStored', 1, 'Count');
await recordMetric('ValidationSuccess', 1, 'Count');
await recordMetric('ValidationFailure', 1, 'Count');
await recordMetric('TokenRefresh', 1, 'Count');
```

**CloudWatch Alarms**:
- Alert if validation failure rate > 50% over 5 minutes
- Alert if KMS encryption/decryption errors > 5 in 5 minutes
- Alert if DynamoDB throttling occurs
- Alert if Lambda error rate > 10% over 5 minutes

**Structured Logging**:
```typescript
interface LogContext {
  user_id: string;
  service_name: string;
  action: string;
  duration_ms?: number;
  error?: string;
}

function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, context: LogContext) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context
  }));
}

// Usage
log('INFO', 'Credential stored successfully', {
  user_id: userId,
  service_name: 'stripe',
  action: 'store_credential',
  duration_ms: 150
});
```

## Security Considerations

### Data Protection

**Encryption at Rest**:
- All sensitive credential data encrypted with KMS before storage
- DynamoDB table uses AWS-managed encryption (default)
- KMS key rotation enabled (automatic annual rotation)

**Encryption in Transit**:
- All API calls use HTTPS/TLS
- Lambda-to-Lambda communication within VPC (if needed)
- No credential data transmitted in URL parameters

**Access Control**:
- Lambda execution role has least-privilege IAM permissions
- KMS key policy restricts access to specific Lambda roles
- DynamoDB table has resource-based policies
- Next.js API routes require authentication

### Credential Lifecycle

**Storage Duration**:
- Credentials persist until user explicitly disconnects service
- No automatic expiration (OAuth refresh tokens are long-lived)
- User can view and disconnect services at any time

**Deletion**:
```typescript
async function deleteCredential(userId: string, serviceName: string): Promise<void> {
  const client = new DynamoDBClient({ region: process.env.AWS_REGION });
  
  await client.send(new DeleteItemCommand({
    TableName: process.env.CREDENTIAL_TABLE_NAME,
    Key: marshall({
      user_id: userId,
      service_name: serviceName
    })
  }));
  
  log('INFO', 'Credential deleted', {
    user_id: userId,
    service_name: serviceName,
    action: 'delete_credential'
  });
}
```

**Audit Trail**:
- Log all credential operations (store, retrieve, delete, refresh)
- Include user_id, service_name, action, timestamp
- Never log credential values
- Retain logs for 90 days in CloudWatch

### Compliance Considerations

**GDPR/CCPA**:
- Users can delete their credentials at any time
- Credentials are deleted when user account is deleted
- No credential data shared with third parties
- Data residency: Store in user's preferred AWS region

**SOC 2**:
- Encryption at rest and in transit
- Access logging and monitoring
- Least-privilege access control
- Regular security reviews

## Dependencies

### External Services
- HubSpot OAuth API
- Stripe REST API
- Mixpanel Query API

### AWS Services
- AWS Lambda (compute)
- Amazon DynamoDB (storage)
- AWS KMS (encryption)
- Amazon CloudWatch (monitoring)
- AWS IAM (access control)

### NPM Packages
```json
{
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.x",
    "@aws-sdk/client-kms": "^3.x",
    "@aws-sdk/client-lambda": "^3.x",
    "@aws-sdk/client-cloudwatch": "^3.x",
    "@aws-sdk/util-dynamodb": "^3.x"
  },
  "devDependencies": {
    "@types/node": "^20.x",
    "typescript": "^5.x",
    "vitest": "^1.x",
    "fast-check": "^3.x",
    "@aws-sdk/types": "^3.x"
  }
}
```

### Development Tools
- LocalStack (local AWS service emulation)
- Vitest (unit and property testing)
- fast-check (property-based testing library)
- AWS SAM CLI (Lambda local testing)

## Future Enhancements

### Additional Integrations
- Google Analytics service account
- Salesforce OAuth
- Intercom API key
- Segment API key

### Advanced Features
- Credential rotation reminders (notify user to rotate keys every 90 days)
- Multi-region credential replication for disaster recovery
- Credential health monitoring (periodic smoke tests)
- Credential usage analytics (track which services are actively used)
- Bulk credential import/export for team management

### Security Enhancements
- Hardware security module (HSM) integration for key storage
- Multi-factor authentication for sensitive credential operations
- IP allowlisting for credential access
- Anomaly detection for unusual credential access patterns
