# Manual Trigger Guide - ICP Refinement Engine

## Overview

The ICP Refinement Engine runs automatically every 7 days via EventBridge. However, you can manually trigger analysis for testing or immediate updates.

## Prerequisites

- Lambda function deployed
- AWS CLI configured
- Valid user ID with connected services

## Quick Start

### Method 1: AWS CLI (Recommended)

Create event file `trigger-event.json`:
```json
{
  "userId": "your-user-id-here",
  "source": "manual-trigger"
}
```

Invoke Lambda:
```bash
aws lambda invoke \
  --function-name icp-refinement-engine \
  --payload file://trigger-event.json \
  --cli-binary-format raw-in-base64-out \
  response.json
```

Check response:
```bash
cat response.json
```

### Method 2: AWS Console

1. Navigate to AWS Lambda Console
2. Select `icp-refinement-engine` function
3. Click "Test" tab
4. Create new test event:
   - Event name: `ManualTrigger`
   - Event JSON:
     ```json
     {
       "userId": "your-user-id-here",
       "source": "manual-trigger"
     }
     ```
5. Click "Test" button
6. Review execution results

### Method 3: AWS SDK (Programmatic)

```typescript
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const client = new LambdaClient({ region: 'us-east-1' });

const response = await client.send(
  new InvokeCommand({
    FunctionName: 'icp-refinement-engine',
    Payload: JSON.stringify({
      userId: 'your-user-id-here',
      source: 'manual-trigger',
    }),
  })
);

console.log('Invocation response:', response);
```

## Event Payload Format

### Required Fields

- `userId` (string): User ID for credential retrieval
  - Must have connected HubSpot, Mixpanel, Stripe
  - Must have at least MIN_SAMPLE_SIZE customers

### Optional Fields

- `source` (string): Invocation source identifier
  - Default: "manual-trigger"
  - Used for logging and tracking

### Example Payloads

**Basic trigger:**
```json
{
  "userId": "user-123"
}
```

**With source tracking:**
```json
{
  "userId": "user-123",
  "source": "admin-dashboard"
}
```

## Monitoring Execution

### Real-time Logs

Watch logs as they stream:
```bash
aws logs tail /aws/lambda/icp-refinement-engine --follow
```

### Check Execution Status

Query recent invocations:
```bash
aws lambda get-function \
  --function-name icp-refinement-engine \
  --query 'Configuration.LastUpdateStatus'
```

### View Metrics

Check CloudWatch metrics:
```bash
aws cloudwatch get-metric-statistics \
  --namespace Sesari/ICPRefinement \
  --metric-name ICPAnalysisSuccess \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum
```

## Expected Execution Flow

1. **Initialization** (5-10 seconds)
   - Validate environment
   - Load configuration
   - Check for existing checkpoint

2. **Data Fetching** (30-120 seconds)
   - Fetch HubSpot companies
   - Fetch Mixpanel cohorts
   - Fetch Stripe customers

3. **Data Processing** (10-30 seconds)
   - Correlate data across platforms
   - Calculate customer scores
   - Select top 10% customers

4. **PII Masking** (1-5 seconds)
   - Strip personal information
   - Validate no PII remains

5. **Trait Analysis** (30-60 seconds)
   - Invoke Nova Lite
   - Generate reasoning
   - Calculate confidence score

6. **Knowledge Base Update** (10-20 seconds)
   - Format ICP profile
   - Update Bedrock Knowledge Base

7. **History Storage** (5-10 seconds)
   - Store analysis record in DynamoDB
   - Publish CloudWatch metrics

**Total Expected Duration:** 2-5 minutes for typical datasets

## Troubleshooting

### Error: "Missing userId in event payload"

**Cause:** Event payload doesn't include userId field

**Solution:** Add userId to event JSON:
```json
{
  "userId": "your-user-id"
}
```

### Error: "Service not connected"

**Cause:** User hasn't connected required services

**Solution:**
1. Verify user has connected HubSpot via OAuth
2. Verify user has connected Mixpanel (optional)
3. Verify user has connected Stripe (optional)
4. Check credential vault for stored credentials

### Error: "Insufficient sample size"

**Cause:** User has fewer than MIN_SAMPLE_SIZE customers

**Solution:**
- Wait for more customers to be added
- Reduce MIN_SAMPLE_SIZE environment variable (not recommended)
- Use a different user ID with more customers

### Error: "Lambda timeout"

**Cause:** Execution exceeded 15-minute timeout

**Solution:**
- Check if dataset is extremely large (>1000 companies)
- Verify API rate limits aren't causing excessive delays
- Check CloudWatch logs for bottlenecks
- Consider implementing checkpoint/resume logic

### Error: "Access denied to Knowledge Base"

**Cause:** IAM role lacks required permissions

**Solution:**
1. Verify IAM role has these permissions:
   - bedrock:InvokeModel
   - bedrock:Retrieve
   - bedrock:UpdateKnowledgeBase
2. Check Knowledge Base ID is correct
3. Ensure Lambda and Knowledge Base are in same region

## Best Practices

### When to Manually Trigger

✅ **Good reasons:**
- Testing after deployment
- Immediate ICP update needed
- Debugging issues
- Validating changes

❌ **Avoid:**
- Frequent manual triggers (use scheduled runs)
- Triggering with incomplete data
- Running multiple concurrent analyses for same user

### Rate Limiting

- Wait at least 1 hour between manual triggers
- Respect API rate limits for HubSpot, Mixpanel, Stripe
- Monitor CloudWatch metrics for performance impact

### Testing Strategy

1. **Development:** Use test user with small dataset
2. **Staging:** Use production-like data volume
3. **Production:** Rely on scheduled runs, manual only for urgent needs

## Scheduled vs Manual Invocations

| Aspect | Scheduled | Manual |
|--------|-----------|--------|
| Frequency | Every 7 days | On-demand |
| Event Source | aws.events | manual-trigger |
| Use Case | Regular updates | Testing, urgent updates |
| Logging | Automatic | Requires monitoring |

## Next Steps

After successful manual trigger:

1. ✅ Review CloudWatch logs for errors
2. ✅ Verify Knowledge Base was updated
3. ✅ Check DynamoDB for analysis record
4. ✅ Validate CloudWatch metrics published
5. ✅ Review ICP profile content for accuracy

## Support

For issues with manual triggering:
1. Check CloudWatch logs: `/aws/lambda/icp-refinement-engine`
2. Review [MANUAL_TESTING.md](./MANUAL_TESTING.md) for validation steps
3. Verify user credentials in credential vault
4. Check IAM permissions and environment variables
