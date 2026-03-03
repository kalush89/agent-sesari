# Universal Signal Translator

A Lambda function that translates platform-specific signals from Stripe, HubSpot, and Mixpanel into a unified Universal_Signal format, enabling cross-platform reasoning for the Sesari AI agent.

## Overview

The Universal Signal Translator creates a "Sesari Language" that all platform connectors translate to. This enables powerful cross-platform insights like "This Power User's payment just failed - alert immediately to prevent churn."

## Features

- **Signal Translation**: Converts platform-specific signals to Universal_Signal format
- **Entity Resolution**: Matches entities across platforms using email and other correlation keys
- **Unified Storage**: Stores signals in DynamoDB with efficient access patterns
- **Automatic TTL**: Signals expire after 90 days (configurable)

## Architecture

```
Platform Signals → DynamoDB Stream → Lambda → Universal_Signal → DynamoDB
                                      ↓
                                Entity Resolver
```

## Installation

```bash
npm install
```

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Deployment

See [infrastructure/README.md](./infrastructure/README.md) for deployment instructions.

## Signal Translation

### Stripe → Universal_Signal

- Maps revenue events (expansion, churn, failed payments)
- Normalizes MRR and revenue metrics
- Preserves subscription details

### HubSpot → Universal_Signal

- Maps relationship events (deal progression, communication gaps, sentiment)
- Normalizes deal values and engagement metrics
- Preserves deal and contact details

### Mixpanel → Universal_Signal

- Maps behavioral events (power users, feature adoption drops)
- Normalizes engagement scores and usage metrics
- Preserves feature usage details

## Entity Resolution

Entities are matched across platforms using:

1. **Email** (primary key, highest confidence)
2. **Customer/Company/User IDs** (fallback)
3. **Domain** (additional correlation)

## Universal Signal Schema

```typescript
interface Universal_Signal {
  signalId: string;
  category: 'revenue' | 'relationship' | 'behavioral';
  eventType: UniversalEventType;
  entity: {
    primaryKey: string;
    alternateKeys: string[];
    platformIds: {
      stripe?: string;
      hubspot?: string;
      mixpanel?: string;
    };
  };
  occurredAt: number;
  processedAt: number;
  source: {
    platform: 'stripe' | 'hubspot' | 'mixpanel';
    originalEventType: string;
    originalEventId: string;
  };
  impact: {
    severity: 'critical' | 'high' | 'medium' | 'low';
    metrics: NormalizedMetrics;
  };
  platformDetails: PlatformDetails;
  ttl: number;
}
```

## Environment Variables

- `AWS_REGION`: AWS region (default: us-east-1)
- `UNIVERSAL_SIGNALS_TABLE`: UniversalSignals table name
- `ENTITY_MAPPINGS_TABLE`: EntityMappings table name
- `SIGNAL_TTL_DAYS`: Signal TTL in days (default: 90)

## License

MIT
