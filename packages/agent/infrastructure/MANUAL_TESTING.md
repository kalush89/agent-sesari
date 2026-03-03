# ICP Refinement Engine - Manual Testing Checklist

## Overview

This document provides comprehensive manual testing procedures for validating the ICP Refinement Engine deployment.

## Prerequisites

- Lambda function deployed successfully
- EventBridge schedule created
- CloudWatch alarms configured
- Test user with connected services (HubSpot, Mixpanel, Stripe)
- At least 20 customers in HubSpot for valid analysis

## Testing Checklist

### 1. Lambda Configuration Validation

#### 1.1 Verify Lambda Settings

```bash
aws lambda get-function-configuration \
  --function-name icp-refinement-engine \
  --query '{Runtime:Runtime,Timeout:Timeout,Memory:MemorySize,Handler:Handler}'
```

**Expected Output:**
```json
{
  "Runtime": "nodejs18.x",
  "Timeout": 900,
  "Memory": 1024,
  "Handler": "index.handler"
}
```

✅ **Pass Criteria:**
- Runtime is nodejs18.x
- Timeout is 900 seconds (15 minutes)
- Memory is 1024 MB
- Handler is index.handler

#### 1.2 Verify Environment Variables

```bash
aws lambda get-function-configuration \
  --function-name icp-refinement-engine \
  --query 'Environment.Variables'
```

✅ **Pass Criteria:**
- AWS_REGION is set
- KNOWLEDGE_BASE_ID is set
- ANALYSIS_TABLE_NAME is set
- CREDENTIAL_VAULT_LAMBDA_ARN is set
- MIN_SAMPLE_SIZE is set
- NOVA_MODEL_ID is set to "amazon.nova-lite-v1:0"

#### 1.3 Verify IAM Role Permissions

```bash
aws lambda get-function \
  --function-name icp-refinement-engine \
  --query 'Configuration.Role'
```

Then check the role policies:
```bash
aws iam get-role-policy \
  --role-name icp-refinement-lambda-role \
  --policy-name icp-refinement-permissions
```

✅ **Pass Criteria:**
- bedrock:InvokeModel permission exists
- bedrock:Retrieve permission exists
- bedrock:UpdateKnowledgeBase permission exists
- dynamodb:PutItem, GetItem, Query permissions exist
- lambda:InvokeFunction permission exists (for credential vault)
- cloudwatch:PutMetricData permission exists

### 2. EventBridge Schedule Validation

#### 2.1 Verify Schedule Configuration

```bash
aws events describe-rule \
  --name icp-refinement-schedule
```

✅ **Pass Criteria:**
- State is "ENABLED"
- ScheduleExpression is "rate(7 days)"
- Description mentions ICP refinement

#### 2.2 Verify Lambda Target

```bash
aws events list-targets-by-rule \
  --rule icp-refinement-schedule
```

✅ **Pass Criteria:**
- Target ARN matches Lambda function ARN
- Target is configured correctly

### 3. Manual Lambda Invocation

#### 3.1 Prepare Test Event

Create a test event file `test-event.json`:

```json
{
  "userId": "test-user-123",
  "source": "manual-test"
}
```

**Important:** Replace `test-user-123` with an actual user ID that has:
- Connected HubSpot account
- Connected Mixpanel account (optional but recommended)
- Connected Stripe account (optional but recommended)
- At least 20 companies in HubSpot

#### 3.2 Invoke Lambda

```bash
aws lambda invoke \
  --function-name icp-refinement-engine \
  --payload file://test-event.json \
  --cli-binary-format raw-in-base64-out \
  response.json
```

✅ **Pass Criteria:**
- StatusCode is 200
- No FunctionError in response
- response.json contains no error messages

#### 3.3 Monitor Execution

Watch logs in real-time:
```bash
aws logs tail /aws/lambda/icp-refinement-engine --follow
```

✅ **Pass Criteria:**
- Logs show "Starting ICP refinement analysis"
- Logs show successful data fetching from HubSpot
- Logs show data correlation completed
- Logs show customer scoring completed
- Logs show trait analysis completed
- Logs show Knowledge Base update completed
- Logs show "ICP refinement completed successfully"
- No ERROR level logs appear
- Execution completes within 15 minutes

### 4. Execution Time Validation

#### 4.1 Check Lambda Duration

From CloudWatch logs, find the execution duration:
```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/icp-refinement-engine \
  --filter-pattern "ICP refinement completed successfully" \
  --limit 1
```

Look for the `duration_seconds` field in the log message.

✅ **Pass Criteria:**
- Execution time is under 900 seconds (15 minutes)
- Execution time is under 600 seconds (10 minutes) for typical datasets

### 5. Knowledge Base Update Validation

#### 5.1 Verify ICP Profile in Bedrock Console

1. Navigate to AWS Bedrock Console
2. Go to Knowledge Bases
3. Select your Knowledge Base (ID from KNOWLEDGE_BASE_ID)
4. Look for `icp_profile.md` document

✅ **Pass Criteria:**
- `icp_profile.md` file exists
- File was updated recently (timestamp matches test execution)
- File contains markdown content

#### 5.2 Validate ICP Profile Content

Download and review the ICP profile:

```bash
# Use AWS Console or Bedrock API to retrieve the document
```

✅ **Pass Criteria:**
- Metadata header includes version number
- Metadata header includes timestamp
- Traits section lists industries, size range, regions
- Reasoning section explains trait identification
- Confidence score is displayed (0-100)
- Sample size is included
- Markdown formatting is correct (headers, bullets, paragraphs)

#### 5.3 Verify Version Increment

