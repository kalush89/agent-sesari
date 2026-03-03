# Mixpanel Connector Infrastructure Deployment

This directory contains deployment scripts for the Mixpanel Behavioral Senses connector infrastructure on AWS.

## Architecture Overview

The Mixpanel connector consists of:
- **DynamoDB Tables**: 
  - `behavioral-signals`: Stores behavioral signal events (feature adoption drops, power user identifications)
  - `usage-baselines`: Stores calculated usage baselines for each user-feature combination
- **Webhook Lambda**: Processes Mixpanel webhook events in real-time
- **Baseline Calculator Lambda**: Runs daily to calculate usage baselines and detect behavioral signals
- **API Gateway**: Exposes HTTPS endpoint for Mixpanel webhooks
- **EventBridge Rule**: Triggers baseline calculator daily at 10 AM UTC

## Prerequisites

### Required Tools
- Node.js 20.x or later
- AWS CLI configured with credentials
- TypeScript (`npm install -g typescript`)
- zip utility (for Lambda packaging)

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

# Mixpanel Credentials
export MIXPANEL_WEBHOOK_SECRET=your_webhook_signing_secret

# Optional Configuration
export DYNAMODB_SIGNALS_TABLE=behavioral-signals  # Default
export DYNAMODB_BASELINES_TABLE=usage-baselines  # Default
export LOG_LEVEL=info  # Default: info (options: info, warn, error)
export ADOPTION_DROP_THRESHOLD=50  # Default: 50% drop
export INACTIVITY_THRESHOLD_DAYS=14  # Default: 14 days
export POWER_USER_DAYS_THRESHOLD=20  # Default: 20 days active
export POWER_USER_PERCENTILE=90  # Default: 90th percentile
```

## Deployment Steps

### Step 1: Build the Lambda Functions

```bash
cd packages/lambdas/mixpanel-connector
npm install
npm run build
```

### Step 2: Deploy DynamoDB Tables

```bash
npx tsx infrastructure/setup-dynamodb.ts
```

This creates:
- Table 1: `behavioral-signals`
  - Primary key: `eventId`
  - GSI: `userId-timestamp-index` for efficient user queries
  - TTL: 90-day retention on `expiresAt` attribute
  - On-demand billing
- Table 2: `usage-baselines`
  - Primary key: `userFeatureKey` (format: "userId#feature")
  - TTL: 90-day retention on `expiresAt` attribute
  - On-demand billing

### Step 3: Deploy Webhook Lambda

```bash
npx tsx infrastructure/deploy-webhook-lambda.ts
```

This creates:
- Lambda function: `mixpanel-connector`
- Memory: 512 MB
- Timeout: 10 seconds
- IAM role with DynamoDB and CloudWatch permissions
- Environment variables configured

### Step 4: Deploy Baseline Calculator Lambda

```bash
npx tsx infrastructure/deploy-baseline-calculator-lambda.ts
```

This creates:
- Lambda function: `mixpanel-baseline-calculator`
- Memory: 1024 MB
- Timeout: 5 minutes (300 seconds)
- Concurrency: 1 (prevents overlapping runs)
- IAM role with DynamoDB, CloudWatch permissions
- Environment variables configured with thresholds

### Step 5: Setup API Gateway

```bash
npx tsx infrastructure/setup-api-gateway.ts
```

This creates:
- API Gateway REST API: `mixpanel-webhook-api`
- Resource: `/mixpanel-webhook`
- Method: POST with Lambda proxy integration
- Stage: `prod`

**Output**: Copy the webhook URL from the output.

### Step 6: Setup EventBridge Schedule

```bash
npx tsx infrastructure/setup-eventbridge.ts
```

This creates:
- EventBridge rule: `mixpanel-baseline-calculator-daily`
- Schedule: `cron(0 10 * * ? *)` (10 AM UTC daily)
- Target: Baseline calculator Lambda

## Mixpanel Configuration

### Webhook Setup

1. Go to Mixpanel Project Settings > Webhooks
2. Click "Add Webhook"
3. Configure the webhook:
   - **URL**: Use the webhook URL from Step 5
   - **Events**: Select the events you want to monitor (e.g., feature usage events)
   - **Signing Secret**: Copy the webhook signing secret
4. Set the signing secret as `MIXPANEL_WEBHOOK_SECRET` environment variable
5. Redeploy the webhook Lambda to update the environment variable:
   ```bash
   npx tsx infrastructure/deploy-webhook-lambda.ts
   ```

### Event Configuration

The connector processes:
- **User activity events**: Feature usage events for baseline calculation
- **Engagement summary events**: Aggregated metrics for power user identification

Events should include:
- `distinct_id`: User identifier
- `event`: Event name (used to determine feature)
- `properties`: Event properties (optional)

## Verification

### Test Webhook Processing

Send a test webhook from Mixpanel:
```bash
# Check CloudWatch Logs for the webhook Lambda
aws logs tail /aws/lambda/mixpanel-connector --follow
```

### Test Baseline Calculation

Manually invoke the baseline calculator:
```bash
aws lambda invoke \
  --function-name mixpanel-baseline-calculator \
  --payload '{}' \
  response.json

