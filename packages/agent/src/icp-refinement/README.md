# Dynamic ICP Refinement Engine

Autonomous system that analyzes customer data from HubSpot, Mixpanel, and Stripe to identify high-value customer traits and automatically update Sesari's Ideal Customer Profile.

## Structure

```
/icp-refinement
  /types.ts           - Core TypeScript interfaces and data models
  /config.ts          - Configuration and environment validation
  /clients.ts         - AWS SDK client initialization
  /index.ts           - Module exports
  /__tests__          - Unit and property-based tests
```

## Core Types

- `HubSpotCompany` - Company data with LTV and firmographics
- `MixpanelCohort` - Engagement and retention metrics
- `StripeCustomer` - Subscription and churn signals
- `CorrelatedCustomer` - Unified customer profile across platforms
- `ScoredCustomer` - Customer with Ideal Customer Score (0-100)
- `MaskedCustomer` - Privacy-masked data for LLM analysis
- `ICPProfile` - Versioned ICP with traits and reasoning
- `ICPAnalysisRecord` - Complete analysis history record

## Configuration

Required environment variables:
- `AWS_REGION` - AWS region for all services
- `KNOWLEDGE_BASE_ID` - Bedrock Knowledge Base ID
- `NOVA_MODEL_ID` - Amazon Nova Lite model ID
- `HUBSPOT_API_KEY` - HubSpot API key
- `MIXPANEL_API_KEY` - Mixpanel API key
- `STRIPE_API_KEY` - Stripe API key
- `ANALYSIS_TABLE_NAME` - DynamoDB table for analysis history

## AWS Clients

Pre-configured clients for:
- Bedrock Runtime (Nova Lite invocation)
- Bedrock Agent Runtime (Knowledge Base operations)
- DynamoDB (analysis history storage)
- EventBridge (scheduling)

## Testing

Uses dual testing approach:
- Unit tests for specific examples and edge cases
- Property-based tests (fast-check) for universal correctness properties

Run tests:
```bash
npm test
```
