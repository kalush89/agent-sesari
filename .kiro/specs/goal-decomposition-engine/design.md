# Design Document: Goal Decomposition Engine

## Overview

The Goal Decomposition Engine transforms high-level growth goals into actionable SMART objectives using Amazon Nova's reasoning capabilities. The system follows a stateless, functional design pattern that retrieves historical company context via Bedrock Knowledge Bases (RAG), invokes Nova for decomposition, and returns a strictly validated JSON response.

This design prioritizes simplicity and reliability over complex orchestration. The entire flow is a single Lambda invocation that coordinates three operations: context retrieval, LLM reasoning, and response validation.

## Architecture

### High-Level Flow

```
User Input (Goal String)
    ↓
Next.js API Route (/api/decompose-goal)
    ↓
Context Retriever → Bedrock Knowledge Bases (RAG)
    ↓
Goal Decomposer → Amazon Nova (Reasoning)
    ↓
Response Validator → JSON Schema Validation
    ↓
Structured JSON Output
```

### Deployment Architecture

The system can be deployed in two configurations:

1. **Development/MVP**: Next.js API route handles the entire flow
2. **Production**: Lambda function invoked from Next.js API route for better scalability

This design documents the Lambda implementation, which can be extracted from the Next.js API route when scaling is needed.

### Component Responsibilities

1. **API Route Handler**: Entry point (Next.js or Lambda), orchestrates the three-step flow, handles top-level errors
2. **Context Retriever**: Queries Bedrock Knowledge Bases for historical company data
3. **Goal Decomposer**: Constructs prompt with context and invokes Nova for decomposition
4. **Response Validator**: Validates Nova output against strict JSON schema
5. **Error Handler**: Logs errors and returns user-friendly messages

## Components and Interfaces

### API Route Handler

```typescript
/**
 * Main entry point for goal decomposition
 * Orchestrates context retrieval, decomposition, and validation
 */
export async function POST(request: Request): Promise<Response>
```

**Input**: Request containing `{ goal: string }` in body
**Output**: Response with status code and JSON body

### Context Retriever

```typescript
/**
 * Retrieves relevant historical company context from Bedrock Knowledge Bases
 */
async function retrieveCompanyContext(goal: string): Promise<CompanyContext>
```

**Input**: User's goal string (used as query for semantic search)
**Output**: `CompanyContext` object containing relevant historical data

```typescript
interface CompanyContext {
  recentMetrics: string[];      // Recent Stripe/HubSpot/Mixpanel metrics
  historicalGoals: string[];    // Past goals and outcomes
  companyProfile: string;        // Company size, industry, stage
}
```

### Goal Decomposer

```typescript
/**
 * Invokes Amazon Nova to decompose goal into SMART objectives
 */
async function decomposeGoal(
  goal: string, 
  context: CompanyContext
): Promise<DecompositionResponse>
```

**Input**: Goal string and company context
**Output**: Raw Nova response (JSON string)

**Prompt Structure**:
```
You are a B2B SaaS growth strategist. Decompose the following goal into exactly 3 SMART objectives.

COMPANY CONTEXT:
{context.companyProfile}
Recent Metrics: {context.recentMetrics}
Historical Goals: {context.historicalGoals}

USER GOAL:
{goal}

INSTRUCTIONS:
1. Create 3 SMART objectives (Specific, Measurable, Achievable, Relevant, Time-bound)
2. For each objective, identify required Stripe, HubSpot, or Mixpanel signals
3. Provide strategic justification for each objective

OUTPUT FORMAT (strict JSON):
{
  "objectives": [
    {
      "title": "string",
      "description": "string",
      "successThreshold": "string",
      "requiredSignals": ["string"],
      "strategicWhy": "string"
    }
  ]
}
```

### Response Validator

```typescript
/**
 * Validates Nova response against strict JSON schema
 */
function validateDecompositionResponse(response: string): DecompositionResponse
```

**Input**: Raw JSON string from Nova
**Output**: Validated `DecompositionResponse` object or throws error

### Data Models

```typescript
interface DecompositionResponse {
  objectives: Objective[];
}

interface Objective {
  title: string;                    // Short objective name
  description: string;              // Detailed description
  successThreshold: string;         // Measurable success criteria
  requiredSignals: string[];        // Stripe/HubSpot/Mixpanel signals needed
  strategicWhy: string;             // Justification for this objective
}

interface CompanyContext {
  recentMetrics: string[];
  historicalGoals: string[];
  companyProfile: string;
}
```

