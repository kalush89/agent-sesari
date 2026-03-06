# Growth Plays Lambda Package

Automated growth plays system for proactive customer churn prevention. This package implements the core backend logic for detecting at-risk customers, generating actionable communications, and executing approved growth plays.

## Overview

The Growth Plays system correlates signals across multiple platforms (Mixpanel, HubSpot, Stripe) to identify customers at risk of churning. When risk patterns are detected, the system autonomously drafts personalized communications and presents them to users for one-click approval and execution.

## Architecture

The system consists of several Lambda functions:

- **Signal Orchestrator**: Coordinates parallel signal collection from all connectors
- **Signal Correlator**: Analyzes customer data and calculates risk scores
- **Draft Generator**: Creates personalized email/Slack drafts using Amazon Bedrock
- **Execution Engine**: Sends approved communications via AWS SES or Slack API

## Key Features

- Cross-platform signal correlation
- Proactive risk detection with explainable AI
- Automated draft generation using Bedrock Nova Lite
- Human-in-the-loop approval workflow
- Complete audit trail for compliance
- AWS Free Tier compliant architecture

## Installation

```bash
npm install
```

## Development

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Build TypeScript
npm run build
```

## Testing

The package uses a dual testing approach:

- **Unit Tests (Vitest)**: Specific examples and edge cases
- **Property-Based Tests (fast-check)**: Universal properties across all inputs

All tests follow the correctness properties defined in the design document.

## Deployment

```bash
# Deploy DynamoDB tables
npm run deploy:dynamodb

# Deploy Lambda functions
npm run deploy:lambda

# Deploy EventBridge scheduler
npm run deploy:eventbridge
```

## Environment Variables

Required environment variables for Lambda functions:

- `AWS_REGION`: AWS region for all services
- `GROWTH_PLAYS_TABLE`: DynamoDB table name for Growth Plays
- `RISK_PROFILES_TABLE`: DynamoDB table name for Risk Profiles
- `SIGNAL_CACHE_TABLE`: DynamoDB table name for Signal Cache
- `BEDROCK_MODEL_ID`: Bedrock model ID (default: amazon.nova-lite-v1:0)

## Type Definitions

All TypeScript interfaces are defined in `src/types.ts` and exported for use across the system.

## License

MIT
