# CloudWatch Alarms for ICP Refinement Engine

This document describes the CloudWatch alarms configured for monitoring the ICP Refinement Engine.

## Overview

Three alarms monitor critical conditions that require operator attention:

1. **Analysis Failures** - Detects consecutive analysis failures
2. **Low Confidence** - Alerts when ICP confidence score is too low
3. **Insufficient Sample** - Warns when customer sample size is below minimum

All alarms send notifications to an SNS topic that can be subscribed to via email, SMS, or other endpoints.

## Alarm Details

### 1. Analysis Failures Alarm

**Name**: `icp-refinement-engine-analysis-failures`

**Purpose**: Detects when the ICP refinement analysis fails multiple times in a row, indicating a systemic issue.

**Configuration**:
- Metric: `ICPAnalysisSuccess` (namespace: `ICPRefinement`)
- Threshold: 0 (success = 1, failure = 0)
- Evaluation: 2 consecutive periods (2 days)
- Period: 86400 seconds (1 day)
- Statistic: Sum
- Missing data: Treated as breaching

**When it triggers**:
- Lambda function throws unhandled exception
- HubSpot API fails after all retries
- Critical AWS service unavailable
- Invalid configuration prevents execution

**Response actions**:
1. Check CloudWatch logs for error details
2. Verify API credentials in credential vault
3. Check AWS service health dashboard
4. Review recent code deployments
5. Test manual invocation to reproduce issue

### 2. Low Confidence Alarm

**Name**: `icp-refinement-engine-low-confidence`

**Purpose**: Alerts when the Nova Lite analysis produces a low confidence score, indicating uncertain ICP traits.

**Configuration**:
- Metric: `ICPConfidenceScore` (namespace: `ICPRefinement`)
- Threshold: 50 (out of 100)
- Evaluation: 1 period (1 day)
- Period: 86400 seconds (1 day)
- Statistic: Average
- Missing data: Not breaching

**When it triggers**:
- Customer data is too diverse (no clear patterns)
- Sample size is small but above minimum
- Top customers have conflicting traits
- Nova Lite model uncertainty

**Response actions**:
1. Review the generated ICP profile reasoning
2. Check data completeness metrics
3. Verify top customer selection is working correctly
4. Consider increasing sample size threshold
5. Review masked customer data for quality

### 3. Insufficient Sample Size Alarm

**Name**: `icp-refinement-engine-insufficient-sample`

**Purpose**: Warns when the customer dataset is too small for reliable ICP analysis.

**Configuration**:
- Metric: `CustomersAnalyzed` (namespace: `ICPRefinement`)
- Threshold: 20 (configurable via MIN_SAMPLE_SIZE)
- Evaluation: 1 period (1 day)
- Period: 86400 seconds (1 day)
- Statistic: Average
- Missing data: Treated as breaching

**When it triggers**:
- Total customer count < MIN_SAMPLE_SIZE
- HubSpot returns fewer companies than expected
- Data correlation produces too many null records
- Scoring filters out too many customers

**Response actions**:
1. Check HubSpot integration for data sync issues
2. Verify credential vault has valid HubSpot credentials
3. Review correlation logic for excessive filtering
4. Consider lowering MIN_SAMPLE_SIZE (with caution)
5. Wait for more customer data to accumulate

## Setup Instructions

### Option 1: Automatic Setup (Recommended)

The deployment script automatically creates all alarms:

```bash
cd packages/agent
npx ts-node infrastructure/deploy.ts
```

### Option 2: Standalone Alarm Setup

If you've already deployed the Lambda but need to add alarms:

```bash
cd packages/agent
npx ts-node infrastructure/setup-alarms.ts
```

With email notifications:

```bash
SNS_EMAIL=your-email@example.com npx ts-node infrastructure/setup-alarms.ts
```

### Option 3: Terraform

Alarms are included in the Terraform configuration:

```bash
cd packages/agent/infrastructure/terraform
terraform apply
```

### Option 4: Manual AWS Console Setup

1. Go to CloudWatch Console → Alarms → Create Alarm
2. Select metric from `ICPRefinement` namespace
3. Configure threshold and evaluation periods (see above)
4. Add SNS topic as alarm action
5. Repeat for all three alarms