### JSON Schema for Validation

```json
{
  "type": "object",
  "required": ["objectives"],
  "properties": {
    "objectives": {
      "type": "array",
      "minItems": 3,
      "maxItems": 3,
      "items": {
        "type": "object",
        "required": ["title", "description", "successThreshold", "requiredSignals", "strategicWhy"],
        "properties": {
          "title": { "type": "string", "minLength": 1 },
          "description": { "type": "string", "minLength": 1 },
          "successThreshold": { "type": "string", "minLength": 1 },
          "requiredSignals": {
            "type": "array",
            "minItems": 1,
            "items": { "type": "string" }
          },
          "strategicWhy": { "type": "string", "minLength": 1 }
        }
      }
    }
  }
}
```

## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property 1: Input Validation Rejects Empty Goals
*For any* input request, if the goal field is missing, empty, or contains only whitespace, the system should return a 400 error with a descriptive message without invoking Nova.
**Validates: Requirements TBD**

### Property 2: Objective Count Invariant
*For any* valid Nova response that passes validation, the output should contain exactly 3 objectives.
**Validates: Requirements TBD**

### Property 3: Required Fields Completeness
*For any* objective in a validated response, all required fields (title, description, successThreshold, requiredSignals, strategicWhy) should be non-empty strings or non-empty arrays.
**Validates: Requirements TBD**

### Property 4: Signal Array Non-Empty
*For any* objective in a validated response, the requiredSignals array should contain at least one signal string.
**Validates: Requirements TBD**

### Property 5: Context Retrieval Graceful Degradation
*For any* Bedrock Knowledge Base retrieval failure, the system should log the error and continue with empty context rather than failing the entire request.
**Validates: Requirements TBD**

### Property 6: Nova API Failure Handling
*For any* Nova API failure (timeout, rate limit, service error), the system should log the error and return a 500 response with a user-friendly message.
**Validates: Requirements TBD**

### Property 7: Invalid JSON Handling
*For any* Nova response that is not valid JSON, the validator should throw an error that is caught by the handler and returned as a 500 response with appropriate error details.
**Validates: Requirements TBD**

### Property 8: Schema Validation Failure Handling
*For any* Nova response that is valid JSON but fails schema validation (missing fields, wrong types, incorrect array lengths), the validator should throw an error with details about which fields are invalid.
**Validates: Requirements TBD**

### Property 9: Prompt Context Inclusion
*For any* successful context retrieval, the prompt sent to Nova should include all three context components (recentMetrics, historicalGoals, companyProfile) in the structured format.
**Validates: Requirements TBD**

### Property 10: Response Structure Consistency
*For any* successful decomposition, the response structure should match the defined TypeScript interface exactly, with no additional or missing fields at the top level.
**Validates: Requirements TBD**

## Error Handling

### Error Categories

1. **Client Errors (4xx)**
   - Missing or empty goal field → 400 Bad Request
   - Invalid request format → 400 Bad Request

2. **Server Errors (5xx)**
   - Nova API failure → 500 Internal Server Error
   - Invalid JSON from Nova → 500 Internal Server Error
   - Schema validation failure → 500 Internal Server Error
   - Unexpected errors → 500 Internal Server Error

### Error Response Format

```typescript
interface ErrorResponse {
  error: string;           // User-friendly error message
  details?: string;        // Technical details (only in dev mode)
}
```

### Error Handling Pattern

```typescript
try {
  // Validate input
  if (!goal || goal.trim().length === 0) {
    return createErrorResponse(400, 'Goal is required');
  }
  
  // Retrieve context (non-blocking failure)
  const context = await retrieveCompanyContext(goal).catch(err => {
    console.error('Context retrieval failed:', err);
    return createEmptyContext();
  });
  
  // Decompose goal (blocking failure)
  const rawResponse = await decomposeGoal(goal, context);
  
  // Validate response (blocking failure)
  const validated = validateDecompositionResponse(rawResponse);
  
  return createSuccessResponse(200, validated);
  
} catch (error) {
  console.error('Goal decomposition failed:', error);
  return createErrorResponse(500, 'Failed to decompose goal');
}
```

