# Mixpanel Connector

Serverless Mixpanel webhook monitoring system that detects critical behavioral signals (feature adoption drops, power user patterns) for B2B SaaS businesses.

## Architecture

- **Webhook Lambda**: Processes Mixpanel webhook events and stores usage data
- **Baseline Calculator Lambda**: Runs daily to calculate usage baselines and detect behavioral signals
- **DynamoDB Tables**: Stores behavioral signals and usage baselines

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Build the project:
```bash
npm run build
```

4. Run tests:
```bash
npm test
```

## Deployment

Deploy all infrastructure:
```bash
npm run deploy
```

Deploy individual components:
```bash
npm run deploy:webhook
npm run deploy:baseline-calculator
```

## Environment Variables

See `.env.example` for required configuration.

## Testing

- Unit tests: `npm test`
- Watch mode: `npm test:watch`
- Coverage: Tests include both unit tests and property-based tests using fast-check

## Project Structure

```
src/
  types.ts                    # Core type definitions
  event-store.ts              # DynamoDB access layer
  webhook-security.ts         # Signature verification
  signal-extractor.ts         # Behavioral signal extraction
  logger.ts                   # Structured logging
  metrics.ts                  # CloudWatch metrics
  index.ts                    # Webhook Lambda handler
  baseline-calculator.ts      # Baseline calculator Lambda handler
  __tests__/                  # Test files

infrastructure/
  setup-dynamodb.ts           # DynamoDB table creation
  deploy-webhook-lambda.ts    # Webhook Lambda deployment
  deploy-baseline-calculator-lambda.ts  # Baseline calculator deployment
  setup-api-gateway.ts        # API Gateway configuration
  setup-eventbridge.ts        # EventBridge schedule setup
  README.md                   # Deployment documentation
```
