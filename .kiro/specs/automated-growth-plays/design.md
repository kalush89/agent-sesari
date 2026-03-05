# Design Document: Automated Growth Plays

## Overview

The Automated Growth Plays feature is an event-driven, serverless system that proactively detects at-risk customers by correlating signals across Mixpanel, HubSpot, and Stripe. When risk patterns emerge, the system autonomously drafts personalized communications and presents them to users for one-click approval and execution.

This design prioritizes AWS Free Tier compliance, explainability, and human-in-the-loop control while maintaining the "Agentic Editorial" aesthetic that defines Sesari's user experience.

### Key Design Goals

1. **Proactive Intelligence**: Detect churn risk before it materializes through cross-platform signal correlation
2. **Autonomous Action**: Generate context-aware communication drafts without human intervention
3. **Explainable AI**: Provide full transparency into risk calculations and decision-making
4. **Cost Efficiency**: Operate entirely within AWS Free Tier limits
5. **Human Control**: Maintain user approval for all customer communications
6. **Reliability**: Ensure data integrity through round-trip parsing and comprehensive error handling

## Architecture

### System Architecture

The system follows an event-driven, serverless architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────────┐
│                        EventBridge Scheduler                     │
│                    (Daily at 6 AM UTC trigger)                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Signal Orchestrator Lambda                     │
│              (Coordinates signal collection)                     │
└─────┬──────────────┬──────────────┬────────────────────────┬────┘
      │              │              │                        │
      ▼              ▼              ▼                        ▼
┌──────────┐  ┌──────────┐  ┌──────────┐           ┌──────────────┐
│ Mixpanel │  │ HubSpot  │  │  Stripe  │           │ DynamoDB     │
│Connector │  │Connector │  │Connector │           │ (Cache)      │
│ Lambda   │  │ Lambda   │  │ Lambda   │           └──────────────┘
└────┬─────┘  └────┬─────┘  └────┬─────┘
     │             │             │
     └─────────────┴─────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Signal Correlator Lambda                       │
│         (Combines signals, calculates risk scores)               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Draft Generator Lambda                         │
│            (Bedrock Nova Lite integration)                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                        DynamoDB                                  │
│              (Growth Plays, Audit Trail)                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js Dashboard                             │
│              (Approval Workflow UI)                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Execution Engine Lambda                        │
│              (AWS SES, Slack API)                                │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

**Signal Orchestrator Lambda**
- Triggered by EventBridge on a daily schedule
- Invokes all Signal Connectors in parallel
- Aggregates responses and passes to Signal Correlator
- Implements 1-hour caching to reduce redundant API calls

**Signal Correlator Lambda**
- Receives unified customer data from Signal Orchestrator
- Calculates risk scores (0-100) based on signal patterns
- Identifies high-risk customers (score > 70)
- Stores risk profiles and intermediate calculations in DynamoDB

**Draft Generator Lambda**
- Receives high-risk customer profiles from Signal Correlator
- Generates personalized email or Slack drafts using Bedrock Nova Lite
- Creates "Thought Trace" explaining signal contributions
- Stores Growth Plays in DynamoDB with "pending" status

**Execution Engine Lambda**
- Triggered by user approval actions from Next.js dashboard
- Sends communications via AWS SES (email) or Slack API
- Implements retry logic with exponential backoff
- Updates Growth Play status and audit trail

**Next.js Dashboard**
- Displays pending Growth Plays in "Briefing Feed" format
- Provides "Approve & Send" and "Dismiss" actions
- Shows collapsible "Thought Trace" for explainability
- Allows draft editing before approval

## Components and Interfaces

### Signal Orchestrator

**Purpose**: Coordinate parallel signal collection and implement caching strategy

**Interface**:
```typescript
interface SignalOrchestratorInput {
  forceRefresh?: boolean; // Override cache
}

interface SignalOrchestratorOutput {
  customers: UnifiedCustomerProfile[];
  cacheHit: boolean;
  timestamp: string;
}

interface UnifiedCustomerProfile {
  customerId: string;
  email: string;
  companyName: string;
  mixpanelData: MixpanelSignals;
  hubspotData: HubSpotSignals;
  stripeData: StripeSignals;
}
```

