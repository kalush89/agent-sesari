# ICP Refinement Engine - Infrastructure

## Overview

This directory contains deployment scripts, configuration, and documentation for the Dynamic ICP Refinement Engine Lambda function.

## Quick Start

```bash
# 1. Set environment variables
export AWS_REGION=us-east-1
export KNOWLEDGE_BASE_ID=your-kb-id
export CREDENTIAL_VAULT_LAMBDA_ARN=arn:aws:lambda:region:account:function:credential-vault
export ANALYSIS_TABLE_NAME=icp-analysis-history

# 2. Build and deploy
cd packages/agent
npm install
npm run deploy
```

## Documentation

### Deployment

- **[PRE_DEPLOYMENT_CHECKLIST.md](./PRE_DEPLOYMENT_CHECKLIST.md)** - Complete this before deploying
- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - Step-by-step deployment instructions
- **[MANUAL_TESTING.md](./MANUAL_TESTING.md)** - Comprehensive testing procedures
- **[MANUAL_TRIGGER.md](./MANUAL_TRIGGER.md)** - How to manually invoke the Lambda

### Architecture

The ICP Refinement Engine consists of:

1. **Lambda Function** (`icp-refinement-engine`)
   - Runtime: Node.js 18.x
   - Memory: 1024 MB
   - Timeout: 15 minutes
   - Trigger: EventBridge schedule (7 days)

2. **EventBridge Schedule** (`icp-refinement-schedule`)
   - Expression: `rate(7 days)`
   - Target: Lambda function

3. **CloudWatch Alarms**
   - Analysis failure alarm (2 consecutive failures)
   - Insufficient sample alarm (< MIN_SAMPLE_SIZE)

4. **SNS Topic** (`icp-refinement-engine-alarms`)
   - Alarm notifications

5. **IAM Role** (`icp-refinement-lambda-role`)
   - Bedrock permissions
   - DynamoDB permissions
   - Lambda invoke permissions
   - CloudWatch permissions

## Files

### Deployment Scripts

- **`deploy.ts`** - Main deployment script
  - Creates IAM role with required permissions
  - Deploys Lambda function
  - Creates EventBridge schedule
  - Configures CloudWatch alarms
  - Creates SNS topic for notifications

### Configuration

Environment variables required:
- `AWS_REGION` - AWS region (e.g., us-east-1)
- `KNOWLEDGE_BASE_ID` - Bedrock Knowledge Base ID
- `ANALYSIS_TABLE_NAME` - DynamoDB table name
- `CREDENTIAL_VAULT_LAMBDA_ARN` - Credential vault Lambda ARN
- `MIN_SAMPLE_SIZE` - Minimum customers for analysis (default: 20)

### Documentation

- `README.md` - This file
- `PRE_DEPLOYMENT_CHECKLIST.md` - Pre-deployment verification
- `DEPLOYMENT_GUIDE.md` - Deployment instructions
- `MANUAL_TESTING.md` - Testing procedures
- `MANUAL_TRIGGER.md` - Manual invocation guide

## Prerequisites

### AWS Resources

1. **DynamoDB Table** - `icp-analysis-history`
   ```bash
   aws dynamodb create-table \
     --table-name icp-analysis-history \
     --attribute-definitions AttributeName=analysisId,AttributeType=S \
     --key-schema AttributeName=analysisId,KeyType=HASH \
     --billing-mode PAY_PER_REQUEST \
     --sse-specification Enabled=true
   ```

2. **Bedrock Knowledge Base** - Created and configured

3. **Credential Vault Lambda** - Deployed and functional

4. **Service Integrations** - HubSpot, Mixpanel, Stripe connected

### Development Tools

- Node.js 18.x or later
- AWS CLI configured
- TypeScript compiler
- npm or yarn

## Deployment Process

### 1. Pre-Deployment

Complete [PRE_DEPLOYMENT_CHECKLIST.md](./PRE_DEPLOYMENT_CHECKLIST.md):
- Verify AWS resources exist
- Set environment variables
- Build and test code
- Review security settings

### 2. Deploy

```bash
npm run deploy
```

This will:
1. Create IAM role (if not exists)
2. Deploy Lambda function
3. Create EventBridge schedule
4. Configure CloudWatch alarms
5. Create SNS topic

### 3. Post-Deployment

Complete [MANUAL_TESTING.md](./MANUAL_TESTING.md):
- Verify Lambda configuration
- Test manual invocation
- Validate Knowledge Base updates
- Check CloudWatch metrics
- Subscribe to alarm notifications

