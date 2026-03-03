# EventBridge Schedule Verification Guide

## Overview

This guide helps verify that the EventBridge schedule for the ICP Refinement Engine is correctly configured and operational.

## Quick Verification

```bash
# Check if schedule exists and is enabled
aws events describe-rule --name icp-refinement-schedule
```

Expected output should show:
- `State: "ENABLED"`
- `ScheduleExpression: "rate(7 days)"`

## Detailed Verification Steps

### Step 1: Verify Rule Exists

```bash
aws events describe-rule \
  --name icp-refinement-schedule \
  --query '{Name:Name,State:State,Schedule:ScheduleExpression,Description:Description}'
```

**Expected Output:**
```json
{
  "Name": "icp-refinement-schedule",
  "State": "ENABLED",
  "Schedule": "rate(7 days)",
  "Description": "Triggers ICP refinement analysis every 7 days"
}
```

✅ **Pass Criteria:**
- Rule exists
- State is ENABLED
- Schedule expression is "rate(7 days)"

### Step 2: Verify Lambda Target

```bash
aws events list-targets-by-rule \
  --rule icp-refinement-schedule
```

**Expected Output:**
```json
{
  "Targets": [
    {
      "Id": "1",
      "Arn": "arn:aws:lambda:us-east-1:123456789012:function:icp-refinement-engine"
    }
  ]
}
```

✅ **Pass Criteria:**
- Target exists
- Target ARN matches Lambda function ARN
- Target ID is "1"

### Step 3: Verify Lambda Permission

```bash
aws lambda get-policy \
  --function-name icp-refinement-engine \
  --query 'Policy' \
  --output text | jq '.Statement[] | select(.Sid=="AllowEventBridgeInvoke")'
```

**Expected Output:**
```json
{
  "Sid": "AllowEventBridgeInvoke",
  "Effect": "Allow",
  "Principal": {
    "Service": "events.amazonaws.com"
  },
  "Action": "lambda:InvokeFunction",
  "Resource": "arn:aws:lambda:us-east-1:123456789012:function:icp-refinement-engine",
  "Condition": {
    "ArnLike": {
      "AWS:SourceArn": "arn:aws:events:us-east-1:123456789012:rule/icp-refinement-schedule"
    }
  }
}
```

✅ **Pass Criteria:**
- Permission exists with Sid "AllowEventBridgeInvoke"
- Principal is "events.amazonaws.com"
- Action is "lambda:InvokeFunction"
- Source ARN matches EventBridge rule ARN

### Step 4: Test Schedule (Optional)

To test without waiting 7 days, temporarily change the schedule:

```bash
# Change to 5 minutes for testing
aws events put-rule \
  --name icp-refinement-schedule \
  --schedule-expression "rate(5 minutes)" \
  --state ENABLED

# Wait 5 minutes and check CloudWatch logs
aws logs tail /aws/lambda/icp-refinement-engine --follow

# Restore 7-day schedule
aws events put-rule \
  --name icp-refinement-schedule \
  --schedule-expression "rate(7 days)" \
  --state ENABLED
```

⚠️ **Warning:** Remember to restore the 7-day schedule after testing!

## Common Issues

### Issue: Rule Not Found

**Symptom:**
```
An error occurred (ResourceNotFoundException) when calling the DescribeRule operation
```

**Solution:**
- Verify deployment completed successfully
- Check AWS region matches Lambda function region
- Re-run deployment script

### Issue: Rule Disabled

**Symptom:**
```json
{
  "State": "DISABLED"
}
```

**Solution:**
```bash
aws events enable-rule --name icp-refinement-schedule
```

### Issue: No Targets Configured

**Symptom:**
```json
{
  "Targets": []
}
```

**Solution:**
```bash
# Get Lambda ARN
LAMBDA_ARN=$(aws lambda get-function \
  --function-name icp-refinement-engine \
  --query 'Configuration.FunctionArn' \
  --output text)

# Add target
aws events put-targets \
  --rule icp-refinement-schedule \
  --targets "Id=1,Arn=$LAMBDA_ARN"
```

