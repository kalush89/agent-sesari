# Daily Briefing Generator - Backend Deployment Guide

## Overview

This guide covers the deployment of the Daily Briefing Generator Lambda function, DynamoDB table setup, and EventBridge scheduler configuration.

## Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js 20.x installed
- AWS account with Free Tier access
- IAM permissions for Lambda, DynamoDB, EventBridge, and Bedrock

## Environment Variables

Create a `.env` file in the `packages/lambdas/briefing-generator` directory:

```bash
# AWS Configuration
AWS_REGION=us-east-1

# DynamoDB Tables
UNIVERSAL_SIGNALS_TABLE=UniversalSignals
BRIEFING_STORE_TABLE=Briefings

# Bedrock Configuration
BEDROCK_MODEL_ID=amazon.nova-lite-v1:0

# Generation Settings
MAX_INSIGHTS=10
NARRATIVE_MAX_WORDS=150
```

## Step 1: Create DynamoDB Table

Run the table setup script to create the Briefings table:

```bash
cd packages/lambdas/briefing-generator
npm run setup:dynamodb
```

This creates a table with:
- **Table Name**: `Briefings`
- **Primary Key**: `PK` (String), `SK` (String)
- **TTL Attribute**: `ttl` (90-day retention)
- **Billing Mode**: On-Demand (Free Tier compliant)

### Manual Table Creation

If the script fails, create the table manually:

```bash
aws dynamodb create-table \
  --table-name Briefings \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1

# Enable TTL
aws dynamodb update-time-to-live \
  --table-name Briefings \
  --time-to-live-specification \
    Enabled=true,AttributeName=ttl \
  --region us-east-1
```

## Step 2: Configure IAM Role

Create an IAM role for the Lambda function with the following permissions:

### Required Policies

1. **DynamoDB Access**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:Query",
        "dynamodb:GetItem",
        "dynamodb:PutItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:*:table/UniversalSignals",
        "arn:aws:dynamodb:us-east-1:*:table/UniversalSignals/index/*",
        "arn:aws:dynamodb:us-east-1:*:table/Briefings"
      ]
    }
  ]
}
```

2. **Bedrock Access**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-lite-v1:0"
    }
  ]
}
```

3. **CloudWatch Logs**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:us-east-1:*:log-group:/aws/lambda/briefing-generator:*"
    }
  ]
}
```

### Create IAM Role

```bash
# Create trust policy
cat > trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Create role
aws iam create-role \
  --role-name BriefingGeneratorRole \
  --assume-role-policy-document file://trust-policy.json

# Attach policies (create custom policies first or use managed policies)
aws iam attach-role-policy \
  --role-name BriefingGeneratorRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
```

## Step 3: Deploy Lambda Function

Build and deploy the Lambda function:

```bash
cd packages/lambdas/briefing-generator

# Install dependencies
npm install

# Build TypeScript
npm run build

# Package for deployment
npm run package

# Deploy using deployment script
npm run deploy
```

### Manual Deployment

If the script fails, deploy manually:

```bash
# Create deployment package
zip -r function.zip dist/ node_modules/

# Create Lambda function
aws lambda create-function \
  --function-name briefing-generator \
  --runtime nodejs20.x \
  --role arn:aws:iam::YOUR_ACCOUNT_ID:role/BriefingGeneratorRole \
  --handler dist/index.handler \
  --zip-file fileb://function.zip \
  --timeout 30 \
  --memory-size 512 \
  --environment Variables="{
    AWS_REGION=us-east-1,
    UNIVERSAL_SIGNALS_TABLE=UniversalSignals,
    BRIEFING_STORE_TABLE=Briefings,
    BEDROCK_MODEL_ID=amazon.nova-lite-v1:0,
    MAX_INSIGHTS=10,
    NARRATIVE_MAX_WORDS=150
  }" \
  --region us-east-1
```

### Lambda Configuration

- **Runtime**: Node.js 20.x
- **Memory**: 512 MB (Free Tier: 400,000 GB-seconds/month)
- **Timeout**: 30 seconds
- **Handler**: `dist/index.handler`

## Step 4: Configure EventBridge Scheduler

Set up the daily trigger at 8:00 AM UTC:

```bash
cd packages/lambdas/briefing-generator
npm run setup:eventbridge
```

### Manual EventBridge Setup

```bash
# Create EventBridge rule
aws events put-rule \
  --name briefing-generator-daily \
  --schedule-expression "cron(0 8 * * ? *)" \
  --state ENABLED \
  --description "Trigger daily briefing generation at 8:00 AM UTC" \
  --region us-east-1