**Key Functions**:
- `orchestrateSignalCollection()`: Main handler
- `checkCache()`: Retrieve cached profiles if < 1 hour old
- `invokeConnectorsInParallel()`: Batch invoke all Signal Connectors
- `mergeSignalsByCustomerId()`: Combine responses into unified profiles
- `cacheProfiles()`: Store profiles in DynamoDB with TTL

### Signal Correlator

**Purpose**: Analyze unified customer profiles and calculate risk scores

**Interface**:
```typescript
interface SignalCorrelatorInput {
  customers: UnifiedCustomerProfile[];
}

interface SignalCorrelatorOutput {
  highRiskCustomers: RiskProfile[];
  totalAnalyzed: number;
}

interface RiskProfile {
  customerId: string;
  riskScore: number; // 0-100
  riskFactors: RiskFactor[];
  detectedAt: string;
}

interface RiskFactor {
  type: 'usage_decline' | 'renewal_approaching' | 'support_tickets' | 'payment_issues';
  severity: number; // 0-100
  signalValues: Record<string, any>; // Raw signal data for audit
  weight: number; // Contribution to overall risk score
}
```

**Key Functions**:
- `calculateRiskScore()`: Main risk calculation algorithm
- `detectUsageDecline()`: Analyze Mixpanel usage trends
- `checkRenewalProximity()`: Identify upcoming renewals from Stripe
- `aggregateRiskFactors()`: Combine factors into overall score
- `storeRiskProfile()`: Persist to DynamoDB with audit data

**Risk Calculation Algorithm**:
```typescript
// Weighted risk score calculation
riskScore = (
  usageDeclineSeverity * 0.4 +
  renewalProximitySeverity * 0.3 +
  supportTicketSeverity * 0.2 +
  paymentIssueSeverity * 0.1
)

// Usage decline severity
if (usageDecline > 50%) severity = 100
else if (usageDecline > 30%) severity = 70
else if (usageDecline > 10%) severity = 40
else severity = 0

// Renewal proximity severity
if (daysUntilRenewal <= 7) severity = 100
else if (daysUntilRenewal <= 14) severity = 80
else if (daysUntilRenewal <= 30) severity = 50
else severity = 0
```

### Draft Generator

**Purpose**: Generate personalized communication drafts using Amazon Bedrock

**Interface**:
```typescript
interface DraftGeneratorInput {
  riskProfile: RiskProfile;
  customerProfile: UnifiedCustomerProfile;
  communicationType: 'email' | 'slack';
}

interface DraftGeneratorOutput {
  growthPlay: GrowthPlay;
}

interface GrowthPlay {
  id: string;
  customerId: string;
  customerName: string;
  companyName: string;
  riskScore: number;
  communicationType: 'email' | 'slack';
  subject?: string; // For email only
  draftContent: string;
  thoughtTrace: ThoughtTrace;
  status: 'pending' | 'approved' | 'dismissed' | 'executed' | 'failed';
  createdAt: string;
  updatedAt: string;
  auditTrail: AuditEntry[];
}

interface ThoughtTrace {
  riskFactors: RiskFactor[];
  reasoning: string; // Natural language explanation
  signalSources: string[]; // e.g., ["Mixpanel", "Stripe"]
}

interface AuditEntry {
  action: 'created' | 'approved' | 'dismissed' | 'edited' | 'executed' | 'failed';
  timestamp: string;
  userId?: string;
  metadata?: Record<string, any>;
}
```

**Key Functions**:
- `generateDraft()`: Main handler
- `buildBedrockPrompt()`: Construct prompt with customer context
- `invokeBedrockNovaLite()`: Call Bedrock API
- `formatDraft()`: Apply word limits and formatting
- `createThoughtTrace()`: Generate explainability section
- `storeGrowthPlay()`: Persist to DynamoDB

