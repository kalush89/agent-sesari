# Stripe Connector Infrastructure Deployment

This directory contains deployment scripts for the Stripe Connector Lambda function, which processes Stripe webhooks and detects revenue signals (expansion, churn, failed payments).

## Prerequisites

### Required Tools
- Node.js 20.x or later
- AWS CLI configured with credentials
- npm or yarn package manager
- zip utility (for Lambda packaging)

### Required AWS Permissions

Your AWS IAM user or role needs the following permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:CreateTable",
        "dynamodb:DescribeTable",
        "dynamodb:UpdateTimeToLive",
        "lambda:CreateFunction",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:GetFunction",
        "lambda:AddPermission",
        "lambda:GetPolicy",
        "iam:CreateRole",
        "iam:GetRole",
        "iam:AttachRolePolicy",
        "iam:PutRolePolicy",
        "apigateway:*"
      ],
      "Resource": "*"
    }
  ]
}
```

### Required Environment Variables

Set these before running deployment scripts:

```bash
# Required
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=123456789012
export STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# Optional (defaults provided)
export DYNAMODB_TABLE_NAME=revenue-signals
export LAMBDA_FUNCTION_NAME=stripe-connector
export IAM_ROLE_NAME=stripe-connector-role
export API_GATEWAY_NAME=stripe-webhook-api
export STAGE_NAME=prod
export LOG_LEVEL=info
```

## Deployment Steps

### Step 1: Install Dependencies

```bash
cd packages/lambdas/stripe-connector
npm install
```

### Step 2: Build the Lambda Function

```bash
npm run build
```

### Step 3: Deploy DynamoDB Table

```bash
npx tsx infrastructure/setup-dynamodb.ts
```

This creates:
- Table: `revenue-signals` with on-demand billing
- Primary key: `eventId` (Stripe event ID)
- GSI: `customerId-timestamp-index` for customer queries
- TTL: 90-day retention on `ttl` attribute

### Step 4: Deploy Lambda Function

```bash
npx tsx infrastructure/deploy-lambda.ts
```

This creates:
- IAM role with DynamoDB and CloudWatch permissions
- Lambda function with 512MB memory and 10-second timeout
- Environment variables configured
- Deployment package with dependencies

### Step 5: Setup API Gateway

```bash
npx tsx infrastructure/setup-api-gateway.ts
```

This creates:
- REST API with `/webhook` endpoint
- POST method integrated with Lambda
- Deployment to specified stage
- Lambda invoke permissions for API Gateway

The script outputs your webhook URL:
```
Webhook URL: https://abc123.execute-api.us-east-1.amazonaws.com/prod/webhook
```

### Step 6: Configure Stripe Webhook

1. Go to [Stripe Dashboard > Developers > Webhooks](https://dashboard.stripe.com/webhooks)
2. Click "Add endpoint"
3. Enter the webhook URL from Step 5
4. Select these events:
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. Copy the webhook signing secret (starts with `whsec_`)
6. Update your `STRIPE_WEBHOOK_SECRET` environment variable
7. Redeploy Lambda with the new secret:
   ```bash
   npx tsx infrastructure/deploy-lambda.ts
   ```

## Verification

### Test the Webhook Endpoint

Send a test webhook from Stripe Dashboard:

1. Go to Stripe Dashboard > Developers > Webhooks
2. Click on your webhook endpoint
3. Click "Send test webhook"
4. Select an event type (e.g., `customer.subscription.updated`)
5. Click "Send test webhook"

### Check CloudWatch Logs

```bash
aws logs tail /aws/lambda/stripe-connector --follow
```

### Query DynamoDB

```bash
aws dynamodb scan --table-name revenue-signals --limit 10
```

## Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AWS_REGION` | Yes | `us-east-1` | AWS region for deployment |
| `AWS_ACCOUNT_ID` | Yes | - | Your AWS account ID |
| `STRIPE_WEBHOOK_SECRET` | Yes | - | Stripe webhook signing secret |
| `DYNAMODB_TABLE_NAME` | No | `revenue-signals` | DynamoDB table name |
| `LAMBDA_FUNCTION_NAME` | No | `stripe-connector` | Lambda function name |
| `IAM_ROLE_NAME` | No | `stripe-connector-role` | IAM role name |
| `API_GATEWAY_NAME` | No | `stripe-webhook-api` | API Gateway name |
| `STAGE_NAME` | No | `prod` | API Gateway stage |
| `LOG_LEVEL` | No | `info` | Logging level (info, warn, error) |

