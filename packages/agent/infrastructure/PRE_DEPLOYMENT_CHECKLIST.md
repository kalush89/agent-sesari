# Pre-Deployment Checklist - ICP Refinement Engine

## Overview

Complete this checklist before deploying the ICP Refinement Engine to ensure all prerequisites are met and the deployment will succeed.

## Infrastructure Prerequisites

### ✅ AWS Account Setup

- [ ] AWS account created and active
- [ ] AWS CLI installed and configured
- [ ] AWS credentials have appropriate permissions:
  - [ ] Lambda: CreateFunction, UpdateFunctionCode, UpdateFunctionConfiguration
  - [ ] IAM: CreateRole, AttachRolePolicy, PutRolePolicy
  - [ ] EventBridge: PutRule, PutTargets
  - [ ] CloudWatch: PutMetricAlarm
  - [ ] SNS: CreateTopic
  - [ ] DynamoDB: CreateTable, PutItem, GetItem, Query
  - [ ] Bedrock: InvokeModel, UpdateKnowledgeBase

### ✅ DynamoDB Table

- [ ] Table created with name: `icp-analysis-history` (or custom name)
- [ ] Partition key: `analysisId` (String)
- [ ] Billing mode: On-demand
- [ ] Encryption at rest: Enabled
- [ ] Region: Same as Lambda function

**Create table command:**
```bash
aws dynamodb create-table \
  --table-name icp-analysis-history \
  --attribute-definitions AttributeName=analysisId,AttributeType=S \
  --key-schema AttributeName=analysisId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --sse-specification Enabled=true
```

### ✅ Bedrock Knowledge Base

- [ ] Knowledge Base created in Bedrock
- [ ] Knowledge Base ID available
- [ ] Knowledge Base in same region as Lambda
- [ ] Knowledge Base configured for document storage
- [ ] Test write access to Knowledge Base

**Get Knowledge Base ID:**
```bash
aws bedrock-agent list-knowledge-bases
```

### ✅ Credential Vault Lambda

- [ ] Credential vault Lambda deployed
- [ ] Lambda ARN available
- [ ] Credential vault DynamoDB table created
- [ ] Encryption configured (KMS)
- [ ] Test credential retrieval working

**Verify credential vault:**
```bash
aws lambda get-function \
  --function-name credential-vault \
  --query 'Configuration.FunctionArn'
```

### ✅ Service Integrations

- [ ] HubSpot OAuth app configured
- [ ] Mixpanel service account created (optional)
- [ ] Stripe API access configured (optional)
- [ ] Test user has connected at least HubSpot
- [ ] Test user has at least 20 companies in HubSpot

## Environment Configuration

### ✅ Required Environment Variables

Set these before deployment:

```bash
# Required
export AWS_REGION=us-east-1
export KNOWLEDGE_BASE_ID=your-kb-id-here
export CREDENTIAL_VAULT_LAMBDA_ARN=arn:aws:lambda:region:account:function:credential-vault
export ANALYSIS_TABLE_NAME=icp-analysis-history

# Optional (with defaults)
export MIN_SAMPLE_SIZE=20
```

Verify variables are set:
```bash
echo $AWS_REGION
echo $KNOWLEDGE_BASE_ID
echo $CREDENTIAL_VAULT_LAMBDA_ARN
echo $ANALYSIS_TABLE_NAME
```

### ✅ Nova Model Access

- [ ] Amazon Bedrock access enabled in account
- [ ] Nova Lite model access requested and approved
- [ ] Model ID: `amazon.nova-lite-v1:0`

**Check model access:**
```bash
aws bedrock list-foundation-models \
  --query 'modelSummaries[?modelId==`amazon.nova-lite-v1:0`]'
```

## Code Prerequisites

### ✅ Development Environment

- [ ] Node.js 18.x or later installed
- [ ] npm or yarn installed
- [ ] TypeScript compiler available
- [ ] Git repository cloned

**Verify versions:**
```bash
node --version  # Should be v18.x or later
npm --version
tsc --version
```

### ✅ Dependencies

- [ ] Navigate to packages/agent directory
- [ ] Install dependencies: `npm install`
- [ ] Verify no dependency errors
- [ ] All AWS SDK packages installed

**Install dependencies:**
```bash
cd packages/agent
npm install
```

### ✅ Build Process

- [ ] TypeScript compiles without errors
- [ ] Build script creates dist directory
- [ ] Lambda deployment package created (lambda.zip)
- [ ] Package size < 50MB (Lambda limit)

**Test build:**
```bash
npm run build
ls -lh dist/lambda.zip
```

### ✅ Tests

- [ ] All unit tests pass
- [ ] All property-based tests pass (if implemented)
- [ ] Integration tests pass with mocked services
- [ ] No failing tests

**Run tests:**
```bash
npm test
```

## Security Prerequisites

### ✅ IAM Permissions