**Bedrock Prompt Template**:
```
You are a B2B SaaS customer success expert. Generate a professional, empathetic communication for an at-risk customer.

Customer Context:
- Name: {customerName}
- Company: {companyName}
- Risk Score: {riskScore}/100

Risk Signals:
{riskFactors}

Task: Write a {communicationType} that:
1. Acknowledges their current usage pattern
2. Offers specific help or resources
3. Includes a clear call-to-action
4. Maintains a supportive, non-pushy tone

Constraints:
- Email: Maximum 200 words
- Slack: Maximum 100 words
- Use professional B2B language
- Focus on value, not sales

Output format: Plain text only, no markdown.
```

### Growth Play Parser and Serializer

**Purpose**: Ensure reliable data integrity for Growth Play storage and retrieval

**Interface**:
```typescript
interface GrowthPlayParser {
  parse(json: string): Result<GrowthPlay, ParseError>;
}

interface GrowthPlaySerializer {
  serialize(growthPlay: GrowthPlay): string;
}

interface GrowthPlayPrettyPrinter {
  prettyPrint(growthPlay: GrowthPlay): string;
}

type Result<T, E> = 
  | { success: true; value: T }
  | { success: false; error: E };

interface ParseError {
  field: string;
  message: string;
  receivedValue: any;
}
```

**Key Functions**:
- `parseGrowthPlay()`: Validate and parse JSON to typed object
- `serializeGrowthPlay()`: Convert object to JSON string
- `prettyPrintGrowthPlay()`: Format with indentation for debugging
- `validateGrowthPlaySchema()`: Check required fields and types

**Validation Rules**:
- `id`: Required, non-empty string
- `customerId`: Required, non-empty string
- `riskScore`: Required, number between 0-100
- `communicationType`: Required, must be 'email' or 'slack'
- `draftContent`: Required, non-empty string
- `status`: Required, valid status enum value
- `createdAt`: Required, valid ISO 8601 timestamp
- `auditTrail`: Required, array (can be empty)

### Execution Engine

**Purpose**: Send approved communications and handle delivery failures

**Interface**:
```typescript
interface ExecutionEngineInput {
  growthPlayId: string;
  userId: string;
  editedContent?: string; // If user modified draft
}

interface ExecutionEngineOutput {
  success: boolean;
  deliveryStatus: 'sent' | 'failed';
  messageId?: string; // From SES or Slack
  error?: string;
  retryCount: number;
}
```

**Key Functions**:
- `executeGrowthPlay()`: Main handler
- `sendEmail()`: AWS SES integration
- `sendSlackMessage()`: Slack API integration
- `retryWithBackoff()`: Exponential backoff retry logic
- `updateAuditTrail()`: Record execution status

**Retry Strategy**:
```typescript
// Exponential backoff: 1s, 2s, 4s
const delays = [1000, 2000, 4000];
for (let i = 0; i < 3; i++) {
  try {
    await sendCommunication();
    return { success: true };
  } catch (error) {
    if (i < 2) await sleep(delays[i]);
  }
}
return { success: false, error: 'Max retries exceeded' };
```

### Dashboard API Routes

**Purpose**: Provide REST API for Growth Play management

**Endpoints**:

```typescript
// GET /api/growth-plays
// Returns all pending Growth Plays
interface GetGrowthPlaysResponse {
  growthPlays: GrowthPlay[];
  total: number;
}

// POST /api/growth-plays/:id/approve
// Approve and execute a Growth Play
interface ApproveGrowthPlayRequest {
  userId: string;
  editedContent?: string;
}

interface ApproveGrowthPlayResponse {
  success: boolean;
  executionStatus: ExecutionEngineOutput;
}

// POST /api/growth-plays/:id/dismiss
// Dismiss a Growth Play
interface DismissGrowthPlayRequest {
  userId: string;
  reason?: string;
}

interface DismissGrowthPlayResponse {
  success: boolean;
}

// GET /api/growth-plays/:id/audit
// Retrieve full audit trail
interface GetAuditTrailResponse {
  growthPlay: GrowthPlay;
  auditTrail: AuditEntry[];
}
```

