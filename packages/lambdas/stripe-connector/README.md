# Stripe Connector - Revenue Senses

Serverless Stripe webhook monitoring system that detects critical revenue signals (expansion, churn, failed payments) for B2B SaaS businesses.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your Stripe webhook secret and AWS configuration
```

3. Build the project:
```bash
npm run build
```

## Testing

Run tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

## Deployment

Deploy to AWS Lambda:
```bash
npm run deploy
```

## Architecture

- **Lambda Handler**: Processes Stripe webhook events
- **DynamoDB**: Stores revenue signal events
- **CloudWatch**: Logs and metrics for observability

## Environment Variables

- `STRIPE_WEBHOOK_SECRET`: Webhook signing secret from Stripe
- `AWS_REGION`: AWS region for DynamoDB
- `DYNAMODB_TABLE_NAME`: Name of the DynamoDB table
- `LOG_LEVEL`: Logging verbosity (info, warn, error)
