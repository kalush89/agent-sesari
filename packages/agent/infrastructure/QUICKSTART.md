# Quick Start: Deploy ICP Refinement Engine

Get the ICP Refinement Engine running in AWS in under 10 minutes.

## Prerequisites Checklist

- [ ] AWS CLI installed and configured
- [ ] Node.js 18.x installed
- [ ] Credential Vault Lambda deployed
- [ ] Bedrock Knowledge Base created
- [ ] DynamoDB table `icp-analysis-history` created

## 5-Minute Deployment

### 1. Set Environment Variables

```bash
export AWS_REGION="us-east-1"
export KNOWLEDGE_BASE_ID="your-kb-id-here"
export CREDENTIAL_VAULT_LAMBDA_ARN="arn:aws:lambda:us-east-1:123456789012:function:credential-vault"
```

### 2. Build and Deploy

```bash
cd packages/agent
npm install
npm run deploy
```

That's it! The script will:
- Create IAM role with permissions
- Deploy Lambda function
- Configure EventBridge schedule
- Set up all necessary permissions

### 3. Verify Deployment

```bash
# Check Lambda exists
aws lambda get-function --function-name icp-refinement-engine

# Check EventBridge schedule
aws events describe-rule --name icp-refinement-schedule

# Test manual invocation
aws lambda invoke \
  --function-name icp-refinement-engine \
  --payload '{"source":"manual","triggerType":"manual","userId":"user_123"}' \
  response.json && cat response.json
```

### 4. Monitor First Run

```bash
# Watch logs in real-time
aws logs tail /aws/lambda/icp-refinement-engine --follow
```

## What Happens Next?

- EventBridge will trigger the Lambda every 7 days
- Lambda fetches data from HubSpot, Mixpanel, Stripe
- Analyzes top 10% of customers
- Updates ICP profile in Knowledge Base
- Stores analysis history in DynamoDB

## Manual Trigger (For Testing)

```bash
aws lambda invoke \
  --function-name icp-refinement-engine \
  --payload '{"source":"manual","triggerType":"manual","userId":"user_123"}' \
  response.json
```

See [MANUAL_TRIGGER.md](./MANUAL_TRIGGER.md) for more options.

## Troubleshooting

### "Deployment package not found"

Run `npm run build` first to create the Lambda package.

### "KNOWLEDGE_BASE_ID environment variable is required"

Set the environment variable before running deploy:
```bash
export KNOWLEDGE_BASE_ID="your-kb-id"
```

### "IAM role already exists"

The script will reuse the existing role. This is normal.

### Lambda times out

- Check CloudWatch logs for bottlenecks
- Verify API credentials are correct in credential vault
- Ensure minimum sample size is met (20 customers)

## Next Steps

1. **Configure Alarms**: Set up CloudWatch alarms for failures
2. **Test with Real Data**: Run manual invocation with production userId
3. **Review ICP Profile**: Check Knowledge Base for updated profile
4. **Monitor Costs**: Track Bedrock API usage in Cost Explorer

## Cost Estimate

- Lambda: Free (4 runs/month within 1M free tier)
- EventBridge: Free (within free tier)
- DynamoDB: ~$0.25/month (on-demand, minimal storage)
- Bedrock: ~$2-5/month (Nova Lite API calls)

**Total: $2-5/month**

## Support

- Full documentation: [README.md](./README.md)
- Manual trigger guide: [MANUAL_TRIGGER.md](./MANUAL_TRIGGER.md)
- CloudWatch logs: `/aws/lambda/icp-refinement-engine`