## Data Models

### DynamoDB Tables

**Table: GrowthPlays**
- **Partition Key**: `id` (String) - UUID
- **Sort Key**: None
- **GSI 1**: `customerId-createdAt-index`
  - Partition Key: `customerId`
  - Sort Key: `createdAt`
- **GSI 2**: `status-createdAt-index`
  - Partition Key: `status`
  - Sort Key: `createdAt`
- **Attributes**:
  - `id`: String (UUID)
  - `customerId`: String
  - `customerName`: String
  - `companyName`: String
  - `riskScore`: Number
  - `communicationType`: String ('email' | 'slack')
  - `subject`: String (optional, email only)
  - `draftContent`: String
  - `editedContent`: String (optional)
  - `thoughtTrace`: Map
  - `status`: String
  - `createdAt`: String (ISO 8601)
  - `updatedAt`: String (ISO 8601)
  - `auditTrail`: List
  - `executionMetadata`: Map (optional)

**Table: CustomerRiskProfiles**
- **Partition Key**: `customerId` (String)
- **Sort Key**: `detectedAt` (String) - ISO 8601 timestamp
- **TTL Attribute**: `expiresAt` (Number) - Unix timestamp (90 days retention)
- **Attributes**:
  - `customerId`: String
  - `riskScore`: Number
  - `riskFactors`: List
  - `signalValues`: Map (raw data for audit)
  - `detectedAt`: String (ISO 8601)
  - `expiresAt`: Number (Unix timestamp)

**Table: SignalCache**
- **Partition Key**: `cacheKey` (String) - "unified-profiles"
- **TTL Attribute**: `expiresAt` (Number) - Unix timestamp (1 hour)
- **Attributes**:
  - `cacheKey`: String
  - `profiles`: List
  - `cachedAt`: String (ISO 8601)
  - `expiresAt`: Number (Unix timestamp)

### Data Flow

1. **Signal Collection**: EventBridge → Signal Orchestrator → Signal Connectors → DynamoDB (SignalCache)
2. **Risk Detection**: Signal Orchestrator → Signal Correlator → DynamoDB (CustomerRiskProfiles)
3. **Draft Generation**: Signal Correlator → Draft Generator → Bedrock Nova Lite → DynamoDB (GrowthPlays)
4. **User Approval**: Next.js Dashboard → API Route → DynamoDB (GrowthPlays update)
5. **Execution**: API Route → Execution Engine → AWS SES/Slack API → DynamoDB (GrowthPlays audit trail)


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, I identified several areas of redundancy:

1. **Signal storage properties (1.6, 2.4, 8.1)**: These all verify that signal data is persisted. Combined into Property 1.
2. **Risk score bounds (1.5) and calculation (1.2, 1.3, 1.4)**: Risk calculation logic is comprehensive, bounds checking is an invariant. Kept separate.
3. **Draft content requirements (3.2, 3.5)**: Both verify completeness of draft metadata. Combined into Property 8.
4. **State transition properties (5.2, 5.3, 6.1, 6.4)**: Multiple properties about status changes. Each represents distinct transitions, kept separate.
5. **Execution routing (6.2, 6.3)**: Both test communication type routing. Combined into Property 15.
6. **Audit trail properties (8.2, 8.3)**: Both verify audit data completeness. Combined into Property 19.

### Property 1: Signal Data Persistence

*For any* risk calculation performed by the Signal Correlator, all intermediate signal values (usage data, renewal dates, support tickets, payment status) and the final risk score must be stored in DynamoDB with the risk profile.

**Validates: Requirements 1.6, 2.4, 8.1**

### Property 2: Unified Profile Completeness

*For any* set of signal data retrieved from Mixpanel, HubSpot, and Stripe connectors, the Signal Correlator must produce a unified customer profile containing all fields from each source (behavioral data, relationship data, and revenue data).

