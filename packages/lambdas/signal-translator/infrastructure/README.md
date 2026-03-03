# Universal Signal Translator - Infrastructure Setup

This directory contains infrastructure setup scripts for the Universal Signal Translator Lambda function.

## Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js 20.x or later
- IAM role for Lambda execution with DynamoDB permissions

## Setup Steps

### 1. Create DynamoDB Tables

```bash
npm run setup:dynamodb
```

This creates:
- `UniversalSignals` table with GSIs for querying by type and category
- `EntityMappings` table with GSI for platform ID lookups

### 2. Deploy Lambda Function

```bash
export LAMBDA_ROLE_ARN=arn:aws:iam::ACCOUNT_ID:role/signal-translator-role
export STRIPE_STREAM_ARN=arn:aws:dynamodb:REGION:ACCOUNT_ID:table/stripe-revenue-signals/stream/...
export HUBSPOT_STREAM_ARN=arn:aws:dynamodb:REGION:ACCOUNT_ID:table/hubspot-relationship-signals/stream/...
export MIXPANEL_STREAM_ARN=arn:aws:dynamodb:REGION:ACCOUNT_ID:table/mixpanel-behavioral-signals/stream/...

npm run deploy:lambda
```

## Environment Variables

### Lambda Function

- `AWS_REGION`: AWS region (default: us-east-1)
- `UNIVERSAL_SIGNALS_TABLE`: UniversalSignals table name (default: UniversalSignals)
- `ENTITY_MAPPINGS_TABLE`: EntityMappings table name (default: EntityMappings)
- `SIGNAL_TTL_DAYS`: Signal TTL in days (default: 90)

### Deployment Script

- `LAMBDA_ROLE_ARN`: IAM role ARN for Lambda execution (required)
- `STRIPE_STREAM_ARN`: DynamoDB Stream ARN for Stripe signals (optional)
- `HUBSPOT_STREAM_ARN`: DynamoDB Stream ARN for HubSpot signals (optional)
- `MIXPANEL_STREAM_ARN`: DynamoDB Stream ARN for Mixpanel signals (optional)

## DynamoDB Stream Configuration

The Lambda function processes DynamoDB Stream events from connector tables:

- **Stripe**: `stripe-revenue-signals` table
- **HubSpot**: `hubspot-relationship-signals` table
- **Mixpanel**: `mixpanel-behavioral-signals` table

Enable DynamoDB Streams on these tables with `NEW_IMAGE` view type.

## IAM Permissions

The Lambda execution role requires:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:Query",
        "dynamodb:UpdateItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/UniversalSignals",
        "arn:aws:dynamodb:*:*:table/UniversalSignals/index/*",
        "arn:aws:dynamodb:*:*:table/EntityMappings",
        "arn:aws:dynamodb:*:*:table/EntityMappings/index/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetRecords",
        "dynamodb:GetShardIterator",
        "dynamodb:DescribeStream",
        "dynamodb:ListStreams"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/stripe-revenue-signals/stream/*",
        "arn:aws:dynamodb:*:*:table/hubspot-relationship-signals/stream/*",
        "arn:aws:dynamodb:*:*:table/mixpanel-behavioral-signals/stream/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```

## Monitoring

CloudWatch Logs are automatically created at:
- `/aws/lambda/signal-translator`

Monitor for:
- Translation success/failure metrics
- Invalid signal warnings
- Entity resolution issues

## Troubleshooting

### Lambda not triggering

1. Verify DynamoDB Streams are enabled on connector tables
2. Check Lambda has permissions to read from streams
3. Verify event source mappings are active

### Translation failures

1. Check CloudWatch Logs for error details
2. Verify signal format matches expected schema
3. Ensure entity resolution is working correctly

### High costs

1. Review DynamoDB on-demand pricing
2. Consider adjusting signal TTL to reduce storage
3. Monitor Lambda invocation count