Review required permissions for Lambda execution role:

**Bedrock:**
- [ ] bedrock:InvokeModel
- [ ] bedrock:Retrieve
- [ ] bedrock:UpdateKnowledgeBase

**DynamoDB:**
- [ ] dynamodb:PutItem
- [ ] dynamodb:GetItem
- [ ] dynamodb:Query

**Lambda:**
- [ ] lambda:InvokeFunction (for credential vault)

**CloudWatch:**
- [ ] logs:CreateLogGroup
- [ ] logs:CreateLogStream
- [ ] logs:PutLogEvents
- [ ] cloudwatch:PutMetricData

### ✅ Data Privacy

- [ ] PII masking implemented and tested
- [ ] No credentials in code or logs
- [ ] Encryption at rest enabled for DynamoDB
- [ ] Audit trail logging configured
- [ ] GDPR/CCPA compliance reviewed

## Cost Optimization

### ✅ AWS Free Tier Compliance

Verify deployment stays within free tier:

- [ ] Lambda: 4 invocations/month (within 1M free)
- [ ] Lambda memory: 1024 MB (reasonable for workload)
- [ ] Lambda timeout: 15 minutes (maximum needed)
- [ ] DynamoDB: On-demand pricing (minimal storage)
- [ ] EventBridge: 4 events/month (within free tier)
- [ ] Bedrock: Nova Lite model (cost-effective)

**Estimated monthly cost:** $0-5 (within free tier)

### ✅ Performance Optimization

- [ ] Batch processing implemented for API calls
- [ ] Parallel processing for independent operations
- [ ] Checkpoint/resume logic for large datasets
- [ ] Efficient data structures used

## Monitoring Setup

### ✅ CloudWatch Configuration

- [ ] Log group will be created automatically
- [ ] Log retention period acceptable (default: never expire)
- [ ] Metrics namespace: `Sesari/ICPRefinement`
- [ ] Custom metrics configured

### ✅ Alarms

- [ ] SNS topic for alarm notifications
- [ ] Email address for alarm subscriptions
- [ ] Alarm thresholds reviewed and appropriate

### ✅ Observability

- [ ] Structured logging implemented
- [ ] Correlation IDs in all logs
- [ ] No PII in logs verified
- [ ] Log levels appropriate (INFO, WARN, ERROR)

## Documentation

### ✅ Deployment Documentation

- [ ] DEPLOYMENT_GUIDE.md reviewed
- [ ] MANUAL_TESTING.md reviewed
- [ ] MANUAL_TRIGGER.md reviewed
- [ ] Team trained on deployment process

### ✅ Operational Documentation

- [ ] Monitoring procedures documented
- [ ] Troubleshooting guide available
- [ ] Rollback procedures documented
- [ ] Support contacts identified

## Final Verification

### ✅ Pre-Deployment Test

Run this command to verify everything is ready:

```bash
# Check environment variables
env | grep -E "AWS_REGION|KNOWLEDGE_BASE_ID|CREDENTIAL_VAULT_LAMBDA_ARN|ANALYSIS_TABLE_NAME"

# Verify build
npm run build && ls -lh dist/lambda.zip

# Verify tests
npm test

# Verify AWS access
aws sts get-caller-identity
```

### ✅ Deployment Readiness

- [ ] All checklist items completed
- [ ] Team notified of deployment
- [ ] Maintenance window scheduled (if needed)
- [ ] Rollback plan prepared
- [ ] Monitoring dashboard ready

## Deployment Command

Once all checks pass, deploy with:

```bash
npm run deploy
```

## Post-Deployment

After successful deployment:

1. [ ] Complete manual testing checklist
2. [ ] Subscribe to SNS alarm notifications
3. [ ] Verify EventBridge schedule is enabled
4. [ ] Test manual invocation
5. [ ] Monitor first scheduled run
6. [ ] Document any environment-specific notes

## Rollback Plan

If deployment fails or issues arise:

1. **Immediate:** Disable EventBridge schedule
   ```bash
   aws events disable-rule --name icp-refinement-schedule
   ```

2. **Rollback Lambda:** Deploy previous version
   ```bash
   aws lambda update-function-code \
     --function-name icp-refinement-engine \
     --s3-bucket backup-bucket \
     --s3-key lambda-backup.zip
   ```

3. **Investigate:** Review CloudWatch logs for errors

4. **Fix:** Address issues and redeploy

## Support Contacts

- **AWS Support:** [AWS Support Portal](https://console.aws.amazon.com/support)
- **Team Lead:** [Contact Info]
- **On-Call Engineer:** [Contact Info]

## Sign-Off

- [ ] Technical Lead reviewed and approved
- [ ] Security reviewed and approved
- [ ] Operations team notified
- [ ] Deployment scheduled

**Deployment Date:** _______________

**Deployed By:** _______________

**Approval:** _______________