**Validates: Requirements 1.1**

### Property 3: Usage Decline Detection

*For any* customer with usage data, if the usage decline over the last 30 days exceeds 50%, the Signal Correlator must identify that customer in the usage decline risk factor list.

**Validates: Requirements 1.2**

### Property 4: Renewal Proximity Detection

*For any* customer with a contract renewal date, if the renewal is within 30 days from the current date, the Signal Correlator must identify that customer in the renewal proximity risk factor list.

**Validates: Requirements 1.3**

### Property 5: High-Risk Flagging Logic

*For any* customer profile, if the customer has both usage decline >50% AND renewal within 30 days, the Signal Correlator must flag that customer as high-risk (risk score > 70).

**Validates: Requirements 1.4**

### Property 6: Risk Score Bounds Invariant

*For any* customer profile processed by the Signal Correlator, the calculated risk score must be a number between 0 and 100 (inclusive).

**Validates: Requirements 1.5**

### Property 7: High-Risk Growth Play Creation

*For any* customer with a risk score above 70, the system must create a Growth Play with status "pending" and store it in DynamoDB.

**Validates: Requirements 2.1**

### Property 8: Growth Play Deduplication

*For any* customer with multiple detected risk patterns in a single analysis cycle, the system must create exactly one Growth Play containing the risk pattern with the highest severity score.

**Validates: Requirements 2.3**

### Property 9: Risk Score Resolution

*For any* customer with pending Growth Plays, if the customer's risk score drops below 50, all pending Growth Plays for that customer must be updated to status "resolved".

**Validates: Requirements 2.5**

### Property 10: Draft Content Completeness

*For any* Growth Play created by the Draft Generator, the draft content must include the customer name, at least one specific risk signal, and a call-to-action phrase.

**Validates: Requirements 3.2, 3.5**

### Property 11: Communication Format Support

*For any* high-risk customer profile, the Draft Generator must successfully generate drafts in both email format (with subject line) and Slack format (without subject line).

**Validates: Requirements 3.3**

### Property 12: Draft Word Limit Constraints

*For any* generated draft, if the communication type is email, the word count must not exceed 200 words; if the communication type is Slack, the word count must not exceed 100 words.

**Validates: Requirements 3.6**

### Property 13: Growth Play Serialization Round-Trip

*For any* valid Growth Play object, serializing to JSON then parsing back to an object must produce an equivalent Growth Play with all fields preserved.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4**

### Property 14: Parse Error Descriptiveness

*For any* invalid Growth Play JSON (missing required field, wrong type, invalid enum value), the parser must return an error message that identifies the specific field name and the validation failure reason.

**Validates: Requirements 4.5**

### Property 15: Approval State Transition

*For any* Growth Play with status "pending", when approved by a user, the status must transition to "approved" and an audit entry with action "approved" and timestamp must be added to the audit trail.

**Validates: Requirements 5.2**

### Property 16: Dismissal State Transition

*For any* Growth Play with status "pending", when dismissed by a user, the status must transition to "dismissed" and the Growth Play must not appear in queries filtered by status "pending".

**Validates: Requirements 5.3**

### Property 17: Draft Edit Preservation

*For any* Growth Play, when a user edits the draft content before approval, both the original draft content and the edited content must be stored separately, with the edited content in the `editedContent` field.

**Validates: Requirements 5.4, 5.5**

### Property 18: Execution Routing by Communication Type

*For any* approved Growth Play, if the communication type is "email", the Execution Engine must invoke AWS SES; if the communication type is "slack", the Execution Engine must invoke the Slack API.

**Validates: Requirements 6.2, 6.3**

### Property 19: Successful Execution State Update

*For any* Growth Play where communication is sent successfully, the status must be updated to "executed", a timestamp must be recorded, and an audit entry with action "executed" must be added.

**Validates: Requirements 6.4**

### Property 20: Retry Logic on Failure

