# Quick Validation Guide - ICP Refinement Engine

## 5-Minute Deployment Validation

Use this guide for rapid post-deployment validation. For comprehensive testing, see [MANUAL_TESTING.md](./MANUAL_TESTING.md).

## Prerequisites

- Deployment completed successfully
- AWS CLI configured
- Test user ID with connected services

## Quick Checks

### 1. Lambda Configuration (30 seconds)

```bash
aws lambda get-function-configuration \
  --function-name icp-refinement-engine \
  --query '{Runtime:Runtime,Timeout:Timeout,Memory:MemorySize,State:State}'
```

✅ **Expected:** Runtime=nodejs18.x, Timeout=900, Memory=1024, State=Active

### 2. EventBridge Schedule (30 seconds)

```bash
aws events describe-rule \
  --name icp-refinement-schedule \
  --query '{State:State,Schedule:ScheduleExpression}'
```

✅ **Expected:** State=ENABLED, Schedule="rate(7 days)"

### 3. Environment Variables (30 seconds)

```bash
aws lambda get-function-configuration \
  --function-name icp-refinement-engine \
  --query 'Environment.Variables' | grep -E "KNOWLEDGE_BASE_ID|CREDENTIAL_VAULT"
```

✅ **Expected:** Both variables present and non-empty

### 4. Manual Invocation Test (2-5 minutes)

```bash
# Create test event
cat > test-event.json << EOF
{
  "userId": "YOUR_TEST_USER_ID",
  "source": "quick-validation"
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

✅ **Expected:** StatusCode=200, no FunctionError

### 5. Check Logs (1 minute)

```bash
aws logs tail /aws/lambda/icp-refinement-engine --since 5m
```

✅ **Expected:** 
- "Starting ICP refinement analysis"
- "ICP refinement completed successfully"
- No ERROR level logs

### 6. Verify CloudWatch Metrics (1 minute)

```bash
aws cloudwatch get-metric-statistics \
  --namespace Sesari/ICPRefinement \
  --metric-name ICPAnalysisSuccess \
  --start-time $(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 600 \
  --statistics Sum
```

✅ **Expected:** At least one datapoint with value=1

## Critical Issues

### ❌ Lambda Not Found
**Action:** Re-run deployment script

### ❌ EventBridge Disabled
**Action:** `aws events enable-rule --name icp-refinement-schedule`

### ❌ Manual Invocation Fails
**Action:** Check CloudWatch logs for error details

### ❌ No Metrics Published
**Action:** Verify IAM role has cloudwatch:PutMetricData permission

## Success Criteria

All checks pass:
- [x] Lambda configured correctly
- [x] EventBridge schedule enabled
- [x] Environment variables set
- [x] Manual invocation succeeds
- [x] Logs show successful execution
- [x] Metrics published

## Next Steps

After quick validation passes:

1. ✅ Complete full testing: [MANUAL_TESTING.md](./MANUAL_TESTING.md)
2. ✅ Subscribe to SNS alarms
3. ✅ Document test user ID
4. ✅ Schedule first production run

## Troubleshooting

For detailed troubleshooting, see:
- [MANUAL_TESTING.md](./MANUAL_TESTING.md) - Comprehensive testing
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Deployment issues
- [MANUAL_TRIGGER.md](./MANUAL_TRIGGER.md) - Invocation issues

## One-Line Health Check

```bash
aws lambda invoke --function-name icp-refinement-engine --payload '{"userId":"test-user"}' --cli-binary-format raw-in-base64-out /dev/stdout 2>&1 | grep -q "StatusCode.*200" && echo "✅ HEALTHY" || echo "❌ UNHEALTHY"
```

## Monitoring Dashboard

Create a simple monitoring dashboard:

```bash
# View key metrics
watch -n 30 'aws cloudwatch get-metric-statistics \
  --namespace Sesari/ICPRefinement \
  --metric-name ICPAnalysisSuccess \
  --start-time $(date -u -d "1 hour ago" +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum'
```

## Cost Check

Verify staying within free tier:

```bash
# Check Lambda invocations this month
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=icp-refinement-engine \
  --start-time $(date -u -d "30 days ago" +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 2592000 \
  --statistics Sum
```

✅ **Expected:** Sum < 10 (well within 1M free tier)