## Manual Invocation

For testing or immediate updates:

```bash
# Create event file
cat > test-event.json << EOF
{
  "userId": "your-user-id",
  "source": "manual-test"
}
EOF

# Invoke Lambda
aws lambda invoke \
  --function-name icp-refinement-engine \
  --payload file://test-event.json \
  --cli-binary-format raw-in-base64-out \
  response.json

# Check response
cat response.json
```

See [MANUAL_TRIGGER.md](./MANUAL_TRIGGER.md) for details.

## Monitoring

### CloudWatch Logs

```bash
# Tail logs
aws logs tail /aws/lambda/icp-refinement-engine --follow

# Filter errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/icp-refinement-engine \
  --filter-pattern "ERROR"
```

### CloudWatch Metrics

Namespace: `Sesari/ICPRefinement`

Metrics:
- `ICPAnalysisSuccess` - 1 for success, 0 for failure
- `CustomersAnalyzed` - Number of customers processed
- `AnalysisDurationMs` - Execution time in milliseconds
- `ICPConfidenceScore` - Confidence score (0-100)

### CloudWatch Alarms

Three alarms configured:
1. **Analysis Failure** - 2 consecutive failures
2. **Insufficient Sample** - Customer count < MIN_SAMPLE_SIZE

Subscribe to notifications:
```bash
aws sns subscribe \
  --topic-arn arn:aws:sns:region:account:icp-refinement-engine-alarms \
  --protocol email \
  --notification-endpoint your-email@example.com
```

## Troubleshooting

### Deployment Fails

**Issue:** "Role not found"
- **Solution:** Wait 10-15 seconds for IAM propagation, retry

**Issue:** "Missing environment variable"
- **Solution:** Set all required environment variables before deployment

**Issue:** "Access denied"
- **Solution:** Verify AWS credentials have required permissions

### Lambda Fails

**Issue:** "Service not connected"
- **Solution:** Ensure user has connected services via integration UI

**Issue:** "Insufficient sample size"
- **Solution:** User needs at least MIN_SAMPLE_SIZE customers

**Issue:** "Lambda timeout"
- **Solution:** Check dataset size, verify API rate limits

See [MANUAL_TESTING.md](./MANUAL_TESTING.md) for comprehensive troubleshooting.

## Cost Optimization

The deployment is designed for AWS Free Tier:

- **Lambda:** 4 invocations/month (within 1M free)
- **Lambda execution:** <15 minutes per run
- **DynamoDB:** On-demand, minimal storage
- **EventBridge:** 4 events/month
- **Bedrock:** Nova Lite model (cost-effective)

**Estimated cost:** $0-5/month (within free tier)

## Security

### IAM Permissions

Lambda execution role has least-privilege permissions:
- Bedrock: InvokeModel, Retrieve, UpdateKnowledgeBase
- DynamoDB: PutItem, GetItem, Query
- Lambda: InvokeFunction (credential vault)
- CloudWatch: Logs and metrics

### Data Privacy

- PII stripped before LLM analysis
- No credentials in code or logs
- DynamoDB encryption at rest
- Audit trail logging
- GDPR/CCPA compliant

### Credentials

- API keys stored in credential vault
- Retrieved at runtime via Lambda invocation
- Never stored in environment variables
- Encrypted in transit and at rest

## Updating

To update after code changes:

```bash
# Build new version
npm run build

# Deploy update
npm run deploy
```

The deployment script will update the existing function.

## Rollback

To rollback to previous version:

```bash
# Disable schedule
aws events disable-rule --name icp-refinement-schedule

# Rollback code
aws lambda update-function-code \
  --function-name icp-refinement-engine \
  --s3-bucket backup-bucket \
  --s3-key lambda-backup.zip

# Re-enable schedule
aws events enable-rule --name icp-refinement-schedule
```

## Support

For issues or questions:

1. Check [MANUAL_TESTING.md](./MANUAL_TESTING.md) for validation steps
2. Review CloudWatch logs for errors
3. Verify [PRE_DEPLOYMENT_CHECKLIST.md](./PRE_DEPLOYMENT_CHECKLIST.md) items
4. Contact team lead or AWS support

## Contributing

When modifying deployment:

1. Update relevant documentation
2. Test changes in development environment
3. Update version numbers
4. Document breaking changes
5. Update this README

## License

Internal use only - Sesari project