# Add Lambda as target
aws events put-targets \
  --rule briefing-generator-daily \
  --targets "Id"="1","Arn"="arn:aws:lambda:us-east-1:YOUR_ACCOUNT_ID:function:briefing-generator" \
  --region us-east-1

# Grant EventBridge permission to invoke Lambda
aws lambda add-permission \
  --function-name briefing-generator \
  --statement-id AllowEventBridgeInvoke \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn arn:aws:events:us-east-1:YOUR_ACCOUNT_ID:rule/briefing-generator-daily \
  --region us-east-1
```

### Schedule Configuration

- **Cron Expression**: `cron(0 8 * * ? *)` (8:00 AM UTC daily)
- **Retry Policy**: 2 attempts, 1 hour maximum event age
- **Dead Letter Queue**: Optional (recommended for production)

## Step 5: Verification

### Test Lambda Function

Invoke the function manually to verify it works:

```bash
aws lambda invoke \
  --function-name briefing-generator \
  --payload '{}' \
  --region us-east-1 \
  response.json

cat response.json
```

### Check CloudWatch Logs

```bash
aws logs tail /aws/lambda/briefing-generator --follow
```

### Verify DynamoDB Storage

```bash
aws dynamodb scan \
  --table-name Briefings \
  --limit 5 \
  --region us-east-1
```

### Test EventBridge Rule

```bash
# Check rule status
aws events describe-rule \
  --name briefing-generator-daily \
  --region us-east-1

# List targets
aws events list-targets-by-rule \
  --rule briefing-generator-daily \
  --region us-east-1
```

## Monitoring and Troubleshooting

### CloudWatch Metrics

Monitor these metrics in CloudWatch:
- Lambda invocations
- Lambda errors
- Lambda duration
- DynamoDB read/write capacity
- Bedrock API calls

### Common Issues

**Issue**: Lambda timeout
- **Solution**: Increase timeout to 60 seconds or optimize query performance

**Issue**: Bedrock API rate limit
- **Solution**: Implement exponential backoff (already included in code)

**Issue**: DynamoDB throttling
- **Solution**: Switch to provisioned capacity or reduce query frequency

**Issue**: Missing signals
- **Solution**: Verify UniversalSignals table has data and CategoryIndex exists

### Logs Analysis

```bash
# Search for errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/briefing-generator \
  --filter-pattern "ERROR" \
  --region us-east-1

# Get execution metrics
aws logs filter-log-events \
  --log-group-name /aws/lambda/briefing-generator \
  --filter-pattern "Briefing generated" \
  --region us-east-1
```

## Cost Optimization

### Free Tier Limits

- **Lambda**: 1M requests/month, 400,000 GB-seconds compute
- **DynamoDB**: 25 GB storage, 25 read/write capacity units
- **Bedrock**: Varies by model (Nova Lite is cost-effective)
- **EventBridge**: 1M events/month

### Optimization Tips

1. Use Amazon Nova Lite for narrative generation (lowest cost)
2. Limit insights to 10 per briefing (MAX_INSIGHTS=10)
3. Enable DynamoDB TTL for automatic cleanup (90 days)
4. Use On-Demand billing for DynamoDB (scales to zero)
5. Compress briefing content before storage

## Updating the Function

To update the Lambda function code:

```bash
# Rebuild
npm run build

# Repackage
npm run package

# Update function code
aws lambda update-function-code \
  --function-name briefing-generator \
  --zip-file fileb://function.zip \
  --region us-east-1
```

## Rollback

If deployment fails, rollback to previous version:

```bash
# List versions
aws lambda list-versions-by-function \
  --function-name briefing-generator \
  --region us-east-1

# Update alias to previous version
aws lambda update-alias \
  --function-name briefing-generator \
  --name production \
  --function-version PREVIOUS_VERSION \
  --region us-east-1
```

## Security Best Practices

1. Use IAM roles with least privilege
2. Enable CloudTrail for audit logging
3. Encrypt environment variables with KMS
4. Use VPC endpoints for DynamoDB access (optional)
5. Enable Lambda function versioning
6. Set up CloudWatch alarms for errors

## Next Steps

After backend deployment:
1. Deploy the Next.js frontend (see FRONTEND_DEPLOYMENT.md)
2. Configure API routes to fetch briefings
3. Test end-to-end flow
4. Set up monitoring and alerts