## SNS Topic Configuration

### Creating the Topic

The SNS topic `icp-refinement-engine-alarms` is created automatically during deployment.

### Subscribing to Notifications

#### Email Subscription

```bash
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:ACCOUNT_ID:icp-refinement-engine-alarms \
  --protocol email \
  --notification-endpoint your-email@example.com
```

Check your email and confirm the subscription.

#### SMS Subscription

```bash
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:ACCOUNT_ID:icp-refinement-engine-alarms \
  --protocol sms \
  --notification-endpoint +1234567890
```

#### Slack Integration

Use AWS Chatbot to send notifications to Slack:

1. Go to AWS Chatbot Console
2. Configure Slack workspace
3. Create notification configuration
4. Select SNS topic: `icp-refinement-engine-alarms`

## Monitoring Alarm State

### AWS Console

1. Go to CloudWatch Console → Alarms
2. Filter by name: `icp-refinement-engine-`
3. View alarm state: OK, ALARM, INSUFFICIENT_DATA

### AWS CLI

```bash
aws cloudwatch describe-alarms \
  --alarm-name-prefix icp-refinement-engine-
```

### Programmatic Access

```typescript
import { CloudWatchClient, DescribeAlarmsCommand } from '@aws-sdk/client-cloudwatch';

const client = new CloudWatchClient({ region: 'us-east-1' });
const response = await client.send(
  new DescribeAlarmsCommand({
    AlarmNamePrefix: 'icp-refinement-engine-',
  })
);

response.MetricAlarms?.forEach((alarm) => {
  console.log(`${alarm.AlarmName}: ${alarm.StateValue}`);
});
```

## Testing Alarms

### Test Analysis Failure Alarm

Trigger a failure by invoking Lambda with invalid configuration:

```bash
aws lambda invoke \
  --function-name icp-refinement-engine \
  --payload '{"source":"manual","triggerType":"test-failure"}' \
  response.json
```

Wait 2 days for alarm to trigger (or adjust evaluation periods for testing).

### Test Low Confidence Alarm

This alarm requires actual low confidence from Nova Lite. To simulate:

1. Reduce customer diversity in test data
2. Use very small sample size (but above minimum)
3. Monitor `ICPConfidenceScore` metric

### Test Insufficient Sample Alarm

Temporarily lower the threshold:

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name icp-refinement-engine-insufficient-sample \
  --threshold 1000
```

Run analysis with normal customer count to trigger alarm.

## Alarm Costs

All alarms stay within AWS Free Tier:

- **CloudWatch Alarms**: First 10 alarms free (we use 3)
- **SNS Notifications**: First 1,000 email notifications free per month
- **CloudWatch Metrics**: First 10 custom metrics free (we use 4)

Estimated monthly cost: **$0**

## Troubleshooting

### Alarm Not Triggering

- Verify metric is being published: Check CloudWatch Metrics console
- Check alarm configuration: Threshold, evaluation periods, missing data treatment
- Review alarm history: CloudWatch Console → Alarms → History tab

### False Positives

- Adjust evaluation periods to require more consecutive breaches
- Change missing data treatment from "breaching" to "notBreaching"
- Increase threshold if too sensitive

### Missing Notifications

- Verify SNS subscription is confirmed (check email)
- Check SNS topic has correct permissions
- Review SNS delivery logs in CloudWatch

## Best Practices

1. **Subscribe multiple team members** to SNS topic for redundancy
2. **Test alarms regularly** to ensure they work as expected
3. **Document response procedures** for each alarm type
4. **Review alarm history** monthly to identify patterns
5. **Adjust thresholds** based on actual system behavior

## Related Documentation

- [Manual Trigger Guide](./MANUAL_TRIGGER.md)
- [Deployment Guide](./README.md)
- [IAM Policy Reference](./iam-policy.json)

## Support

For issues with alarms:
1. Check CloudWatch Logs for Lambda execution details
2. Verify metrics are being published correctly
3. Review alarm configuration in CloudWatch Console
4. Test SNS topic delivery manually