### DynamoDB Schema

**Table: revenue-signals**

Primary Key:
- `eventId` (String): Stripe event ID

Attributes:
- `eventType` (String): expansion, churn, or failed_payment
- `customerId` (String): Stripe customer ID
- `subscriptionId` (String): Stripe subscription ID
- `timestamp` (Number): Unix timestamp
- `processedAt` (Number): Processing timestamp
- `revenueImpact` (Map): Revenue details
- `details` (Map): Event-specific details
- `ttl` (Number): Expiration timestamp (90 days)

Global Secondary Index:
- `customerId-timestamp-index`: Query events by customer and date range

## Troubleshooting

### Lambda Timeout Errors

**Symptom**: Lambda execution exceeds 10 seconds

**Solution**: Check CloudWatch Logs for slow operations. DynamoDB queries should complete in <200ms.

### Signature Verification Failures

**Symptom**: Webhooks return 401 status

**Possible causes**:
1. Incorrect `STRIPE_WEBHOOK_SECRET` environment variable
2. Webhook secret from wrong Stripe account (test vs live)
3. Timestamp drift (webhook older than 5 minutes)

**Solution**:
```bash
# Verify the secret is set correctly
aws lambda get-function-configuration --function-name stripe-connector \
  --query 'Environment.Variables.STRIPE_WEBHOOK_SECRET'

# Update if needed
export STRIPE_WEBHOOK_SECRET=whsec_correct_secret
npx tsx infrastructure/deploy-lambda.ts
```

### DynamoDB Throttling

**Symptom**: 500 errors with "ProvisionedThroughputExceededException"

**Solution**: DynamoDB on-demand mode should auto-scale. If throttling persists, check for hot partition keys or consider implementing request batching.

### API Gateway 403 Errors

**Symptom**: API Gateway returns 403 Forbidden

**Possible causes**:
1. Lambda invoke permission not granted
2. Incorrect API Gateway resource configuration

**Solution**:
```bash
# Re-run API Gateway setup
npx tsx infrastructure/setup-api-gateway.ts
```

### Missing Events in DynamoDB

**Symptom**: Webhooks return 200 but events not stored

**Possible causes**:
1. IAM role missing DynamoDB permissions
2. Table name mismatch
3. Lambda execution errors

**Solution**:
```bash
# Check Lambda logs
aws logs tail /aws/lambda/stripe-connector --follow

# Verify IAM permissions
aws iam get-role-policy --role-name stripe-connector-role \
  --policy-name StripeConnectorPolicy
```

## Cost Optimization

### AWS Free Tier Limits

This deployment is optimized for AWS Free Tier:

- **Lambda**: 1M requests/month, 400,000 GB-seconds compute
- **DynamoDB**: 25 GB storage, 25 read/write capacity units
- **API Gateway**: 1M API calls/month (first 12 months)
- **CloudWatch Logs**: 5 GB ingestion, 5 GB storage

### Estimated Monthly Costs (Beyond Free Tier)

Assuming 10,000 webhooks/month:

- Lambda: $0.00 (within free tier)
- DynamoDB: $0.00 (within free tier)
- API Gateway: $0.00 (within free tier for first year)
- CloudWatch: $0.00 (within free tier)

**Total: $0.00/month** (within free tier limits)

## Updating the Lambda Function

To deploy code changes:

```bash
# Build updated code
npm run build

# Deploy
npx tsx infrastructure/deploy-lambda.ts
```

The script automatically detects existing functions and updates them.

## Cleanup

To remove all infrastructure:

```bash
# Delete API Gateway
aws apigateway delete-rest-api --rest-api-id <api-id>

# Delete Lambda function
aws lambda delete-function --function-name stripe-connector

# Delete IAM role policies
aws iam delete-role-policy --role-name stripe-connector-role \
  --policy-name StripeConnectorPolicy
aws iam detach-role-policy --role-name stripe-connector-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam delete-role --role-name stripe-connector-role

# Delete DynamoDB table
aws dynamodb delete-table --table-name revenue-signals
```

## Support

For issues or questions:
1. Check CloudWatch Logs for error details
2. Review Stripe webhook delivery logs
3. Verify environment variables are set correctly
4. Ensure IAM permissions are properly configured
