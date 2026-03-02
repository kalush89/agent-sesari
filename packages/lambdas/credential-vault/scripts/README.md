# Infrastructure Setup Scripts

This directory contains scripts to set up and deploy the Sesari Credential Vault infrastructure on AWS.

## Prerequisites

1. AWS CLI configured with appropriate credentials
2. Node.js 20.x or later
3. Required environment variables:
   - `AWS_REGION` - AWS region (e.g., us-east-1)
   - `AWS_ACCOUNT_ID` - Your AWS account ID
   - `HUBSPOT_CLIENT_ID` - HubSpot OAuth client ID
   - `HUBSPOT_CLIENT_SECRET` - HubSpot OAuth client secret
   - `HUBSPOT_REDIRECT_URI` - HubSpot OAuth redirect URI

## Quick Start

Run all setup steps in order:

```bash
npm run setup:all
```

This will:
1. Create DynamoDB table
2. Create KMS encryption key
3. Set up IAM roles and policies
4. Deploy Lambda functions

## Individual Scripts

### 1. DynamoDB Setup

Creates the `sesari-credentials` table with composite primary key.

```bash
npm run setup:dynamodb
```

**What it does:**
- Creates table with `user_id` (partition key) and `service_name` (sort key)
- Configures PAY_PER_REQUEST billing mode for Free Tier compliance
- Adds project tags

### 2. KMS Setup

Creates a customer-managed KMS key for credential encryption.

```bash
npm run setup:kms
```

**What it does:**
- Creates KMS key with encryption/decryption permissions
- Creates alias `alias/sesari-credential-vault`
- Configures key policy for Lambda execution roles

### 3. IAM Setup

Creates Lambda execution role with required policies.

```bash
npm run setup:iam
```

**What it does:**
- Creates role `sesari-credential-vault-lambda-role`
- Attaches policy for KMS operations
- Attaches policy for DynamoDB operations
- Attaches policy for CloudWatch logging

### 4. Lambda Deployment

Builds and deploys all Lambda functions.

```bash
npm run deploy:lambdas
```

**What it does:**
- Compiles TypeScript to JavaScript
- Packages code into deployment zip
- Creates or updates 5 Lambda functions:
  - `sesari-stripe-validation`
  - `sesari-mixpanel-validation`
  - `sesari-hubspot-oauth`
  - `sesari-token-refresh`
  - `sesari-credential-retrieval`

## Environment Variables

Create a `.env` file in the credential-vault directory:

```bash
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=123456789012
HUBSPOT_CLIENT_ID=your-client-id
HUBSPOT_CLIENT_SECRET=your-client-secret
HUBSPOT_REDIRECT_URI=https://yourdomain.com/api/integrations/oauth/hubspot/callback
```

## Troubleshooting

### Permission Errors

Ensure your AWS credentials have permissions for:
- DynamoDB: CreateTable, DescribeTable
- KMS: CreateKey, CreateAlias
- IAM: CreateRole, CreatePolicy, AttachRolePolicy
- Lambda: CreateFunction, UpdateFunctionCode

### Function Already Exists

The scripts handle existing resources gracefully. If a resource exists, it will be updated rather than recreated.

### Build Failures

Ensure all dependencies are installed:

```bash
npm install
```

## AWS Free Tier Compliance

All infrastructure is configured to stay within AWS Free Tier limits:
- DynamoDB: On-demand pricing (no provisioned capacity)
- Lambda: 5 functions × estimated 2K invocations/month = 10K total (well within 1M free)
- KMS: Single key with estimated <1K operations/month (within 20K free)

## Manual Cleanup

To remove all infrastructure:

```bash
# Delete Lambda functions
aws lambda delete-function --function-name sesari-stripe-validation
aws lambda delete-function --function-name sesari-mixpanel-validation
aws lambda delete-function --function-name sesari-hubspot-oauth
aws lambda delete-function --function-name sesari-token-refresh
aws lambda delete-function --function-name sesari-credential-retrieval

# Delete IAM resources
aws iam detach-role-policy --role-name sesari-credential-vault-lambda-role --policy-arn arn:aws:iam::ACCOUNT_ID:policy/sesari-credential-vault-policy
aws iam delete-policy --policy-arn arn:aws:iam::ACCOUNT_ID:policy/sesari-credential-vault-policy
aws iam delete-role --role-name sesari-credential-vault-lambda-role

# Schedule KMS key deletion (7-day waiting period)
aws kms schedule-key-deletion --key-id alias/sesari-credential-vault --pending-window-in-days 7

# Delete DynamoDB table
aws dynamodb delete-table --table-name sesari-credentials
```
