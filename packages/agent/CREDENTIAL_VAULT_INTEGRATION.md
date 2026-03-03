# Credential Vault Integration Guide

This document explains how the ICP Refinement Engine integrates with the Credential Vault for secure API credential management.

## Overview

The ICP Refinement Engine retrieves API credentials from a centralized Credential Vault Lambda function instead of reading them from environment variables. This provides:

- **Security**: Credentials encrypted with AWS KMS
- **OAuth Support**: Automatic token refresh for HubSpot
- **Centralized Management**: Single source of truth for all API credentials
- **User-Specific Credentials**: Each user has their own set of service connections

## Architecture

```
ICP Refinement Lambda
    ↓ (invokes with userId)
Credential Vault Lambda
    ↓ (retrieves encrypted credentials)
DynamoDB (KMS-encrypted)
    ↓ (returns decrypted credentials)
ICP Refinement Lambda
    ↓ (makes API calls)
HubSpot / Mixpanel / Stripe APIs
```

## Prerequisites

### 1. Credential Vault Deployment

The Credential Vault Lambda must be deployed before the ICP Refinement Engine:

```bash
cd packages/lambdas/credential-vault
npm run deploy
```

See `packages/lambdas/credential-vault/README.md` for detailed deployment instructions.

**Important**: The Credential Vault includes:
- Lambda functions for credential storage and retrieval
- DynamoDB table encrypted with AWS KMS
- IAM roles with appropriate permissions
- Token refresh mechanism for OAuth services

### 2. DynamoDB Table Requirements

The Credential Vault uses a DynamoDB table with the following characteristics:

- **Table Name**: `credential-vault` (configurable)
- **Partition Key**: `userId` (String)
- **Sort Key**: `serviceName` (String)
- **Encryption**: Server-side encryption with AWS KMS
- **Billing Mode**: On-demand (scales to zero)

The table is automatically created by the deployment script.

### 3. Service Connections

Users must connect their services via the integration UI before running ICP refinement:

- **HubSpot**: OAuth 2.0 flow (access token + refresh token)
- **Mixpanel**: Service account credentials (username + secret)
- **Stripe**: Restricted API key

Navigate to `/integrations` in the web app to connect services.

**OAuth Token Refresh**: HubSpot OAuth tokens are automatically refreshed by the Credential Vault when they expire. The refresh happens transparently during credential retrieval, so the ICP Refinement Engine always receives valid tokens.

### 4. IAM Permissions

The ICP Refinement Lambda execution role must have permission to invoke the Credential Vault Lambda:

```json
{
  "Effect": "Allow",
  "Action": ["lambda:InvokeFunction"],
  "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:credential-vault"
}
```

## Configuration

### Environment Variables

Set the Credential Vault Lambda ARN in the ICP Refinement Lambda environment:

```bash
export CREDENTIAL_VAULT_LAMBDA_ARN="arn:aws:lambda:us-east-1:123456789012:function:credential-vault"
```

### Removed Environment Variables

The following environment variables are NO LONGER USED:

- ~~`HUBSPOT_API_KEY`~~ (now retrieved from vault)
- ~~`MIXPANEL_API_KEY`~~ (now retrieved from vault)
- ~~`STRIPE_API_KEY`~~ (now retrieved from vault)

## Usage in Code

### Fetching Credentials

The data-fetching module uses `getServiceCredentials()` to retrieve credentials:

```typescript
import { getServiceCredentials } from './data-fetching';

// Retrieve HubSpot OAuth credentials
const hubspotCreds = await getServiceCredentials(userId, 'hubspot');
// Returns: { accessToken: string, tokenType: 'Bearer' }

// Retrieve Mixpanel service account credentials
const mixpanelCreds = await getServiceCredentials(userId, 'mixpanel');
// Returns: { username: string, secret: string }

// Retrieve Stripe API key
const stripeCreds = await getServiceCredentials(userId, 'stripe');
// Returns: { apiKey: string }
```

### Service-Specific Authentication

Each service uses a different authentication pattern:

**HubSpot (OAuth 2.0)**:
```typescript
headers: {
  'Authorization': `Bearer ${credentials.accessToken}`,
  'Content-Type': 'application/json'
}
```

**Mixpanel (Basic Auth)**:
```typescript
const auth = Buffer.from(`${credentials.username}:${credentials.secret}`).toString('base64');
headers: {
  'Authorization': `Basic ${auth}`,
  'Content-Type': 'application/json'
}
```

**Stripe (Bearer Token)**:
```typescript
headers: {
  'Authorization': `Bearer ${credentials.apiKey}`,
  'Content-Type': 'application/json'
}
```

### Automatic Token Refresh

HubSpot OAuth tokens are automatically refreshed by the Credential Vault:

- When `getServiceCredentials(userId, 'hubspot')` is called, the vault checks token expiration
- If the access token is expired, the vault automatically refreshes it using the refresh token
- The ICP Refinement Engine always receives a valid, non-expired access token
- No manual token refresh logic is needed in the data-fetching module

## Error Handling

### Service Not Connected

If a user hasn't connected a service, `getServiceCredentials()` throws an error:

```typescript
try {
  const credentials = await getServiceCredentials(userId, 'hubspot');
} catch (error) {
  if (error.message.includes('not connected')) {
    console.error('HubSpot is not connected for this user');
    // Handle gracefully or abort analysis
  }
}
```

### Credential Retrieval Failure

If the Credential Vault Lambda fails:

