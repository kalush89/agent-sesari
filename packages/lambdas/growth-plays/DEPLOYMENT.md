# Automated Growth Plays - Deployment Guide

## Overview

This guide covers deploying the Automated Growth Plays system, which includes Lambda functions, DynamoDB tables, EventBridge scheduler, and Next.js dashboard.

## Prerequisites

- AWS Account with appropriate permissions
- AWS CLI configured
- Node.js 18+ installed
- Environment variables configured

## Environment Variables

### Lambda Functions

Create a `.env` file in `packages/lambdas/growth-plays/`:

```bash
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=your-account-id

# DynamoDB Tables
GROWTH_PLAYS_TABLE=growth-plays
RISK_PROFILES_TABLE=customer-risk-profiles
SIGNAL_CACHE_TABLE=signal-cache
UNIVERSAL_SIGNALS_TABLE=universal-signals

# Lambda Functions
SIGNAL_ORCHESTRATOR_LAMBDA=signal-orchestrator
EXECUTION_ENGINE_LAMBDA=execution-engine

# Communication
SES_FROM_EMAIL=noreply@yourdomain.com
SLACK_BOT_TOKEN=xoxb-your-slack-token
```

### Next.js Dashboard

Add to `.env.local` in project root:

```bash
AWS_REGION=us-east-1
GROWTH_PLAYS_TABLE=growth-plays
EXECUTION_ENGINE_LAMBDA=execution-engine
```

## Deployment Steps

### 1. Install Dependencies

```bash
cd packages/lambdas/growth-plays
npm install
```

### 2. Deploy DynamoDB Tables

```bash
npm run deploy:dynamodb
```

This creates:
- GrowthPlays table with GSIs
- CustomerRiskProfiles table with TTL
- SignalCache table with TTL

### 3. Deploy Lambda Functions

Build and deploy each Lambda:

```bash
# Build TypeScript
npm run build

# Deploy Lambdas (requires AWS SAM or custom deployment script)
npm run deploy:lambda
```

### 4. Set Up EventBridge Scheduler

```bash
npm run deploy:eventbridge
```

This creates a daily trigger at 6 AM UTC for the Signal Orchestrator.

### 5. Configure AWS SES

1. Verify your sender email in AWS SES console
2. Request production access if needed (starts in sandbox mode)
3. Update `SES_FROM_EMAIL` environment variable

### 6. Configure Slack Integration

1. Create a Slack App at api.slack.com/apps
2. Add `chat:write` bot scope
3. Install app to workspace
4. Copy Bot User OAuth Token to `SLACK_BOT_TOKEN`

### 7. Deploy Next.js Dashboard

```bash
# From project root
npm run build
npm run start
```

Or deploy to Vercel:

```bash
vercel deploy --prod
```

## AWS Free Tier Compliance

The system is designed to stay within AWS Free Tier limits:

- **Lambda**: 512MB memory, optimized execution time
- **DynamoDB**: On-demand billing, scales to zero
- **EventBridge**: 1 daily trigger (well within free tier)
- **Bedrock Nova Lite**: Cost-effective AI model
- **SES**: 62,000 free emails/month

## Testing

### Test Signal Orchestrator

```bash
aws lambda invoke \
  --function-name signal-orchestrator \
  --payload '{"forceRefresh":true}' \
  response.json
```

### Test Draft Generator

```bash
aws lambda invoke \
  --function-name draft-generator \
  --payload '{"highRiskCustomers":[...]}' \
  response.json
```

### Test Execution Engine

```bash
aws lambda invoke \
  --function-name execution-engine \
  --payload '{"growthPlayId":"gp-123","userId":"user-1"}' \
  response.json
```

## Monitoring

### CloudWatch Logs

Monitor Lambda execution:

```bash
aws logs tail /aws/lambda/signal-orchestrator --follow
aws logs tail /aws/lambda/draft-generator --follow
aws logs tail /aws/lambda/execution-engine --follow
```

### DynamoDB Metrics

Check table metrics in AWS Console:
- Read/Write capacity usage
- Item counts
- TTL deletions

## Troubleshooting

### Lambda Timeout

If Lambdas timeout, increase memory allocation (stays within free tier up to 1GB):

```bash
aws lambda update-function-configuration \
  --function-name signal-orchestrator \
  --memory-size 1024
```

### Bedrock Access Denied

Ensure IAM role has `bedrock:InvokeModel` permission:

```json
{
  "Effect": "Allow",
  "Action": "bedrock:InvokeModel",
  "Resource": "arn:aws:bedrock:*::foundation-model/amazon.nova-lite-v1:0"
}
```

### DynamoDB Access Issues

Verify Lambda execution role has DynamoDB permissions:

```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:PutItem",
    "dynamodb:GetItem",
    "dynamodb:Query",
    "dynamodb:UpdateItem"
  ],
  "Resource": [
    "arn:aws:dynamodb:*:*:table/growth-plays",
    "arn:aws:dynamodb:*:*:table/growth-plays/index/*"
  ]
}
```

## Maintenance

### Update Lambda Code

```bash
npm run build
npm run deploy:lambda
```

### Clear Signal Cache

```bash
aws dynamodb delete-item \
  --table-name signal-cache \
  --key '{"cacheKey":{"S":"entity-profiles"}}'
```

### Manual Trigger

Manually trigger Signal Orchestrator:

```bash
aws events put-events \
  --entries '[{"Source":"manual","DetailType":"trigger","Detail":"{}"}]'
```

## Security Best Practices

1. Use IAM roles, never hardcode credentials
2. Enable CloudTrail for audit logging
3. Encrypt DynamoDB tables at rest
4. Use VPC endpoints for Lambda if needed
5. Rotate Slack tokens regularly
6. Monitor SES bounce rates

## Cost Optimization

- Monitor Lambda execution count (free tier: 1M requests/month)
- Use DynamoDB on-demand billing
- Cache signal data for 1 hour to reduce queries
- Optimize Lambda memory for cost/performance balance

## Support

For issues or questions:
- Check CloudWatch Logs for error details
- Review DynamoDB table metrics
- Verify environment variables are set correctly
- Ensure IAM permissions are configured