cat response.json
```

### Query DynamoDB

Check stored events:
```bash
# Query behavioral signals
aws dynamodb scan \
  --table-name behavioral-signals \
  --limit 10

# Query usage baselines
aws dynamodb scan \
  --table-name usage-baselines \
  --limit 10
```

## Monitoring

### CloudWatch Logs

- Webhook Lambda: `/aws/lambda/mixpanel-connector`
- Baseline Calculator Lambda: `/aws/lambda/mixpanel-baseline-calculator`

### CloudWatch Metrics

Custom metrics emitted:
- `BehavioralSignals/EventProcessed` (webhook)
- `BehavioralSignals/EventFailed` (webhook)
- `BehavioralSignals/ProcessingLatency` (webhook)
- `BehavioralSignals/BaselineCalculated` (baseline calculator)
- `BehavioralSignals/AdoptionDropDetected` (baseline calculator)
- `BehavioralSignals/PowerUserIdentified` (baseline calculator)

### Alarms (Recommended)

Set up CloudWatch alarms for:
- Lambda error rate > 5%
- Lambda duration > 8 seconds (webhook) or > 4 minutes (baseline calculator)
- DynamoDB throttling events
- Signature verification failures > 10/hour

## Cost Optimization

### AWS Free Tier Compliance

This infrastructure is designed to stay within AWS Free Tier limits:

- **Lambda**: 1M requests/month free (webhook ~2k/month, baseline calculator 30/month)
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
  --metrics BlendedCost
```

## Troubleshooting

### Webhook Returns 401 Unauthorized

**Cause**: Invalid webhook signature or expired timestamp

**Solution**:
1. Verify `MIXPANEL_WEBHOOK_SECRET` matches Mixpanel configuration
2. Check CloudWatch Logs for signature verification errors
3. Ensure system time is synchronized (timestamp validation)
4. Verify the webhook secret is correctly set in Lambda environment variables:
   ```bash
   aws lambda get-function-configuration --function-name mixpanel-connector \
     --query 'Environment.Variables.MIXPANEL_WEBHOOK_SECRET'
   ```

### Webhook Returns 500 Internal Server Error

**Cause**: DynamoDB unavailable or Lambda error

**Solution**:
1. Check CloudWatch Logs for error details
2. Verify DynamoDB tables exist and are active
3. Verify IAM role has DynamoDB permissions
4. Check Lambda timeout (should be 10 seconds)

### Baseline Calculator Not Running

**Cause**: EventBridge rule disabled or Lambda permission missing

**Solution**:
1. Verify EventBridge rule is enabled:
   ```bash
   aws events describe-rule --name mixpanel-baseline-calculator-daily
   ```
2. Check Lambda has EventBridge invoke permission:
   ```bash
   aws lambda get-policy --function-name mixpanel-baseline-calculator
   ```
3. Manually invoke to test:
   ```bash
   aws lambda invoke --function-name mixpanel-baseline-calculator --payload '{}' response.json
   ```

### No Behavioral Signals Detected

**Cause**: Insufficient historical data or thresholds too high

**Solution**:
1. Check CloudWatch Logs for "insufficient data" messages
2. Verify at least 7 days of usage data exists for user-feature combinations
3. Adjust thresholds if needed:
   ```bash
   export ADOPTION_DROP_THRESHOLD=40  # Lower threshold
   export INACTIVITY_THRESHOLD_DAYS=10  # Lower threshold
   npx tsx infrastructure/deploy-baseline-calculator-lambda.ts
   ```

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
2. Baseline Calculator Lambda: Should complete in <4 minutes (timeout: 5m)
3. Check CloudWatch Logs for timeout warnings
4. Optimize code or increase timeout if needed

### Missing Events in DynamoDB

**Symptom**: Webhooks return 200 but events not stored

**Possible causes**:
1. IAM role missing DynamoDB permissions
2. Table name mismatch
3. Lambda execution errors
4. Event filtering (non-behavioral events are ignored)

