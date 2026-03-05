# Daily Briefing Generator Infrastructure Deployment

This directory contains deployment scripts for the Daily Briefing Generator Lambda function, which transforms raw business signals into narrative-driven morning summaries.

## Architecture Overview

The Daily Briefing Generator consists of:
- **DynamoDB Table**: Stores generated briefings with 90-day retention
- **Lambda Function**: Retrieves signals, prioritizes them, generates narratives using Amazon Nova Lite
- **EventBridge Rule**: Triggers daily at 8:00 AM UTC

## Prerequisites

### Required Tools
- Node.js 20.x or later
- AWS CLI configured with credentials
- TypeScript (`npm install -g typescript`)
- zip utility (for Lambda packaging)

### Required AWS Permissions

Your AWS IAM user/role needs the following permissions:

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
        "events:PutRule",
        "events:PutTargets",
        "events:DescribeRule",
        "events:ListTargetsByRule"
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
export AWS_ACCOUNT_ID=123456789012  # Your AWS account ID

# Optional (defaults provided)
export LAMBDA_FUNCTION_NAME=briefing-generator
export IAM_ROLE_NAME=briefing-generator-role
export EVENTBRIDGE_RULE_NAME=briefing-generator-daily
export DYNAMODB_TABLE_NAME=Briefings
export UNIVERSAL_SIGNALS_TABLE=UniversalSignals
export BEDROCK_MODEL_ID=amazon.nova-lite-v1:0
export MAX_INSIGHTS=10
export NARRATIVE_MAX_WORDS=150
export SCHEDULE_EXPRESSION="cron(0 8 * * ? *)"
```

## Deployment Steps

### Step 1: Install Dependencies

```bash
cd packages/lambdas/briefing-generator
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
- Table: `Briefings` with on-demand billing
- Primary key: `PK` (briefing#{userId}), `SK` (date#{YYYY-MM-DD})
- TTL: 90-day retention on `ttl` attribute
- Optimized for AWS Free Tier compliance

### Step 4: Deploy Lambda Function

```bash
npx tsx infrastructure/deploy-lambda.ts
```

This creates:
- Lambda function: `briefing-generator`
- Runtime: Node.js 20.x
- Memory: 512 MB
- Timeout: 30 seconds
- IAM role with DynamoDB, Bedrock, and CloudWatch permissions
- Environment variables configured

### Step 5: Setup EventBridge Scheduler

```bash
npx tsx infrastructure/setup-eventbridge.ts
```

This creates:
- EventBridge rule: `briefing-generator-daily`
- Schedule: `cron(0 8 * * ? *)` (8 AM UTC daily)
- Target: Briefing generator Lambda
- Retry policy: 2 attempts, 1 hour max event age

## Verification

### Test the Lambda Function

Manually invoke the function:
```bash
aws lambda invoke \
  --function-name briefing-generator \
  --payload '{}' \
  response.json

cat response.json
```

### Check CloudWatch Logs

```bash
aws logs tail /aws/lambda/briefing-generator --follow
```

### Query DynamoDB

Check stored briefings:
```bash
aws dynamodb scan \
  --table-name Briefings \
  --limit 10
```

### Verify EventBridge Rule

```bash
aws events describe-rule --name briefing-generator-daily
```

## Configuration Reference

### Environment Variables

#### Deployment Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AWS_REGION` | Yes | `us-east-1` | AWS region for deployment |
| `AWS_ACCOUNT_ID` | Yes | - | Your AWS account ID |
| `LAMBDA_FUNCTION_NAME` | No | `briefing-generator` | Lambda function name |
| `IAM_ROLE_NAME` | No | `briefing-generator-role` | IAM role name |
| `EVENTBRIDGE_RULE_NAME` | No | `briefing-generator-daily` | EventBridge rule name |
| `DYNAMODB_TABLE_NAME` | No | `Briefings` | Briefings table name |
| `SCHEDULE_EXPRESSION` | No | `cron(0 8 * * ? *)` | EventBridge schedule |

#### Lambda Runtime Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `UNIVERSAL_SIGNALS_TABLE` | No | `UniversalSignals` | Source signals table name |
| `BRIEFING_STORE_TABLE` | No | `Briefings` | Briefings storage table name |
| `BEDROCK_MODEL_ID` | No | `amazon.nova-lite-v1:0` | Amazon Bedrock model ID |
| `MAX_INSIGHTS` | No | `10` | Maximum insights per briefing |
| `NARRATIVE_MAX_WORDS` | No | `150` | Maximum words per narrative |

### DynamoDB Schema

**Table: Briefings**

Primary Key:
- `PK` (String): `briefing#{userId}`
- `SK` (String): `date#{YYYY-MM-DD}`

Attributes:
- `generatedAt` (Number): Unix timestamp of generation
- `signalCount` (Number): Total signals processed
- `insightCount` (Number): Number of insights generated
- `priorityLevel` (String): `critical`, `high`, or `normal`
- `content` (String): Compressed JSON of insights
- `ttl` (Number): Expiration timestamp (90 days)

### IAM Permissions Required

The Lambda execution role requires:

**DynamoDB Permissions:**
```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:Query",
    "dynamodb:GetItem"
  ],
  "Resource": [
    "arn:aws:dynamodb:*:*:table/UniversalSignals",
    "arn:aws:dynamodb:*:*:table/UniversalSignals/index/*"
  ]
}
```

```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:PutItem",
    "dynamodb:GetItem"
  ],
  "Resource": [
    "arn:aws:dynamodb:*:*:table/Briefings"
  ]
}
```

**Bedrock Permissions:**
```json
{
  "Effect": "Allow",
  "Action": [
    "bedrock:InvokeModel"
  ],
  "Resource": [
    "arn:aws:bedrock:*::foundation-model/amazon.nova-lite-v1:0"
  ]
}
```

**CloudWatch Permissions:**
```json
{
  "Effect": "Allow",
  "Action": [
    "cloudwatch:PutMetricData"
  ],
  "Resource": "*"
}
```

## Monitoring

### CloudWatch Logs

Lambda logs are available at:
```
/aws/lambda/briefing-generator
```

### CloudWatch Metrics

Monitor these metrics:
- Lambda invocations
- Lambda errors
- Lambda duration
- DynamoDB read/write capacity
- Bedrock API calls

### Recommended Alarms

Set up CloudWatch alarms for:
- Lambda error rate > 5%
- Lambda duration > 25 seconds (approaching timeout)
- DynamoDB throttling events
- Bedrock API failures > 10/hour

## Troubleshooting

### Lambda Deployment Fails

**Symptom**: Deployment script fails with IAM or packaging errors

**Possible causes**:
1. IAM role creation permissions missing
2. Build failed (TypeScript compilation errors)
3. Missing dependencies in package.json

**Solution**:
```bash
# Verify IAM permissions
aws iam get-user

# Rebuild the function
npm run build

# Check for TypeScript errors
npm run type-check

# Verify dependencies are installed
npm install
```

### EventBridge Not Triggering

**Symptom**: Lambda not executing at scheduled time

**Possible causes**:
1. EventBridge rule disabled
2. Lambda permission missing
3. Incorrect cron expression

**Solution**:
```bash
# Verify rule is enabled
aws events describe-rule --name briefing-generator-daily

# Check Lambda has EventBridge permission
aws lambda get-policy --function-name briefing-generator

# Manually invoke to test
aws lambda invoke --function-name briefing-generator --payload '{}' response.json
```

### DynamoDB Access Denied

**Symptom**: Lambda fails with DynamoDB permission errors

**Possible causes**:
1. IAM role missing DynamoDB permissions
2. Table names don't match environment variables
3. Table doesn't exist

**Solution**:
```bash
# Verify IAM role permissions
aws iam get-role-policy \
  --role-name briefing-generator-role \
  --policy-name BriefingGeneratorPolicy

# Verify table exists
aws dynamodb describe-table --table-name Briefings
aws dynamodb describe-table --table-name UniversalSignals

# Check Lambda environment variables
aws lambda get-function-configuration \
  --function-name briefing-generator \
  --query 'Environment.Variables'
```

### Bedrock API Failures

**Symptom**: Narrative generation fails with Bedrock errors

**Possible causes**:
1. Model ID incorrect or unavailable in region
2. IAM role missing Bedrock permissions
3. Bedrock service quota exceeded

**Solution**:
```bash
# Verify Bedrock model availability
aws bedrock list-foundation-models --region us-east-1

# Check IAM permissions
aws iam get-role-policy \
  --role-name briefing-generator-role \
  --policy-name BriefingGeneratorPolicy

# Review CloudWatch Logs for detailed error
aws logs tail /aws/lambda/briefing-generator --follow
```

### Lambda Timeout

**Symptom**: Lambda execution exceeds 30 seconds

**Possible causes**:
1. Too many signals to process
2. Bedrock API slow response
3. DynamoDB query performance issues

**Solution**:
1. Check CloudWatch Logs for slow operations
2. Reduce `MAX_INSIGHTS` environment variable
3. Optimize signal retrieval queries
4. Consider increasing timeout (max 15 minutes):
   ```bash
   aws lambda update-function-configuration \
     --function-name briefing-generator \
     --timeout 60
   ```

### No Briefings Generated

**Symptom**: Lambda executes successfully but no briefings in DynamoDB

**Possible causes**:
1. No signals in UniversalSignals table
2. Signal time range query returns empty results
3. All signals filtered out by prioritization

**Solution**:
```bash
# Check if signals exist
aws dynamodb scan --table-name UniversalSignals --limit 10

# Check Lambda logs for signal count
aws logs tail /aws/lambda/briefing-generator --follow

# Manually invoke with verbose logging
aws lambda invoke \
  --function-name briefing-generator \
  --log-type Tail \
  --payload '{}' \
  response.json
```

### Compressed Content Issues

**Symptom**: Briefing content appears corrupted or unreadable

**Possible causes**:
1. Compression/decompression mismatch
2. Character encoding issues
3. Content exceeds DynamoDB item size limit (400 KB)

**Solution**:
1. Review compression implementation in `src/compression.ts`
2. Reduce `MAX_INSIGHTS` to decrease content size
3. Check CloudWatch Logs for compression errors

## Cost Optimization

### AWS Free Tier Compliance

This infrastructure is designed to stay within AWS Free Tier limits:

- **Lambda**: 1M requests/month free (expected: ~30/month)
- **DynamoDB**: 25 GB storage, 25 read/write capacity units free
- **EventBridge**: 1M events/month free
- **Bedrock**: Pay-per-use (Nova Lite is cost-optimized)
- **CloudWatch Logs**: 5 GB ingestion, 5 GB storage free

**Expected monthly cost**: <$2 for typical usage (mostly Bedrock API calls)

### Cost Monitoring

Monitor costs in AWS Cost Explorer:
```bash
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=SERVICE
```

### Cost Reduction Tips

1. **Reduce Bedrock calls**: Lower `MAX_INSIGHTS` to generate fewer narratives
2. **Adjust schedule**: Change to weekly instead of daily
3. **Optimize Lambda memory**: Test with 256 MB if performance allows
4. **Enable DynamoDB auto-scaling**: Only if exceeding free tier

## Updating the Infrastructure

### Update Lambda Code

```bash
npm run build
npx tsx infrastructure/deploy-lambda.ts
```

The script automatically detects existing functions and updates them.

### Update Environment Variables

```bash
export MAX_INSIGHTS=5
export NARRATIVE_MAX_WORDS=100
npx tsx infrastructure/deploy-lambda.ts
```

### Update EventBridge Schedule

```bash
export SCHEDULE_EXPRESSION="cron(0 0 * * MON *)"  # Weekly on Monday
npx tsx infrastructure/setup-eventbridge.ts
```

### Update DynamoDB TTL

```bash
# TTL is set during table creation
# To modify, use AWS Console or CLI:
aws dynamodb update-time-to-live \
  --table-name Briefings \
  --time-to-live-specification "Enabled=true,AttributeName=ttl"
```

## Cleanup

To remove all infrastructure:

```bash
# Delete EventBridge rule
aws events remove-targets --rule briefing-generator-daily --ids 1
aws events delete-rule --name briefing-generator-daily

# Delete Lambda function
aws lambda delete-function --function-name briefing-generator

# Delete IAM role
aws iam delete-role-policy \
  --role-name briefing-generator-role \
  --policy-name BriefingGeneratorPolicy
aws iam detach-role-policy \
  --role-name briefing-generator-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam delete-role --role-name briefing-generator-role

# Delete DynamoDB table
aws dynamodb delete-table --table-name Briefings
```

## Support

For issues or questions:
1. Check CloudWatch Logs for error details
2. Review this troubleshooting guide
3. Consult the design document at `.kiro/specs/daily-briefing-generator/design.md`
4. Verify all environment variables are set correctly