*For any* Growth Play execution that fails, the Execution Engine must retry up to 3 times with exponential backoff delays (1s, 2s, 4s) before marking the Growth Play as "failed".

**Validates: Requirements 6.5, 6.6**

### Property 21: Signal Connector Batching

*For any* signal collection cycle triggered by the Signal Orchestrator, all Signal Connectors (Mixpanel, HubSpot, Stripe) must be invoked in parallel within a single orchestration execution, not sequentially.

**Validates: Requirements 7.4**

### Property 22: Cache Hit Within TTL

*For any* two signal collection requests made within 1 hour, the second request must return cached customer profiles from DynamoDB without invoking Signal Connectors, and the response must indicate `cacheHit: true`.

**Validates: Requirements 7.5**

### Property 23: Audit Trail Completeness

*For any* Growth Play, the audit trail must contain entries for all state transitions (created, approved/dismissed, edited if applicable, executed/failed) with timestamps, and the Thought Trace must list all risk factors with their weights.

**Validates: Requirements 8.2, 8.3**

### Property 24: Success Rate Calculation

*For any* set of executed Growth Plays with known customer retention outcomes, the calculated success rate must equal the count of retained customers divided by the total count of executed Growth Plays, expressed as a percentage.

**Validates: Requirements 8.4**


## Error Handling

### Error Categories

The system handles four categories of errors with distinct strategies:

**1. External Service Failures**
- AWS SES rate limits or delivery failures
- Slack API timeouts or authentication errors
- Signal Connector API failures (Mixpanel, HubSpot, Stripe)

**Strategy**: Exponential backoff retry with circuit breaker pattern. After 3 failed attempts, mark as failed and notify user.

**2. Data Validation Errors**
- Invalid Growth Play JSON structure
- Missing required fields in customer profiles
- Risk score out of bounds

**Strategy**: Early return with descriptive error messages. Log validation failures for debugging. Never persist invalid data.

**3. Bedrock API Errors**
- Token limit exceeded
- Model throttling
- Malformed prompts

**Strategy**: Retry once with reduced prompt size. If still failing, create Growth Play with placeholder draft and flag for manual review.

**4. DynamoDB Errors**
- Provisioned throughput exceeded (should not occur with on-demand)
- Item size exceeds 400KB limit
- Network timeouts

**Strategy**: Use AWS SDK built-in retry logic. Log errors with context. For critical writes (audit trail), implement idempotent operations with unique request IDs.

### Error Handling Patterns

**Lambda Handler Pattern**:
```typescript
export async function handler(event: any): Promise<APIGatewayProxyResult> {
  try {
    // Validate environment variables at startup
    validateEnvironment();
    
    // Validate input
    const input = validateInput(event);
    if (!input.success) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: input.error })
      };
    }
    
    // Execute business logic
    const result = await executeBusinessLogic(input.value);
    
    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('Lambda execution failed:', {
      error: error.message,
      stack: error.stack,
      event
    });
    
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Internal server error',
        requestId: event.requestContext?.requestId 
      })
    };
  }
}
```

**AWS SDK Call Pattern**:
```typescript
async function invokeLambda(functionName: string, payload: any): Promise<any> {
  const client = new LambdaClient({ 
    region: process.env.AWS_REGION,
    maxAttempts: 3 // Built-in retry
  });
  
  try {
    const response = await client.send(new InvokeCommand({
      FunctionName: functionName,
      Payload: JSON.stringify(payload),
      InvocationType: 'RequestResponse'
    }));
    
    if (response.FunctionError) {
      throw new Error(`Lambda error: ${response.FunctionError}`);
    }
    
    return JSON.parse(new TextDecoder().decode(response.Payload));
  } catch (error) {
    console.error('Lambda invocation failed:', {
      functionName,
      error: error.message
    });
    throw new Error(`Failed to invoke ${functionName}: ${error.message}`);
  }
}
```

