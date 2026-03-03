# HubSpot Connector Infrastructure Deployment

This directory contains deployment scripts for the HubSpot Relationship Senses connector infrastructure on AWS.

## Architecture Overview

The HubSpot connector consists of:
- **DynamoDB Table**: Stores relationship signal events (deal progression, communication gaps, sentiment)
- **Webhook Lambda**: Processes HubSpot webhook events in real-time
- **Gap Detector Lambda**: Runs daily to detect communication gaps
- **API Gateway**: Exposes HTTPS endpoint for HubSpot webhooks
- **EventBridge Rule**: Triggers gap detector daily at 9 AM UTC

## Prerequisites

### Required Tools
- Node.js 20.x or later
- AWS CLI configured with credentials
- TypeScript (`npm install -g typescript`)

### Required AWS Permissions

Your AWS IAM user/role needs the following permissions:
- `dynamodb:CreateTable`, `dynamodb:DescribeTable`, `dynamodb:UpdateTimeToLive`
- `lambda:CreateFunction`, `lambda:UpdateFunctionCode`, `lambda:UpdateFunctionConfiguration`, `lambda:GetFunction`, `lambda:AddPermission`, `lambda:PutFunctionConcurrency`
- `iam:CreateRole`, `iam:GetRole`, `iam:AttachRolePolicy`, `iam:PutRolePolicy`
- `apigateway:*` (for API Gateway setup)
- `events:PutRule`, `events:PutTargets`, `events:DescribeRule`

### Required Environment Variables

Before deployment, set these environment variables:

```bash
# AWS Configuration
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=123456789012  # Your AWS account ID

# HubSpot Credentials
export HUBSPOT_WEBHOOK_SECRET=your_webhook_signing_secret
export HUBSPOT_API_KEY=your_hubspot_api_key

# Optional Configuration
export DYNAMODB_TABLE_NAME=relationship-signals  # Default
export LOG_LEVEL=info  # Default: info (options: info, warn, error)
export DEAL_GAP_THRESHOLD_DAYS=14  # Default: 14 days
export CUSTOMER_GAP_THRESHOLD_DAYS=30  # Default: 30 days
```

## Deployment Steps

### Step 1: Build the Lambda Functions

```bash
cd packages/lambdas/hubspot-connector
npm install
npm run build
```

### Step 2: Deploy DynamoDB Table

```bash
npx tsx infrastructure/setup-dynamodb.ts
```

This creates:
- Table: `relationship-signals` with on-demand billing
- Primary key: `eventId`
- GSI: `companyId-timestamp-index` for efficient company queries
- TTL: 90-day retention

### Step 3: Deploy Webhook Lambda

```bash
npx tsx infrastructure/deploy-webhook-lambda.ts
```

This creates:
- Lambda function: `hubspot-connector`
- Memory: 512 MB
- Timeout: 10 seconds
- IAM role with DynamoDB and CloudWatch permissions

### Step 4: Deploy Gap Detector Lambda

```bash
npx tsx infrastructure/deploy-gap-detector-lambda.ts
```

This creates:
- Lambda function: `hubspot-gap-detector`
- Memory: 1024 MB
- Timeout: 5 minutes (300 seconds)
- Concurrency: 1 (prevents overlapping runs)
- IAM role with DynamoDB, CloudWatch, and Secrets Manager permissions

### Step 5: Setup API Gateway

```bash
npx tsx infrastructure/setup-api-gateway.ts
```

This creates:
- API Gateway REST API: `hubspot-webhook-api`
- Resource: `/hubspot-webhook`
- Method: POST with Lambda proxy integration
- Stage: `prod`

**Output**: Copy the webhook URL from the output.

### Step 6: Setup EventBridge Schedule

```bash
npx tsx infrastructure/setup-eventbridge.ts
```

This creates:
- EventBridge rule: `hubspot-gap-detector-daily`
- Schedule: `cron(0 9 * * ? *)` (9 AM UTC daily)
- Target: Gap detector Lambda

## HubSpot Configuration

### Webhook Setup

1. Go to HubSpot Settings > Integrations > Private Apps
2. Create a new private app or edit an existing one
3. Grant the following scopes:
   - `crm.objects.deals.read`
   - `crm.objects.contacts.read`
   - `crm.objects.companies.read`
4. Navigate to the Webhooks tab
5. Add webhook subscription:
   - **URL**: Use the webhook URL from Step 5
   - **Events**: Select the following:
     - `deal.propertyChange`
     - `engagement.created`
     - `note.created`
6. Copy the webhook signing secret and set it as `HUBSPOT_WEBHOOK_SECRET`

### API Key Setup

1. In your HubSpot private app, copy the API key
2. Set it as `HUBSPOT_API_KEY` environment variable
3. Redeploy the gap detector Lambda to update the environment variable

## Verification

### Test Webhook Processing

Send a test webhook from HubSpot:
```bash
# Check CloudWatch Logs for the webhook Lambda
aws logs tail /aws/lambda/hubspot-connector --follow
```

### Test Gap Detection

Manually invoke the gap detector:
```bash
aws lambda invoke \
  --function-name hubspot-gap-detector \
  --payload '{}' \
  response.json

cat response.json
```

### Query DynamoDB

Check stored events:
```bash
aws dynamodb scan \
  --table-name relationship-signals \
  --limit 10
```

