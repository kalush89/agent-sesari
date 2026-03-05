# Daily Briefing Generator

## Overview

The Daily Briefing Generator transforms raw business signals into a proactive, narrative-driven morning summary. Instead of forcing users to check multiple dashboards, it delivers a single cohesive story that highlights what matters most and recommends specific actions.

This feature bridges the execution gap by surfacing insights from integrated platforms (Stripe, HubSpot, Mixpanel) in a format that feels like reading a well-written newspaper article rather than interpreting complex charts.

## Key Features

- **Automated Daily Generation**: Runs at 8:00 AM UTC via EventBridge
- **Signal Prioritization**: Ranks signals by severity and business impact
- **AI-Powered Narratives**: Uses Amazon Nova Lite for human-readable text
- **Explainable Insights**: Shows source signals (Thought Trace) for trust
- **Actionable Recommendations**: One-click Growth Play buttons
- **Editorial UI**: Clean, single-column layout with theme support
- **90-Day Retention**: Automatic cleanup via DynamoDB TTL
- **AWS Free Tier Compliant**: Optimized for minimal costs

## Architecture

```
EventBridge (8:00 AM UTC)
    ↓
Lambda Function
    ├── Retrieve signals (past 24 hours)
    ├── Prioritize by impact
    ├── Generate narratives (Nova Lite)
    └── Store in DynamoDB
         ↓
Next.js Frontend
    ├── Fetch briefing via API route
    ├── Display in editorial layout
    └── Enable date navigation
```

## Components

### Backend (Lambda)

- **Signal Retrieval**: Queries UniversalSignals table by time range
- **Signal Prioritizer**: Ranks signals using severity weights
- **Narrative Engine**: Transforms signals into stories with AI
- **Briefing Storage**: Compresses and stores in DynamoDB

### Frontend (Next.js)

- **Briefing Page**: Main UI with date navigation
- **Insight Cards**: Display narratives with collapsible Thought Trace
- **Theme Support**: Light/dark mode with localStorage persistence
- **Accessibility**: Full keyboard navigation and ARIA support

## Technology Stack

- **Runtime**: Node.js 20.x
- **AI Model**: Amazon Nova Lite (Bedrock)
- **Database**: DynamoDB (On-Demand)
- **Scheduler**: EventBridge
- **Frontend**: Next.js 14+ (App Router)
- **Styling**: Tailwind CSS
- **Testing**: Vitest + fast-check

## Project Structure

```
packages/lambdas/briefing-generator/
├── src/
│   ├── index.ts                 # Lambda handler
│   ├── retrieval.ts             # Signal retrieval
│   ├── prioritization.ts        # Signal prioritization
│   ├── narrative.ts             # Narrative generation
│   ├── storage.ts               # DynamoDB storage
│   └── types.ts                 # TypeScript interfaces
├── infrastructure/
│   ├── setup-dynamodb.ts        # Table creation
│   ├── deploy-lambda.ts         # Lambda deployment
│   └── setup-eventbridge.ts     # Scheduler setup
├── __tests__/
│   ├── retrieval.test.ts
│   ├── prioritization.test.ts
│   ├── narrative.test.ts
│   └── storage.test.ts
├── DEPLOYMENT.md                # Backend deployment guide
├── FRONTEND_DEPLOYMENT.md       # Frontend deployment guide
├── package.json
└── tsconfig.json

src/app/briefing/                # Frontend
├── page.tsx                     # Main briefing page
└── __tests__/
    └── page.test.tsx

src/components/briefing/
├── BriefingHeader.tsx           # Date navigation
├── InsightCard.tsx              # Insight display
├── EmptyState.tsx               # No data state
├── ErrorBanner.tsx              # Error handling
├── SkeletonLoader.tsx           # Loading state
└── __tests__/
    ├── BriefingHeader.test.tsx
    ├── InsightCard.test.tsx
    ├── EmptyState.test.tsx
    ├── ErrorBanner.test.tsx
    ├── SkeletonLoader.test.tsx
    └── accessibility.test.tsx
```

## Local Development

### Prerequisites

- Node.js 20.x
- AWS CLI configured
- Access to UniversalSignals DynamoDB table
- Bedrock access for Nova Lite model

### Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Configure environment
# Edit .env with your AWS credentials and table names

# Run tests
npm test

# Build TypeScript
npm run build
```

### Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- src/__tests__/prioritization.test.ts

# Run property-based tests
npm test -- --grep "Property"
```

### Local Invocation

```bash
# Invoke Lambda locally (requires AWS SAM CLI)
sam local invoke BriefingGenerator --event events/scheduled.json
```

## Deployment

See detailed deployment guides:
- [Backend Deployment](./DEPLOYMENT.md) - Lambda, DynamoDB, EventBridge
- [Frontend Deployment](./FRONTEND_DEPLOYMENT.md) - Next.js, Vercel

### Quick Deploy

```bash
# Backend
npm run setup:dynamodb
npm run deploy

# Frontend
cd ../../apps/web
npm run build
vercel --prod
```

## Configuration

### Environment Variables

**Backend (Lambda)**:
```bash
AWS_REGION=us-east-1
UNIVERSAL_SIGNALS_TABLE=UniversalSignals
BRIEFING_STORE_TABLE=Briefings
BEDROCK_MODEL_ID=amazon.nova-lite-v1:0
MAX_INSIGHTS=10
NARRATIVE_MAX_WORDS=150
```