## Testing Strategy

### Dual Testing Approach

The system requires both unit tests and property-based tests for comprehensive coverage:

- **Unit tests**: Verify specific examples, edge cases, and error conditions
- **Property tests**: Verify universal properties across all inputs

Together, these approaches provide comprehensive coverage where unit tests catch concrete bugs and property tests verify general correctness.

### Property-Based Testing

**Library**: fast-check (TypeScript/JavaScript property-based testing library)

**Configuration**: Each property test should run a minimum of 100 iterations to ensure comprehensive input coverage.

**Test Tagging**: Each property test must include a comment referencing the design document property:
```typescript
// Feature: goal-decomposition-engine, Property 1: Goal Input Validation
```

### Unit Testing Focus

Unit tests should focus on:
- Specific examples demonstrating correct decomposition
- Edge cases (empty strings, very long goals, special characters)
- Error conditions (Nova timeout, invalid JSON, schema violations)
- Integration points (Bedrock KB queries, Nova API calls)

Avoid writing too many unit tests for input variations—property-based tests handle comprehensive input coverage.

### Test Coverage Requirements

1. **Input Validation Tests**
   - Empty goal string
   - Whitespace-only goal
   - Very long goal (>1000 characters)
   - Special characters and Unicode

2. **Context Retrieval Tests**
   - Successful context retrieval
   - Bedrock KB failure (should not block decomposition)
   - Empty context handling

3. **Nova Invocation Tests**
   - Successful decomposition
   - Nova API timeout
   - Nova rate limiting
   - Invalid JSON response

4. **Validation Tests**
   - Valid response with 3 objectives
   - Response with <3 objectives
   - Response with >3 objectives
   - Missing required fields
   - Empty arrays in requiredSignals

5. **End-to-End Tests**
   - Complete successful flow
   - Graceful degradation with context failure
   - Error propagation from Nova

### Property Test Examples

```typescript
// Feature: goal-decomposition-engine, Property 2: Objective Count Invariant
it('should always return exactly 3 objectives for valid responses', () => {
  fc.assert(
    fc.property(
      fc.array(objectiveArbitrary(), { minLength: 3, maxLength: 3 }),
      (objectives) => {
        const response = { objectives };
        const validated = validateDecompositionResponse(JSON.stringify(response));
        expect(validated.objectives).toHaveLength(3);
      }
    ),
    { numRuns: 100 }
  );
});
```

## AWS Free Tier Optimization

### Lambda Configuration

- **Memory**: 512 MB (balance between cost and performance)
- **Timeout**: 30 seconds (sufficient for Nova + Bedrock KB)
- **Concurrency**: No reserved concurrency (use on-demand)

### Token Optimization

- **Model**: Amazon Nova Lite (cost-effective for reasoning tasks)
- **Prompt Design**: Concise instructions with minimal examples
- **Context Limiting**: Retrieve only top 3-5 relevant documents from Bedrock KB
- **Response Format**: Strict JSON schema reduces token waste

### Cost Estimates (Free Tier)

- Lambda: 1M requests/month free, ~100ms execution = well within limits
- Nova Lite: ~500 tokens per request (input + output) = ~$0.0001 per request
- Bedrock KB: Retrieval costs minimal for small context windows

Expected monthly cost for 1000 decompositions: <$1

## Implementation Notes

### AWS SDK Configuration

```typescript
import { BedrockAgentRuntimeClient, RetrieveCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const bedrockKBClient = new BedrockAgentRuntimeClient({ 
  region: process.env.AWS_REGION 
});

const bedrockRuntimeClient = new BedrockRuntimeClient({ 
  region: process.env.AWS_REGION 
});
```

### Environment Variables

- `AWS_REGION`: AWS region for Bedrock services
- `KNOWLEDGE_BASE_ID`: Bedrock Knowledge Base ID for company context
- `NOVA_MODEL_ID`: Nova model identifier (e.g., `amazon.nova-lite-v1:0`)
- `NODE_ENV`: Environment mode (development/production)

### Deployment

- Package: Single Lambda function with AWS SDK dependencies
- IAM Role: Permissions for Bedrock Runtime and Bedrock Agent Runtime
- API Gateway: REST API with POST endpoint `/decompose-goal`