```typescript
try {
  const credentials = await getServiceCredentials(userId, 'stripe');
} catch (error) {
  console.error('Failed to retrieve Stripe credentials:', error);
  // Retry or abort analysis
}
```

### Service-Specific Handling

- **HubSpot failure**: Abort analysis (critical data source)
- **Mixpanel failure**: Continue with null values (optional data source)
- **Stripe failure**: Continue with null values (optional data source)

## Security Considerations

### Credentials Never in Environment Variables

- API credentials are NEVER stored in Lambda environment variables
- Credentials are retrieved on-demand from the encrypted vault
- Credentials are decrypted in-memory and never persisted

### KMS Encryption

- All credentials in DynamoDB are encrypted with AWS KMS
- Decryption happens in the Credential Vault Lambda
- ICP Refinement Lambda receives plaintext credentials over secure Lambda invocation

### User Isolation

- Each user has their own set of credentials in the vault
- `userId` parameter ensures credentials are retrieved for the correct user
- No cross-user credential access is possible

### Audit Trail

- All credential retrievals are logged in CloudWatch
- Logs include userId, serviceName, and timestamp
- Logs NEVER include actual credential values

## Troubleshooting

### "Service not connected" Error

**Cause**: User hasn't connected the service via the integration UI

**Solution**:
1. Navigate to `/integrations` in the web app
2. Click "Connect" for the required service
3. Complete the OAuth flow (HubSpot) or enter credentials (Mixpanel, Stripe)
4. Retry ICP refinement

**Verification**:
```bash
# Check if service is connected
aws dynamodb get-item \
  --table-name credential-vault \
  --key '{"userId":{"S":"user_123"},"serviceName":{"S":"hubspot"}}'
```

If the item doesn't exist, the service is not connected.

### "Credential vault Lambda not found" Error

**Cause**: `CREDENTIAL_VAULT_LAMBDA_ARN` environment variable is not set or incorrect

**Solution**:
1. Verify the Credential Vault Lambda is deployed
2. Get the Lambda ARN: `aws lambda get-function --function-name credential-vault --query 'Configuration.FunctionArn'`
3. Set the environment variable in ICP Refinement Lambda configuration

### "Access Denied" Error

**Cause**: ICP Refinement Lambda doesn't have permission to invoke Credential Vault Lambda

**Solution**:
1. Add `lambda:InvokeFunction` permission to the IAM role
2. See IAM policy example in `infrastructure/iam-policy.json`
3. Verify the resource ARN matches the Credential Vault Lambda ARN

**Verification**:
```bash
# Check IAM role policies
aws iam list-attached-role-policies --role-name icp-refinement-lambda-role
aws iam get-role-policy --role-name icp-refinement-lambda-role --policy-name icp-refinement-permissions
```

### HubSpot Token Expired

**Cause**: OAuth refresh token is invalid or expired (rare, but possible if user revoked access)

**Solution**:
1. User must reconnect HubSpot via the integration UI
2. Complete the OAuth flow to get a new refresh token
3. Retry ICP refinement

**Note**: The Credential Vault automatically refreshes access tokens using the refresh token. This error only occurs if the refresh token itself is invalid.

### Mixpanel Authentication Failed

**Cause**: Service account credentials are incorrect or have been rotated

**Solution**:
1. Verify credentials in Mixpanel dashboard (Project Settings → Service Accounts)
2. Reconnect Mixpanel via the integration UI with updated credentials
3. Retry ICP refinement

### Stripe API Key Invalid

**Cause**: API key has been deleted or rotated in Stripe dashboard

**Solution**:
1. Generate a new restricted API key in Stripe dashboard
2. Ensure the key has read permissions for customers and subscriptions
3. Reconnect Stripe via the integration UI with the new key
4. Retry ICP refinement

### KMS Decryption Failed

**Cause**: Lambda execution role doesn't have permission to use the KMS key

**Solution**:
1. Verify the Credential Vault Lambda role has `kms:Decrypt` permission
2. Check the KMS key policy allows the Lambda role to decrypt
3. See `packages/lambdas/credential-vault/scripts/setup-kms.ts` for key policy setup

## Testing

### Manual Testing

Test credential retrieval with a manual Lambda invocation:

```bash
aws lambda invoke \
  --function-name icp-refinement-engine \
  --payload '{"source":"manual","triggerType":"manual","userId":"user_123"}' \
  response.json
```

Check CloudWatch logs for credential retrieval success:

```
[INFO] Retrieving credentials for service: hubspot
[INFO] Successfully retrieved hubspot credentials
```

### Unit Testing

Mock the `getServiceCredentials()` function in tests:

```typescript
vi.mock('./data-fetching', () => ({
  getServiceCredentials: vi.fn().mockResolvedValue({
    accessToken: 'mock-token',
    tokenType: 'Bearer'
  })
}));
```

## Migration from Environment Variables

If you're migrating from the old environment variable approach:

1. **Remove** API keys from Lambda environment variables
2. **Deploy** Credential Vault Lambda
3. **Connect** services via integration UI
4. **Set** `CREDENTIAL_VAULT_LAMBDA_ARN` environment variable
5. **Update** IAM role with `lambda:InvokeFunction` permission
6. **Test** with manual invocation

## References

- Credential Vault README: `packages/lambdas/credential-vault/README.md`
- Bugfix Spec: `.kiro/specs/vault-integration-data-fetching/bugfix.md`
- Integration UI: `src/app/integrations/page.tsx`
- Data Fetching Module: `packages/agent/src/icp-refinement/data-fetching.ts`