**Frontend (Next.js)**:
```bash
AWS_REGION=us-east-1
BRIEFING_STORE_TABLE=Briefings
NEXT_PUBLIC_API_URL=https://your-domain.com
```

### Customization

**Change Generation Time**:
Edit EventBridge cron expression in `infrastructure/setup-eventbridge.ts`:
```typescript
// Current: 8:00 AM UTC
scheduleExpression: 'cron(0 8 * * ? *)'

// Example: 9:00 AM UTC
scheduleExpression: 'cron(0 9 * * ? *)'
```

**Adjust Insight Limit**:
```bash
MAX_INSIGHTS=15  # Default: 10
```

**Change Retention Period**:
Edit TTL calculation in `src/storage.ts`:
```typescript
// Current: 90 days
const ttl = now + (90 * 24 * 60 * 60 * 1000);

// Example: 30 days
const ttl = now + (30 * 24 * 60 * 60 * 1000);
```

## API Reference

### Lambda Handler

```typescript
export async function handler(event: ScheduledEvent): Promise<void>
```

Triggered by EventBridge, generates daily briefing.

### API Route

```
GET /api/briefing?date=YYYY-MM-DD
```

**Response**:
```json
{
  "date": "2024-01-15",
  "generatedAt": 1705305600000,
  "signalCount": 5,
  "insightCount": 3,
  "priorityLevel": "high",
  "insights": [
    {
      "id": "insight-1",
      "narrative": "Acme Corp expanded their subscription...",
      "severity": "high",
      "category": "revenue",
      "thoughtTrace": {
        "signals": [...]
      },
      "growthPlay": {
        "label": "View Customer",
        "action": "navigate",
        "target": "/customer/123"
      }
    }
  ]
}
```

## Data Models

### Insight

```typescript
interface Insight {
  id: string;
  narrative: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'revenue' | 'relationship' | 'behavioral';
  thoughtTrace: ThoughtTrace;
  growthPlay: GrowthPlay;
}
```

### Briefing

```typescript
interface Briefing {
  date: string;
  generatedAt: number;
  signalCount: number;
  insightCount: number;
  priorityLevel: 'critical' | 'high' | 'normal';
  insights: Insight[];
}
```

## Testing Strategy

### Unit Tests

Test individual functions with specific examples:
- Signal retrieval with various time ranges
- Prioritization with different severity levels
- Narrative generation with mock Bedrock responses
- Storage with compression and TTL

### Property-Based Tests

Test universal properties with randomized inputs:
- Signal retrieval time window correctness
- Prioritization ordering consistency
- Narrative word limit compliance
- Compression round-trip integrity

### Integration Tests

Test complete flow:
- End-to-end briefing generation
- Error handling and fallbacks
- Retry logic for transient failures

### Accessibility Tests

Test UI compliance:
- Keyboard navigation
- ARIA labels and roles
- Screen reader announcements
- Color contrast ratios

## Performance

### Lambda Metrics

- **Cold Start**: ~500ms
- **Warm Execution**: ~2-5 seconds
- **Memory Usage**: ~200MB (512MB allocated)
- **Cost per Invocation**: ~$0.0001 (Free Tier: 1M requests/month)

### Optimization Tips

1. Keep Lambda warm with CloudWatch Events (optional)
2. Use DynamoDB batch operations for multiple signals
3. Implement parallel narrative generation (if needed)
4. Cache Bedrock responses for similar signals

## Monitoring

### CloudWatch Metrics

- `Invocations`: Daily briefing generation count
- `Errors`: Failed generations
- `Duration`: Execution time
- `ThrottledRequests`: Rate limit hits

### Custom Metrics

```typescript
// Log execution metrics
console.log(JSON.stringify({
  metric: 'briefing_generated',
  duration: Date.now() - startTime,
  signalCount: signals.length,
  insightCount: insights.length,
  priorityLevel: briefing.priorityLevel
}));
```

### Alarms

Set up CloudWatch alarms for:
- Lambda errors > 5% of invocations
- Lambda duration > 25 seconds
- DynamoDB throttling events
- Bedrock API errors

## Troubleshooting

### Common Issues

**No briefing generated**:
- Check EventBridge rule is enabled
- Verify Lambda has permissions
- Check CloudWatch logs for errors

**Empty briefing**:
- Verify UniversalSignals table has data
- Check time range query (past 24 hours)
- Verify CategoryIndex exists

**Narrative generation fails**:
- Check Bedrock permissions
- Verify Nova Lite model access
- Review fallback template logic

**Frontend shows 404**:
- Verify briefing exists in DynamoDB
- Check API route configuration
- Verify AWS credentials in Next.js

## Contributing

### Code Style

- Use TypeScript strict mode
- Follow ESLint configuration
- Write JSDoc comments for all functions
- Keep functions under 20 lines
- Use early returns for error handling

### Testing Requirements

- Unit tests for all functions
- Property tests for core logic
- Integration tests for complete flows
- Accessibility tests for UI components
- Minimum 80% code coverage

### Pull Request Process

1. Create feature branch
2. Write tests first (TDD)
3. Implement feature
4. Run full test suite
5. Update documentation
6. Submit PR with description

## License

Proprietary - Sesari

## Support

For issues or questions:
- Check [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment issues
- Check [FRONTEND_DEPLOYMENT.md](./FRONTEND_DEPLOYMENT.md) for UI issues
- Review CloudWatch logs for runtime errors
- Contact the Sesari team for assistance
