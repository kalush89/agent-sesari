# Deployment Guide: Goal Decomposition Engine

## Overview

This guide covers deploying the Goal Decomposition Engine to AWS Lambda with proper IAM permissions and environment configuration.

## Prerequisites

- AWS Account with Bedrock access enabled
- AWS CLI configured with appropriate credentials
- Bedrock Knowledge Base created and populated with company context
- Node.js 20+ installed locally

## IAM Setup

### Step 1: Create IAM Policy

Create a new IAM policy with the permissions defined in `iam-policy-example.json`:

```bash
aws iam create-policy \
  --policy-name SesariGoalDecompositionPolicy \
  --policy-document file://iam-policy-example.json
```

### Step 2: Create Lambda Execution Role

Create an execution role for the Lambda function:

```bash
aws iam create-role \
  --role-name SesariGoalDecompositionRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "lambda.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'
```

### Step 3: Attach Policies

Attach the required policies to the execution role:

```bash
# Attach custom Bedrock policy
aws iam attach-role-policy \
  --role-name SesariGoalDecompositionRole \
  --policy-arn arn:aws:iam::YOUR_ACCOUNT_ID:policy/SesariGoalDecompositionPolicy

# Attach basic Lambda execution policy for CloudWatch Logs
aws iam attach-role-policy \
  --role-name SesariGoalDecompositionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
```

## Lambda Configuration

### Recommended Settings

Based on AWS Free Tier optimization (Requirements 9.1, 9.2):

- **Memory**: 512 MB (balances cost and performance)
- **Timeout**: 30 seconds (sufficient for Bedrock KB + Nova)
- **Runtime**: Node.js 20.x
- **Architecture**: arm64 (Graviton2 for better price/performance)

### Environment Variables

Configure the following environment variables in Lambda:

| Variable | Value | Notes |
|----------|-------|-------|
| `AWS_REGION` | `us-east-1` | Your AWS region |
| `KNOWLEDGE_BASE_ID` | `ABC123XYZ` | Your Bedrock Knowledge Base ID |
| `NOVA_MODEL_ID` | `amazon.nova-lite-v1:0` | Amazon Nova model identifier |
| `NODE_ENV` | `production` | Hides error details in responses |

## Deployment Options

### Option 1: Next.js API Route (MVP)

For initial development, deploy as a Next.js API route:

1. The API route at `/src/app/api/decompose-goal/route.ts` already imports the agent package
2. Deploy the Next.js app to Vercel or AWS Amplify
3. Environment variables are configured in the deployment platform

**Pros**: Simple deployment, no Lambda configuration needed
**Cons**: Less scalable, tied to Next.js deployment

### Option 2: Lambda Function (Production)

For production scaling, extract to a standalone Lambda:

1. Package the agent code with dependencies
2. Deploy to Lambda with the IAM role created above
3. Configure API Gateway to trigger the Lambda
4. Update Next.js API route to invoke Lambda instead of direct execution

**Pros**: Better scalability, independent deployment
**Cons**: More complex setup, requires API Gateway configuration

## Monitoring

### CloudWatch Logs

The Goal Decomposition Engine logs the following events:

- Incoming goal requests (truncated)
- Context retrieval success/failure
- Nova invocation details
- Validation results
- Errors with stack traces
- Execution time

### Key Metrics to Monitor

- **Invocation Count**: Stay within 1M free tier requests/month
- **Duration**: Should average ~100ms (Requirement 9.6)
- **Error Rate**: Monitor validation failures and Nova timeouts
- **Throttles**: Watch for rate limiting from Bedrock

## Cost Optimization

### Free Tier Limits

- **Lambda**: 1M requests/month, 400,000 GB-seconds compute
- **Nova Lite**: ~$0.0001 per request (~500 tokens)
- **Bedrock KB**: Minimal retrieval costs (3-5 documents)

### Expected Costs

For 1,000 decompositions/month:
- Lambda: Free (well within limits)
- Nova Lite: ~$0.10
- Bedrock KB: ~$0.05

**Total**: <$1/month

## Security Best Practices

1. **Never hardcode credentials**: Use IAM roles exclusively
2. **Restrict IAM permissions**: Use specific resource ARNs in production
3. **Enable CloudWatch Logs encryption**: Encrypt logs at rest
4. **Use VPC endpoints**: If deploying in VPC, use Bedrock VPC endpoints
5. **Rotate credentials**: If using access keys locally, rotate regularly

## Troubleshooting

### Common Issues

**Error: Missing environment variables**
- Verify all required environment variables are set in Lambda configuration
- Check that values are not empty strings

**Error: Access Denied (Bedrock)**
- Verify IAM role has `bedrock:InvokeModel` permission
- Check that model ARN matches the Nova model ID

**Error: Access Denied (Knowledge Base)**
- Verify IAM role has `bedrock:Retrieve` permission
- Check that Knowledge Base ID is correct

**Error: Timeout**
- Increase Lambda timeout (max 30 seconds recommended)
- Check Bedrock service health in AWS Status Dashboard

## Next Steps

After deployment:

1. Test the endpoint with sample goals
2. Monitor CloudWatch Logs for errors
3. Set up CloudWatch Alarms for error rates
4. Configure API Gateway throttling if needed
5. Implement request authentication (API keys or Cognito)