**Bedrock API Call Pattern**:
```typescript
async function generateDraft(prompt: string): Promise<string> {
  const client = new BedrockRuntimeClient({ 
    region: process.env.AWS_REGION 
  });
  
  try {
    const response = await client.send(new InvokeModelCommand({
      modelId: 'amazon.nova-lite-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        prompt,
        max_tokens: 500,
        temperature: 0.7
      })
    }));
    
    const result = JSON.parse(new TextDecoder().decode(response.body));
    return result.completion;
  } catch (error) {
    if (error.name === 'ThrottlingException') {
      console.warn('Bedrock throttled, retrying after delay');
      await sleep(2000);
      return generateDraft(prompt); // Single retry
    }
    
    console.error('Bedrock invocation failed:', error);
    throw new Error('Failed to generate draft');
  }
}
```

### Logging Strategy

**Structured Logging**:
All logs use JSON format for CloudWatch Insights queries:

```typescript
console.log(JSON.stringify({
  level: 'info',
  component: 'SignalCorrelator',
  action: 'calculateRiskScore',
  customerId: customer.id,
  riskScore: score,
  timestamp: new Date().toISOString()
}));
```

**Never Log**:
- Customer email content
- API keys or credentials
- Full customer profiles (log IDs only)

**Always Log**:
- Lambda execution start/end with duration
- External API call results (success/failure)
- Risk score calculations with customer ID
- Growth Play state transitions

## Testing Strategy

### Dual Testing Approach

The system requires both unit tests and property-based tests for comprehensive coverage:

**Unit Tests** (Vitest):
- Specific examples demonstrating correct behavior
- Edge cases (empty inputs, boundary values)
- Error conditions (invalid data, API failures)
- UI component rendering and interactions
- Integration points between components

**Property-Based Tests** (fast-check):
- Universal properties that hold for all inputs
- Comprehensive input coverage through randomization
- Invariants (risk score bounds, data completeness)
- Round-trip properties (serialization/parsing)
- State transition properties

### Property-Based Testing Configuration

**Library**: fast-check (TypeScript-native property testing)

**Configuration**:
```typescript
import fc from 'fast-check';

// Minimum 100 iterations per property test
fc.assert(
  fc.property(
    fc.record({
      customerId: fc.string(),
      riskScore: fc.integer({ min: 0, max: 100 }),
      // ... other fields
    }),
    (growthPlay) => {
      // Property assertion
    }
  ),
  { numRuns: 100 }
);
```

**Tagging Convention**:
Each property test must reference its design document property:

```typescript
describe('Growth Play Serialization', () => {
  it('Property 13: Round-trip serialization preserves data', () => {
    // Feature: automated-growth-plays, Property 13: For any valid Growth Play object, 
    // serializing to JSON then parsing back to an object must produce an equivalent 
    // Growth Play with all fields preserved.
    
    fc.assert(
      fc.property(growthPlayArbitrary, (original) => {
        const serialized = serializeGrowthPlay(original);
        const parsed = parseGrowthPlay(serialized);
        expect(parsed).toEqual(original);
      }),
      { numRuns: 100 }
    );
  });
});
```

### Test Coverage by Component

**Signal Correlator**:
- Unit: Specific risk patterns (50% decline + 30 days = high risk)
- Property: Risk score always 0-100 (Property 6)
- Property: Usage decline detection accuracy (Property 3)
- Property: Renewal proximity detection accuracy (Property 4)
- Property: Signal data persistence (Property 1)

**Draft Generator**:
- Unit: Email format includes subject line
- Unit: Slack format excludes subject line
- Property: Word count limits (Property 12)
- Property: Content completeness (Property 10)
- Property: Format support (Property 11)

**Growth Play Parser/Serializer**:
- Unit: Specific invalid JSON examples
- Property: Round-trip preservation (Property 13)
- Property: Error message descriptiveness (Property 14)

**Execution Engine**:
- Unit: SES integration with mock
- Unit: Slack API integration with mock
- Property: Routing by communication type (Property 18)
- Property: Retry logic (Property 20)
- Property: State transitions (Property 19)