## Monitoring

### CloudWatch Logs

- Webhook Lambda: `/aws/lambda/hubspot-connector`
- Gap Detector Lambda: `/aws/lambda/hubspot-gap-detector`

### CloudWatch Metrics

Custom metrics emitted:
- `RelationshipSignals/EventProcessed` (webhook)
- `RelationshipSignals/EventFailed` (webhook)
- `RelationshipSignals/ProcessingLatency` (webhook)

### Alarms (Recommended)

Set up CloudWatch alarms for:
- Lambda error rate > 5%
- Lambda duration > 8 seconds (webhook) or > 4 minutes (gap detector)
- DynamoDB throttling events
- Signature verification failures > 10/hour

## Cost Optimization

### AWS Free Tier Compliance

This infrastructure is designed to stay within AWS Free Tier limits:

- **Lambda**: 1M requests/month free (webhook ~1k/month, gap detector 30/month)
- **DynamoDB**: 25 GB storage, 25 read/write capacity units free
- **API Gateway**: 1M API calls/month free
- **EventBridge**: 1M events/month free

**Expected monthly cost**: <$1 for typical usage

### Cost Monitoring

Monitor costs in AWS Cost Explorer:
```bash
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --filter file://cost-filter.json
```

## Troubleshooting

### Webhook Returns 401 Unauthorized

**Cause**: Invalid webhook signature or expired timestamp

**Solution**:
1. Verify `HUBSPOT_WEBHOOK_SECRET` matches HubSpot configuration
2. Check CloudWatch Logs for signature verification errors
3. Ensure system time is synchronized (timestamp validation)

### Webhook Returns 500 Internal Server Error

**Cause**: DynamoDB unavailable or Lambda error

**Solution**:
1. Check CloudWatch Logs for error details
2. Verify DynamoDB table exists and is active
3. Verify IAM role has DynamoDB permissions
4. Check Lambda timeout (should be 10 seconds)

### Gap Detector Not Running

**Cause**: EventBridge rule disabled or Lambda permission missing

**Solution**:
1. Verify EventBridge rule is enabled:
   ```bash
   aws events describe-rule --name hubspot-gap-detector-daily
   ```
2. Check Lambda has EventBridge invoke permission:
   ```bash
   aws lambda get-policy --function-name hubspot-gap-detector
   ```
3. Manually invoke to test:
   ```bash
   aws lambda invoke --function-name hubspot-gap-detector --payload '{}' response.json
   ```

### HubSpot API Rate Limiting

**Cause**: Too many API calls to HubSpot

**Solution**:
1. Gap detector implements exponential backoff automatically
2. Check CloudWatch Logs for rate limit warnings
3. Consider reducing gap detection frequency (change EventBridge schedule)
4. Upgrade HubSpot plan for higher rate limits

### DynamoDB Throttling

**Cause**: Write capacity exceeded (rare with on-demand billing)

**Solution**:
1. Check CloudWatch Metrics for throttling events
2. Webhook Lambda implements exponential backoff automatically
3. On-demand billing should auto-scale, but verify table settings

### Lambda Timeout

**Cause**: Processing takes longer than configured timeout

**Solution**:
1. Webhook Lambda: Should complete in <5 seconds (timeout: 10s)
2. Gap Detector Lambda: Should complete in <4 minutes (timeout: 5m)
3. Check CloudWatch Logs for timeout warnings
4. Optimize code or increase timeout if needed

## Updating the Infrastructure

### Update Lambda Code

```bash
npm run build
npx tsx infrastructure/deploy-webhook-lambda.ts
npx tsx infrastructure/deploy-gap-detector-lambda.ts
```

### Update Environment Variables

Edit the deployment scripts or set new environment variables, then redeploy:
```bash
export DEAL_GAP_THRESHOLD_DAYS=21
npx tsx infrastructure/deploy-gap-detector-lambda.ts
```

### Update EventBridge Schedule

```bash
export SCHEDULE_EXPRESSION="cron(0 */6 * * ? *)"  # Every 6 hours
npx tsx infrastructure/setup-eventbridge.ts
```

## Cleanup

To remove all infrastructure:

```bash
# Delete EventBridge rule
aws events remove-targets --rule hubspot-gap-detector-daily --ids 1
aws events delete-rule --name hubspot-gap-detector-daily

# Delete API Gateway
aws apigateway delete-rest-api --rest-api-id <api-id>

# Delete Lambda functions
aws lambda delete-function --function-name hubspot-connector
aws lambda delete-function --function-name hubspot-gap-detector

# Delete IAM roles
aws iam delete-role-policy --role-name hubspot-connector-role --policy-name HubSpotConnectorPolicy
aws iam detach-role-policy --role-name hubspot-connector-role --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam delete-role --role-name hubspot-connector-role

aws iam delete-role-policy --role-name hubspot-gap-detector-role --policy-name HubSpotGapDetectorPolicy
aws iam detach-role-policy --role-name hubspot-gap-detector-role --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam delete-role --role-name hubspot-gap-detector-role

# Delete DynamoDB table
aws dynamodb delete-table --table-name relationship-signals
```

## Support

For issues or questions:
1. Check CloudWatch Logs for error details
2. Review this troubleshooting guide
3. Consult the design document at `.kiro/specs/relationship-senses-hubspot/design.md`
