# ICP Refinement Engine - Deployment Guide

## Overview

This guide covers deploying the Dynamic ICP Refinement Engine Lambda function to AWS, including all required infrastructure components.

## Prerequisites

Before deploying, ensure you have:

1. **AWS CLI configured** with appropriate credentials
2. **Node.js 18.x or later** installed
3. **Required environment variables** set:
   - `AWS_REGION` - AWS region (e.g., us-east-1)
   - `KNOWLEDGE_BASE_ID` - Bedrock Knowledge Base ID
   - `ANALYSIS_TABLE_NAME` - DynamoDB table name (default: icp-analysis-history)
   - `CREDENTIAL_VAULT_LAMBDA_ARN` - ARN of the credential vault Lambda
   - `MIN_SAMPLE_SIZE` - Minimum customers for analysis (default: 20)

4. **DynamoDB table created** with name matching `ANALYSIS_TABLE_NAME`
   - Partition key: `analysisId` (String)
   - On-demand billing mode
   - Encryption at rest enabled

5. **Bedrock Knowledge Base configured** and ID available

6. **Credential Vault Lambda deployed** and users have connected services (HubSpot, Mixpanel, Stripe)

## Deployment Steps

### Step 1: Install Dependencies

```bash
cd packages/agent
npm install
```

### Step 2: Build Lambda Package

```bash
npm run build
```

This will:
- Compile TypeScript to JavaScript
- Bundle all dependencies
- Create `dist/lambda.zip` deployment package

### Step 3: Set Environment Variables

```bash
export AWS_REGION=us-east-1
export KNOWLEDGE_BASE_ID=your-kb-id
export ANALYSIS_TABLE_NAME=icp-analysis-history
export CREDENTIAL_VAULT_LAMBDA_ARN=arn:aws:lambda:us-east-1:123456789012:function:credential-vault
export MIN_SAMPLE_SIZE=20
```

### Step 4: Deploy to AWS

```bash
npm run deploy
```

This script will:
1. Create IAM role with required permissions
2. Deploy Lambda function with configuration
3. Create EventBridge schedule (7-day cycle)
4. Create CloudWatch alarms for monitoring
5. Create SNS topic for alarm notifications

### Step 5: Verify Deployment

Check the deployment output for:
- Lambda function ARN
- EventBridge rule ARN
- SNS topic ARN for alarms

## Post-Deployment Configuration

### Subscribe to Alarm Notifications

```bash
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:123456789012:icp-refinement-engine-alarms \
  --protocol email \
  --notification-endpoint your-email@example.com
```

Confirm the subscription via email.

### Verify Lambda Configuration

```bash
aws lambda get-function-configuration \
  --function-name icp-refinement-engine
```

Verify:
- Runtime: nodejs18.x
- Timeout: 900 seconds (15 minutes)
- Memory: 1024 MB
- Environment variables are set correctly

### Verify EventBridge Schedule

```bash
aws events describe-rule \
  --name icp-refinement-schedule
```

Verify:
- State: ENABLED
- ScheduleExpression: rate(7 days)

## Manual Testing

See [MANUAL_TESTING.md](./MANUAL_TESTING.md) for comprehensive testing procedures.

## Troubleshooting

### Deployment Fails: "Role not found"

Wait 10-15 seconds after role creation for IAM propagation, then retry.

### Lambda Fails: "Missing environment variable"

Verify all required environment variables are set before deployment.

### Lambda Fails: "Access denied to Knowledge Base"

Verify the IAM role has `bedrock:InvokeModel`, `bedrock:Retrieve`, and `bedrock:UpdateKnowledgeBase` permissions.

### Lambda Fails: "Service not connected"

Ensure users have connected HubSpot, Mixpanel, and Stripe via the integration UI before running analysis.

## Monitoring

### CloudWatch Logs

View logs:
```bash
aws logs tail /aws/lambda/icp-refinement-engine --follow
```

### CloudWatch Metrics

View metrics in AWS Console:
- Namespace: `Sesari/ICPRefinement`
- Metrics: ICPAnalysisSuccess, CustomersAnalyzed, AnalysisDurationMs, ICPConfidenceScore

### CloudWatch Alarms

Three alarms are configured:
1. **Analysis Failure** - Triggers on 2 consecutive failures
2. **Insufficient Sample** - Triggers when customer count < MIN_SAMPLE_SIZE

## Cost Optimization

The deployment is designed to stay within AWS Free Tier:
- Lambda: 4 invocations/month (well within 1M free requests)
- Lambda execution: <15 minutes per run
- DynamoDB: On-demand pricing, minimal storage
- EventBridge: 4 scheduled events/month
- Bedrock: Nova Lite model for cost efficiency

## Updating the Function

To update after code changes:

```bash
npm run build
npm run deploy
```

The deployment script will update the existing function code and configuration.

## Rollback

To rollback to a previous version:

```bash
aws lambda update-function-code \
  --function-name icp-refinement-engine \
  --s3-bucket your-backup-bucket \
  --s3-key lambda-backup-v1.zip
```

## Security Best Practices

1. **IAM Permissions**: Use least-privilege principle
2. **API Keys**: Never hardcode credentials (use credential vault)
3. **Encryption**: Enable encryption at rest for DynamoDB
4. **Logging**: Never log PII or sensitive data
5. **Network**: Lambda runs in AWS-managed VPC (no custom VPC needed)

## Support

For issues or questions:
1. Check CloudWatch logs for error details
2. Review [MANUAL_TESTING.md](./MANUAL_TESTING.md) for validation steps
3. Verify all prerequisites are met
4. Check IAM permissions and environment variables