**Solution**:
```bash
# Check Lambda logs
aws logs tail /aws/lambda/mixpanel-connector --follow

# Verify IAM permissions
aws iam get-role-policy --role-name mixpanel-connector-role \
  --policy-name MixpanelConnectorPolicy
```

## Configuration Reference

### Environment Variables

#### Webhook Lambda

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AWS_REGION` | Yes | `us-east-1` | AWS region for deployment |
| `MIXPANEL_WEBHOOK_SECRET` | Yes | - | Mixpanel webhook signing secret |
| `DYNAMODB_SIGNALS_TABLE` | No | `behavioral-signals` | Signals table name |
| `DYNAMODB_BASELINES_TABLE` | No | `usage-baselines` | Baselines table name |
| `LOG_LEVEL` | No | `info` | Logging level (info, warn, error) |

#### Baseline Calculator Lambda

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AWS_REGION` | Yes | `us-east-1` | AWS region for deployment |
| `DYNAMODB_SIGNALS_TABLE` | No | `behavioral-signals` | Signals table name |
| `DYNAMODB_BASELINES_TABLE` | No | `usage-baselines` | Baselines table name |
| `ADOPTION_DROP_THRESHOLD` | No | `50` | Percentage drop to trigger alert |
| `INACTIVITY_THRESHOLD_DAYS` | No | `14` | Days of inactivity to trigger alert |
| `POWER_USER_DAYS_THRESHOLD` | No | `20` | Days active in 30-day period |
| `POWER_USER_PERCENTILE` | No | `90` | Engagement score percentile |
| `LOG_LEVEL` | No | `info` | Logging level (info, warn, error) |

### DynamoDB Schema

#### Table: behavioral-signals

Primary Key:
- `eventId` (String): Mixpanel event ID or generated ID

Attributes:
- `eventType` (String): `feature_adoption_drop` or `power_user`
- `userId` (String): Mixpanel distinct_id
- `timestamp` (Number): Unix timestamp
- `processedAt` (Number): Processing timestamp
- `details` (Map): Event-specific details
- `expiresAt` (Number): TTL timestamp (90 days)

Global Secondary Index:
- `userId-timestamp-index`: Query events by user and date range

#### Table: usage-baselines

Primary Key:
- `userFeatureKey` (String): Composite key "userId#feature"

Attributes:
- `userId` (String): User identifier
- `feature` (String): Feature name
- `averageFrequency` (Number): Average uses per day
- `totalUses` (Number): Total uses in baseline period
- `baselinePeriodDays` (Number): Days of data used (7-30)
- `lastCalculated` (Number): Unix timestamp
- `expiresAt` (Number): TTL timestamp (90 days)

## Updating the Infrastructure

### Update Lambda Code

```bash
npm run build
npx tsx infrastructure/deploy-webhook-lambda.ts
npx tsx infrastructure/deploy-baseline-calculator-lambda.ts
```

### Update Environment Variables

Edit the deployment scripts or set new environment variables, then redeploy:
```bash
export ADOPTION_DROP_THRESHOLD=40
npx tsx infrastructure/deploy-baseline-calculator-lambda.ts
```

### Update EventBridge Schedule

```bash
export SCHEDULE_EXPRESSION="cron(0 */12 * * ? *)"  # Every 12 hours
npx tsx infrastructure/setup-eventbridge.ts
```

## Cleanup

To remove all infrastructure:

```bash
# Delete EventBridge rule
aws events remove-targets --rule mixpanel-baseline-calculator-daily --ids 1
aws events delete-rule --name mixpanel-baseline-calculator-daily

# Delete API Gateway
aws apigateway delete-rest-api --rest-api-id <api-id>

# Delete Lambda functions
aws lambda delete-function --function-name mixpanel-connector
aws lambda delete-function --function-name mixpanel-baseline-calculator

# Delete IAM roles
aws iam delete-role-policy --role-name mixpanel-connector-role --policy-name MixpanelConnectorPolicy
aws iam detach-role-policy --role-name mixpanel-connector-role --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam delete-role --role-name mixpanel-connector-role

aws iam delete-role-policy --role-name mixpanel-baseline-calculator-role --policy-name MixpanelBaselineCalculatorPolicy
aws iam detach-role-policy --role-name mixpanel-baseline-calculator-role --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam delete-role --role-name mixpanel-baseline-calculator-role

# Delete DynamoDB tables
aws dynamodb delete-table --table-name behavioral-signals
aws dynamodb delete-table --table-name usage-baselines
```

## Support

For issues or questions:
1. Check CloudWatch Logs for error details
2. Review this troubleshooting guide
3. Consult the design document at `.kiro/specs/behavioral-senses-mixpanel/design.md`