If this is not the first run:
- Previous version: X
- New version: X + 1

✅ **Pass Criteria:**
- Version number incremented by exactly 1
- No version gaps or duplicates

### 6. DynamoDB Records Validation

#### 6.1 Query Analysis History

```bash
aws dynamodb scan \
  --table-name icp-analysis-history \
  --limit 1 \
  --scan-index-forward false
```

✅ **Pass Criteria:**
- Record exists with recent timestamp
- Record contains all required fields:
  - analysisId (ISO timestamp)
  - version
  - profile (complete ICP profile)
  - topCustomerIds (array of IDs)
  - scoreDistribution (min, max, mean, p90)
  - executionMetrics (durationMs, customersAnalyzed, apiCallCount)

#### 6.2 Verify Record Completeness

Check that the stored record has:
- Valid ISO timestamp as analysisId
- Profile matches Knowledge Base content
- Score distribution has realistic values
- Execution metrics are populated

✅ **Pass Criteria:**
- All fields are populated (no null values)
- Timestamp is valid ISO format
- Metrics are reasonable (duration > 0, customers > 0)

### 7. CloudWatch Metrics Validation

#### 7.1 Check Custom Metrics

```bash
aws cloudwatch get-metric-statistics \
  --namespace Sesari/ICPRefinement \
  --metric-name ICPAnalysisSuccess \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum
```

Repeat for other metrics:
- CustomersAnalyzed
- AnalysisDurationMs
- ICPConfidenceScore

✅ **Pass Criteria:**
- ICPAnalysisSuccess = 1 (success)
- CustomersAnalyzed > 0
- AnalysisDurationMs > 0 and < 900000 (15 minutes)
- ICPConfidenceScore between 0 and 100

### 8. CloudWatch Alarms Validation

#### 8.1 List Alarms

```bash
aws cloudwatch describe-alarms \
  --alarm-name-prefix icp-refinement-engine
```

✅ **Pass Criteria:**
- Three alarms exist:
  1. icp-refinement-engine-analysis-failure
  2. icp-refinement-engine-insufficient-sample
- All alarms are in OK state (not ALARM)
- All alarms have SNS topic configured

#### 8.2 Verify Alarm Configuration

For each alarm, verify:
- Correct metric name and namespace
- Appropriate threshold
- SNS topic ARN is set
- ActionsEnabled is true

✅ **Pass Criteria:**
- Analysis failure alarm: 2 evaluation periods, threshold 0
- Insufficient sample alarm: threshold matches MIN_SAMPLE_SIZE

### 9. Error Handling Validation

#### 9.1 Test with Invalid User ID

Invoke Lambda with non-existent user:
```json
{
  "userId": "non-existent-user",
  "source": "error-test"
}
```

✅ **Pass Criteria:**
- Lambda returns error response
- Error message indicates service not connected
- No partial data written to Knowledge Base
- Failure metric published (ICPAnalysisSuccess = 0)

#### 9.2 Test with Insufficient Data

Invoke Lambda with user that has < MIN_SAMPLE_SIZE customers:

✅ **Pass Criteria:**
- Lambda returns error about insufficient sample size
- Error logged with diagnostic information
- No Knowledge Base update
- Alarm triggered for insufficient sample

### 10. Log Quality Validation

#### 10.1 Review Log Structure

Check recent logs for:
- Correlation IDs in all log entries
- Appropriate log levels (INFO, WARN, ERROR)
- Execution phase labels
- No PII in logs

✅ **Pass Criteria:**
- All logs have correlation_id field
- All logs have phase field
- No email addresses, names, or sensitive data in logs
- Structured JSON format for easy parsing

#### 10.2 Verify No PII Leakage

Search logs for common PII patterns:
```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/icp-refinement-engine \
  --filter-pattern "@example.com"
```

✅ **Pass Criteria:**
- No email addresses found
- No phone numbers found
- No personal names found
- Only aggregated/masked data in logs

## Test Results Summary

| Test Category | Status | Notes |
|--------------|--------|-------|
| Lambda Configuration | ⬜ | |
| EventBridge Schedule | ⬜ | |
| Manual Invocation | ⬜ | |
| Execution Time | ⬜ | |
| Knowledge Base Update | ⬜ | |
| DynamoDB Records | ⬜ | |
| CloudWatch Metrics | ⬜ | |
| CloudWatch Alarms | ⬜ | |
| Error Handling | ⬜ | |
| Log Quality | ⬜ | |

**Legend:** ✅ Pass | ❌ Fail | ⬜ Not Tested

## Common Issues and Solutions

### Issue: Lambda times out

**Solution:**
- Check if dataset is too large (>1000 companies)
- Verify API rate limits aren't causing delays
- Check if checkpoint/resume logic is working

### Issue: Knowledge Base update fails

**Solution:**
- Verify KNOWLEDGE_BASE_ID is correct
- Check IAM permissions for Bedrock
- Ensure Knowledge Base is in same region as Lambda

### Issue: No metrics published

**Solution:**
- Verify IAM role has cloudwatch:PutMetricData permission
- Check CloudWatch Logs for metric publishing errors
- Ensure metrics namespace is correct

### Issue: Alarms not triggering

**Solution:**
- Verify SNS topic subscription is confirmed
- Check alarm configuration (threshold, evaluation periods)
- Ensure metrics are being published correctly

## Next Steps After Successful Testing

1. ✅ Subscribe to SNS topic for alarm notifications
2. ✅ Document any environment-specific configurations
3. ✅ Set up monitoring dashboard in CloudWatch
4. ✅ Schedule regular review of ICP profiles
5. ✅ Train team on interpreting ICP analysis results