**Signal Orchestrator**:
- Unit: Cache hit within TTL
- Unit: Cache miss after TTL expiration
- Property: Parallel invocation (Property 21)
- Property: Cache behavior (Property 22)

**Approval Workflow**:
- Unit: Pending Growth Plays render correctly
- Unit: Approve button triggers API call
- Property: Approval state transition (Property 15)
- Property: Dismissal state transition (Property 16)
- Property: Draft edit preservation (Property 17)

### Generators for Property Testing

**Custom Arbitraries**:
```typescript
// Growth Play generator
const growthPlayArbitrary = fc.record({
  id: fc.uuid(),
  customerId: fc.uuid(),
  customerName: fc.string({ minLength: 1, maxLength: 50 }),
  companyName: fc.string({ minLength: 1, maxLength: 50 }),
  riskScore: fc.integer({ min: 0, max: 100 }),
  communicationType: fc.constantFrom('email', 'slack'),
  subject: fc.option(fc.string({ maxLength: 100 })),
  draftContent: fc.string({ minLength: 10, maxLength: 500 }),
  thoughtTrace: fc.record({
    riskFactors: fc.array(riskFactorArbitrary, { minLength: 1, maxLength: 5 }),
    reasoning: fc.string({ minLength: 20, maxLength: 200 }),
    signalSources: fc.array(fc.constantFrom('Mixpanel', 'HubSpot', 'Stripe'), { minLength: 1, maxLength: 3 })
  }),
  status: fc.constantFrom('pending', 'approved', 'dismissed', 'executed', 'failed'),
  createdAt: fc.date().map(d => d.toISOString()),
  updatedAt: fc.date().map(d => d.toISOString()),
  auditTrail: fc.array(auditEntryArbitrary, { maxLength: 10 })
});

// Risk Factor generator
const riskFactorArbitrary = fc.record({
  type: fc.constantFrom('usage_decline', 'renewal_approaching', 'support_tickets', 'payment_issues'),
  severity: fc.integer({ min: 0, max: 100 }),
  signalValues: fc.dictionary(fc.string(), fc.anything()),
  weight: fc.float({ min: 0, max: 1 })
});

// Customer Profile generator
const customerProfileArbitrary = fc.record({
  customerId: fc.uuid(),
  email: fc.emailAddress(),
  companyName: fc.string({ minLength: 1, maxLength: 50 }),
  mixpanelData: fc.record({
    eventCount30Days: fc.integer({ min: 0, max: 10000 }),
    eventCount60Days: fc.integer({ min: 0, max: 10000 }),
    lastActiveDate: fc.date().map(d => d.toISOString())
  }),
  hubspotData: fc.record({
    openTickets: fc.integer({ min: 0, max: 50 }),
    lastContactDate: fc.date().map(d => d.toISOString())
  }),
  stripeData: fc.record({
    subscriptionStatus: fc.constantFrom('active', 'past_due', 'canceled'),
    renewalDate: fc.date().map(d => d.toISOString()),
    mrr: fc.integer({ min: 0, max: 100000 })
  })
});
```

### Test Execution

**Local Development**:
```bash
# Run all tests
npm test

# Run property tests only
npm test -- --grep "Property"

# Run with coverage
npm test -- --coverage
```

**CI/CD Pipeline**:
- All tests must pass before deployment
- Property tests run with 100 iterations minimum
- Coverage threshold: 80% for business logic functions
- Integration tests run against LocalStack for AWS services

### Testing Anti-Patterns to Avoid

❌ **Don't**: Write property tests for infrastructure configuration
❌ **Don't**: Test subjective qualities (tone, readability)
❌ **Don't**: Write too many unit tests for cases covered by properties
❌ **Don't**: Mock everything (use real parsers, serializers)

✅ **Do**: Focus unit tests on specific examples and edge cases
✅ **Do**: Use property tests for universal rules and invariants
✅ **Do**: Test error paths with invalid inputs
✅ **Do**: Verify audit trail completeness in all state transitions