### Issue: Lambda Permission Missing

**Symptom:**
Lambda not invoked by EventBridge, or permission error in logs

**Solution:**
```bash
# Get rule ARN
RULE_ARN=$(aws events describe-rule \
  --name icp-refinement-schedule \
  --query 'Arn' \
  --output text)

# Add permission
aws lambda add-permission \
  --function-name icp-refinement-engine \
  --statement-id AllowEventBridgeInvoke \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn $RULE_ARN
```

## Schedule Management

### Disable Schedule

To temporarily stop scheduled runs:
```bash
aws events disable-rule --name icp-refinement-schedule
```

### Enable Schedule

To resume scheduled runs:
```bash
aws events enable-rule --name icp-refinement-schedule
```

### Change Schedule Frequency

To change from 7 days to another interval:
```bash
# Every 14 days
aws events put-rule \
  --name icp-refinement-schedule \
  --schedule-expression "rate(14 days)" \
  --state ENABLED

# Every 3 days
aws events put-rule \
  --name icp-refinement-schedule \
  --schedule-expression "rate(3 days)" \
  --state ENABLED
```

⚠️ **Note:** More frequent runs increase costs. Stay within AWS Free Tier limits.

### Delete Schedule

To completely remove the schedule:
```bash
# Remove targets first
aws events remove-targets \
  --rule icp-refinement-schedule \
  --ids 1

# Delete rule
aws events delete-rule \
  --name icp-refinement-schedule
```

## Monitoring Schedule Invocations

### View Recent Invocations

```bash
# Check Lambda invocations from EventBridge
aws logs filter-log-events \
  --log-group-name /aws/lambda/icp-refinement-engine \
  --filter-pattern "aws.events" \
  --start-time $(date -u -d '7 days ago' +%s)000
```

### Check Next Scheduled Run

EventBridge doesn't provide "next run time" directly. Calculate based on last run:
- Last run: Check CloudWatch logs
- Next run: Last run + 7 days

### View Invocation History

```bash
# Get CloudWatch metrics for Lambda invocations
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=icp-refinement-engine \
  --start-time $(date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 604800 \
  --statistics Sum
```

## Best Practices

### Schedule Frequency

✅ **Recommended:** 7 days (as configured)
- Balances freshness with cost
- Allows time for customer data to accumulate
- Stays well within AWS Free Tier

❌ **Avoid:**
- Daily runs (unnecessary, increases cost)
- Hourly runs (excessive, high cost)
- Less than 3 days (insufficient data changes)

### Maintenance Windows

If you need to disable the schedule for maintenance:

1. Disable rule before maintenance
2. Perform maintenance
3. Test manual invocation
4. Re-enable rule

```bash
# Before maintenance
aws events disable-rule --name icp-refinement-schedule

# After maintenance and testing
aws events enable-rule --name icp-refinement-schedule
```

### Monitoring

Set up CloudWatch alarms for:
- Failed invocations
- No invocations in expected timeframe
- Lambda errors

## Verification Checklist

Use this checklist after deployment:

- [ ] EventBridge rule exists
- [ ] Rule is ENABLED
- [ ] Schedule expression is "rate(7 days)"
- [ ] Lambda target is configured
- [ ] Lambda permission exists
- [ ] Test invocation successful (optional)
- [ ] CloudWatch logs show scheduled invocations
- [ ] No errors in Lambda execution

## Support

For EventBridge issues:
1. Check AWS EventBridge console
2. Review CloudWatch logs for Lambda
3. Verify IAM permissions
4. Consult [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)

## Related Documentation

- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Full deployment guide
- [MANUAL_TRIGGER.md](./MANUAL_TRIGGER.md) - Manual invocation guide
- [MANUAL_TESTING.md](./MANUAL_TESTING.md) - Testing procedures
