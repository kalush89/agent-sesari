# Design Document: Universal Signal Schema

## Overview

The Universal Signal Schema creates a normalization layer that translates platform-specific signals from Stripe, HubSpot, and Mixpanel into a unified "Sesari Language" format. This enables the AI agent to reason across all platforms simultaneously and correlate insights that span multiple tools.

Currently, each connector produces signals in its own format with different field names, structures, and semantics. The agent cannot easily correlate a Stripe customer with a HubSpot contact and a Mixpanel user, limiting cross-platform reasoning capabilities. The Universal Signal Schema solves this by providing:

1. A consistent schema that all signals conform to
2. Translation components that convert platform-specific signals to the universal format
3. Entity resolution to match the same customer across platforms
4. A unified storage layer optimized for agent retrieval

This design prioritizes simplicity and AWS Free Tier compliance while enabling powerful cross-platform insights like "This Power User's payment just failed - alert immediately to prevent churn."

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Platform Connectors                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Stripe     │  │   HubSpot    │  │  Mixpanel    │         │
│  │  Connector   │  │  Connector   │  │  Connector   │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
│         │                  │                  │                  │
│         │ Revenue          │ Relationship     │ Behavioral       │
│         │ Signals          │ Signals          │ Signals          │
└─────────┼──────────────────┼──────────────────┼──────────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│              Signal Translation Layer (New)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Stripe     │  │   HubSpot    │  │  Mixpanel    │         │
│  │  Translator  │  │  Translator  │  │  Translator  │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
│         │                  │                  │                  │
│         └──────────────────┼──────────────────┘                 │
│                            ▼                                     │
│                  ┌──────────────────┐                           │
│                  │ Entity Resolver  │                           │
│                  └────────┬─────────┘                           │
│                           │                                      │
│                           ▼                                      │
│                  Universal_Signals                               │
└───────────────────────────┼──────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Signal Store (DynamoDB)                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  PK: entity#{correlationKey}  SK: signal#{timestamp}    │  │
│  │  GSI1: signalType#{timestamp}                            │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AI Agent                                   │
│  - Retrieves Universal_Signals by entity or type                │
│  - Reasons across platforms using consistent schema             │
│  - Correlates revenue, relationship, and behavioral patterns    │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

**Signal Translators** (one per platform):
- Convert platform-specific signal formats to Universal_Signal schema
- Extract correlation keys (email, customer ID, etc.)
- Map platform event types to universal taxonomy
- Normalize metrics to standard units
- Preserve platform-specific details in structured format

**Entity Resolver**:
- Match entities across platforms using correlation keys
- Store entity mappings for fast lookup
- Handle missing or partial entity information
- Support multiple correlation keys per entity

**Signal Store**:
- Store Universal_Signals in DynamoDB with efficient access patterns
- Support queries by entity, signal type, and time range
- Automatic expiration via TTL
- Optimized for agent retrieval patterns

### Integration Points

The translation layer integrates with existing connectors by:
1. Each connector continues to emit platform-specific signals to its own DynamoDB table
2. A new Lambda function reads from each connector's table (via DynamoDB Streams)
3. The Lambda invokes the appropriate Signal_Translator
4. The Entity_Resolver enriches the signal with correlation data
5. The Universal_Signal is written to the Signal_Store

This approach maintains backward compatibility while adding the normalization layer.

## Components and Interfaces

### Universal_Signal Schema

The core schema that all signals conform to:

```typescript
/**
 * Universal signal schema - the "Sesari Language" format
 */
export interface Universal_Signal {
  // Unique identifier
  signalId: string;
  
  // Event classification
  category: 'revenue' | 'relationship' | 'behavioral';
  eventType: UniversalEventType;
  
  // Entity identification with correlation
  entity: {
    primaryKey: string;        // Email or primary identifier
    alternateKeys: string[];   // Additional identifiers
    platformIds: {
      stripe?: string;         // Stripe customer ID
      hubspot?: string;        // HubSpot company/contact ID
      mixpanel?: string;       // Mixpanel distinct_id
    };
  };
  
  // Temporal information
  occurredAt: number;          // Unix timestamp when event occurred
  processedAt: number;         // Unix timestamp when signal was created
  
  // Source tracking
  source: {
    platform: 'stripe' | 'hubspot' | 'mixpanel';
    originalEventType: string;
    originalEventId: string;
  };
  
  // Normalized impact metrics
  impact: {
    severity: 'critical' | 'high' | 'medium' | 'low';
    metrics: NormalizedMetrics;
  };
  
  // Platform-specific details (preserved for context)
  platformDetails: StripeDetails | HubSpotDetails | MixpanelDetails;
  
  // Storage metadata
  ttl: number;                 // DynamoDB TTL for automatic expiration
}
```

### Universal Event Taxonomy

A fixed taxonomy that maps platform-specific events to universal types:

```typescript
/**
 * Universal event types organized by category
 */
export type UniversalEventType =
  // Revenue category
  | 'revenue.expansion'
  | 'revenue.contraction'
  | 'revenue.churn'
  | 'revenue.payment_failed'
  | 'revenue.payment_recovered'
  
  // Relationship category
  | 'relationship.deal_advanced'
  | 'relationship.deal_regressed'
  | 'relationship.engagement_gap'
  | 'relationship.sentiment_positive'
  | 'relationship.sentiment_negative'
  
  // Behavioral category
  | 'behavioral.power_user'
  | 'behavioral.feature_adoption_drop'
  | 'behavioral.engagement_spike'
  | 'behavioral.inactivity';

/**
 * Mapping from platform-specific events to universal types
 */
export const EVENT_TAXONOMY: Record<string, UniversalEventType> = {
  // Stripe mappings
  'expansion': 'revenue.expansion',
  'churn': 'revenue.churn',
  'failed_payment': 'revenue.payment_failed',
  
  // HubSpot mappings
  'deal_progression': 'relationship.deal_advanced',
  'communication_gap': 'relationship.engagement_gap',
  'sentiment': 'relationship.sentiment_positive', // or negative based on score
  
  // Mixpanel mappings
  'power_user': 'behavioral.power_user',
  'feature_adoption_drop': 'behavioral.feature_adoption_drop',
};
```

### Normalized Metrics

Standard metric formats across all platforms:

```typescript
/**
 * Normalized metrics that work across all signal types
 */
export interface NormalizedMetrics {
  // Financial metrics (for revenue signals)
  revenue?: {
    amount: number;
    currency: string;
    mrr?: number;
    mrrChange?: number;
  };
  
  // Relationship metrics (for relationship signals)
  relationship?: {
    dealValue?: number;
    daysSinceContact?: number;
    sentimentScore?: number;  // -1 to 1 normalized
  };
  
  // Behavioral metrics (for behavioral signals)
  behavioral?: {
    engagementScore?: number;  // 0 to 100 normalized
    usageFrequency?: number;
    featureCount?: number;
  };
}
```

### Platform-Specific Details

Preserved details for each platform:

```typescript
/**
 * Stripe-specific details preserved in Universal_Signal
 */
export interface StripeDetails {
  subscriptionId?: string;
  planId?: string;
  quantity?: number;
  cancellationType?: 'immediate' | 'end_of_period';
  failureCode?: string;
  nextRetryAt?: number;
}

/**
 * HubSpot-specific details preserved in Universal_Signal
 */
export interface HubSpotDetails {
  dealId?: string;
  dealStage?: string;
  dealName?: string;
  contactId?: string;
  sourceType?: 'note' | 'email' | 'call';
  keywords?: string[];
}

/**
 * Mixpanel-specific details preserved in Universal_Signal
 */
export interface MixpanelDetails {
  feature?: string;
  usageCount?: number;
  mostUsedFeatures?: Array<{ feature: string; usageCount: number }>;
  dropPercentage?: number;
  percentileRank?: number;
}
```

### Signal_Translator Interface

Each platform implements this interface:

```typescript
/**
 * Interface that all platform translators must implement
 */
export interface Signal_Translator<T> {
  /**
   * Translate a platform-specific signal to Universal_Signal format
   * @param signal - Platform-specific signal
   * @param entityMapping - Optional pre-resolved entity mapping
   * @returns Universal_Signal or null if translation fails
   */
  translate(
    signal: T,
    entityMapping?: EntityMapping
  ): Promise<Universal_Signal | null>;
  
  /**
   * Validate that a platform signal has required fields
   * @param signal - Platform-specific signal
   * @returns true if valid, false otherwise
   */
  validate(signal: T): boolean;
  
  /**
   * Extract correlation keys from platform signal
   * @param signal - Platform-specific signal
   * @returns Array of correlation keys (email, customer ID, etc.)
   */
  extractCorrelationKeys(signal: T): Promise<string[]>;
}
```

### Entity_Resolver Interface

```typescript
/**
 * Entity mapping across platforms
 */
export interface EntityMapping {
  primaryKey: string;          // Email or primary identifier
  alternateKeys: string[];     // Additional identifiers
  platformIds: {
    stripe?: string;
    hubspot?: string;
    mixpanel?: string;
  };
  lastUpdated: number;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Entity resolver for cross-platform matching
 */
export interface Entity_Resolver {
  /**
   * Resolve entity mapping from correlation keys
   * @param correlationKeys - Array of identifiers to match
   * @param platform - Source platform
   * @param platformId - Platform-specific ID
   * @returns EntityMapping or creates new one
   */
  resolve(
    correlationKeys: string[],
    platform: 'stripe' | 'hubspot' | 'mixpanel',
    platformId: string
  ): Promise<EntityMapping>;
  
  /**
   * Get entity mapping by primary key
   * @param primaryKey - Email or primary identifier
   * @returns EntityMapping or null
   */
  getByPrimaryKey(primaryKey: string): Promise<EntityMapping | null>;
  
  /**
   * Update entity mapping with new platform ID
   * @param primaryKey - Email or primary identifier
   * @param platform - Platform to update
   * @param platformId - Platform-specific ID
   */
  updateMapping(
    primaryKey: string,
    platform: 'stripe' | 'hubspot' | 'mixpanel',
    platformId: string
  ): Promise<void>;
}
```

### Signal_Store Interface

```typescript
/**
 * Storage interface for Universal_Signals
 */
export interface Signal_Store {
  /**
   * Store a Universal_Signal
   * @param signal - Universal_Signal to store
   */
  store(signal: Universal_Signal): Promise<void>;
  
  /**
   * Retrieve signals for an entity
   * @param primaryKey - Entity's primary key
   * @param options - Query options (time range, limit, etc.)
   * @returns Array of Universal_Signals
   */
  getByEntity(
    primaryKey: string,
    options?: QueryOptions
  ): Promise<Universal_Signal[]>;
  
  /**
   * Retrieve signals by type
   * @param eventType - Universal event type
   * @param options - Query options (time range, limit, etc.)
   * @returns Array of Universal_Signals
   */
  getByType(
    eventType: UniversalEventType,
    options?: QueryOptions
  ): Promise<Universal_Signal[]>;
  
  /**
   * Retrieve signals by category
   * @param category - Signal category
   * @param options - Query options (time range, limit, etc.)
   * @returns Array of Universal_Signals
   */
  getByCategory(
    category: 'revenue' | 'relationship' | 'behavioral',
    options?: QueryOptions
  ): Promise<Universal_Signal[]>;
}

export interface QueryOptions {
  startTime?: number;
  endTime?: number;
  limit?: number;
  sortOrder?: 'asc' | 'desc';
}
```

## Data Models

### DynamoDB Table: UniversalSignals

**Table Design:**
- Single table design with composite keys for flexible querying
- GSI for querying by signal type and time
- TTL for automatic signal expiration (90 days default)

**Primary Key Structure:**
```
PK: entity#{primaryKey}
SK: signal#{timestamp}#{signalId}
```

**GSI1 (SignalTypeIndex):**
```
GSI1PK: type#{eventType}
GSI1SK: timestamp#{signalId}
```

**GSI2 (CategoryIndex):**
```
GSI2PK: category#{category}
GSI2SK: timestamp#{signalId}
```

**Attributes:**
```typescript
{
  // Keys
  PK: string;                    // entity#{primaryKey}
  SK: string;                    // signal#{timestamp}#{signalId}
  GSI1PK: string;                // type#{eventType}
  GSI1SK: string;                // timestamp#{signalId}
  GSI2PK: string;                // category#{category}
  GSI2SK: string;                // timestamp#{signalId}
  
  // Signal data (full Universal_Signal object)
  signalId: string;
  category: string;
  eventType: string;
  entity: object;
  occurredAt: number;
  processedAt: number;
  source: object;
  impact: object;
  platformDetails: object;
  
  // Metadata
  ttl: number;                   // Unix timestamp for expiration
}
```

**Access Patterns:**
1. Get all signals for an entity: Query by PK
2. Get signals for entity in time range: Query by PK with SK condition
3. Get all signals of a type: Query GSI1 by GSI1PK
4. Get signals of type in time range: Query GSI1 with GSI1SK condition
5. Get all signals in a category: Query GSI2 by GSI2PK

### DynamoDB Table: EntityMappings

**Table Design:**
- Stores cross-platform entity mappings
- Supports lookup by primary key or platform ID
- No TTL (mappings persist)

**Primary Key Structure:**
```
PK: entity#{primaryKey}
SK: mapping
```

**GSI1 (PlatformIdIndex):**
```
GSI1PK: platform#{platform}#{platformId}
GSI1SK: entity#{primaryKey}
```

**Attributes:**
```typescript
{
  // Keys
  PK: string;                    // entity#{primaryKey}
  SK: string;                    // mapping
  GSI1PK: string;                // platform#{platform}#{platformId}
  GSI1SK: string;                // entity#{primaryKey}
  
  // Mapping data
  primaryKey: string;            // Email or primary identifier
  alternateKeys: string[];       // Additional identifiers
  platformIds: {
    stripe?: string;
    hubspot?: string;
    mixpanel?: string;
  };
  lastUpdated: number;
  confidence: string;            // high, medium, low
}
```

**Access Patterns:**
1. Get mapping by primary key: Query by PK
2. Get mapping by platform ID: Query GSI1 by GSI1PK
3. Update mapping: PutItem with PK

### Lambda Function: signal-translator

**Trigger:** DynamoDB Streams from connector tables (stripe-events, hubspot-events, mixpanel-events)

**Environment Variables:**
```
UNIVERSAL_SIGNALS_TABLE=UniversalSignals
ENTITY_MAPPINGS_TABLE=EntityMappings
SIGNAL_TTL_DAYS=90
```

**Function Flow:**
1. Receive batch of records from DynamoDB Stream
2. For each record, determine source platform
3. Invoke appropriate Signal_Translator
4. Call Entity_Resolver to get/create entity mapping
5. Construct Universal_Signal
6. Write to UniversalSignals table
7. Log translation metrics

**Error Handling:**
- Failed translations are logged with original signal
- Partial batch failures are retried
- Invalid signals are sent to DLQ for investigation


## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property Reflection

After analyzing all acceptance criteria, I identified several areas of redundancy:

1. **Schema Structure Properties (1.1-1.7)**: These can be combined into a single comprehensive property that validates the complete Universal_Signal structure rather than checking each field individually.

2. **Platform Translation Properties (2.1-2.5, 3.1-3.5, 4.1-4.5)**: Each platform has identical translation requirements. Rather than having separate properties for each platform, we can create generic properties that apply to all translators.

3. **Preservation Properties (2.4, 3.4, 4.4)**: These all test that platform-specific details are preserved, which can be combined into one property.

4. **Taxonomy Mapping Properties (2.5, 3.5, 4.5, 7.3)**: These all test event type mapping, which can be unified into a single property.

5. **Storage Properties (6.1-6.4)**: The storage and retrieval properties can be combined into round-trip properties that test both operations together.

The consolidated properties below eliminate redundancy while maintaining comprehensive coverage.

### Property 1: Universal Signal Schema Completeness

For any Universal_Signal, it must contain all required fields: a unique signalId, a category from the allowed set (revenue, relationship, behavioral), an eventType from the universal taxonomy, an entity object with primaryKey and platformIds, temporal fields (occurredAt, processedAt), a source object with platform and originalEventType, an impact object with severity and metrics, platformDetails, and a ttl field.

**Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7**

### Property 2: Signal Translation Preserves Essential Information

For any platform-specific signal (RevenueSignalEvent, RelationshipSignalEvent, or BehavioralSignalEvent), translating it to a Universal_Signal must preserve all essential information including entity identifiers, event type semantic meaning, timestamp, and platform-specific details in the platformDetails field.

**Validates: Requirements 2.1, 2.4, 3.1, 3.4, 4.1, 4.4, 8.1**

### Property 3: Platform IDs Are Correctly Mapped

For any platform-specific signal, the translated Universal_Signal must include the platform-specific entity ID in the correct field of entity.platformIds (stripe for Stripe customers, hubspot for HubSpot companies/contacts, mixpanel for Mixpanel users).

**Validates: Requirements 2.2, 3.2, 4.2**

### Property 4: Metrics Are Normalized to Standard Format

For any platform-specific signal, the translated Universal_Signal must normalize metrics into the appropriate impact.metrics structure: revenue signals use impact.metrics.revenue, relationship signals use impact.metrics.relationship, and behavioral signals use impact.metrics.behavioral.

**Validates: Requirements 2.3, 3.3, 4.3**

### Property 5: Event Types Map to Universal Taxonomy

For any platform-specific event type, the EVENT_TAXONOMY mapping must produce a valid UniversalEventType, and the eventType must be appropriate for the signal's category (revenue event types for revenue category, relationship event types for relationship category, behavioral event types for behavioral category).

**Validates: Requirements 2.5, 3.5, 4.5, 7.1, 7.2, 7.3**

### Property 6: Entity Resolution Uses Email as Primary Key

For any set of correlation keys that includes an email address, the Entity_Resolver must use the email as the primaryKey in the EntityMapping, and all entities with the same email must resolve to the same EntityMapping.

**Validates: Requirements 5.1**

### Property 7: Entity Resolution Falls Back to Alternative Identifiers

For any set of correlation keys that does not include an email address, the Entity_Resolver must use an alternative identifier (customer ID, user ID, or domain) as the primaryKey, and the resolution must still succeed.

**Validates: Requirements 5.2**

### Property 8: Entity Mappings Round-Trip Through Storage

For any EntityMapping, storing it and then retrieving it by primaryKey must return an equivalent EntityMapping with all fields preserved.

**Validates: Requirements 5.3**

### Property 9: Entity Mappings Support Partial Platform Coverage

For any EntityMapping, it must be valid even if platformIds only contains IDs for one or two platforms (not all three), and retrieving by any present platform ID must return the correct EntityMapping.

**Validates: Requirements 5.4**

### Property 10: Multiple Correlation Keys Resolve to Same Entity

For any entity with multiple correlation keys (email, customer ID, user ID), all correlation keys must resolve to the same EntityMapping with the same primaryKey.

**Validates: Requirements 5.5**

### Property 11: Signal Storage and Retrieval Round-Trip

For any Universal_Signal, storing it and then retrieving it by entity primaryKey must return the signal with all fields preserved.

**Validates: Requirements 6.1, 6.2**

### Property 12: Signals Can Be Retrieved by Type

For any set of Universal_Signals with different eventTypes, querying by a specific eventType must return only signals with that eventType, and all signals with that eventType must be returned.

**Validates: Requirements 6.3**

### Property 13: Signals Can Be Retrieved by Time Range

For any set of Universal_Signals with different timestamps, querying with a time range (startTime, endTime) must return only signals where occurredAt is within the range, and all signals within the range must be returned.

**Validates: Requirements 6.4**

### Property 14: Signals Have Valid TTL

For any Universal_Signal, the ttl field must be set to a future timestamp that is approximately SIGNAL_TTL_DAYS (default 90) days after the processedAt timestamp.

**Validates: Requirements 6.5**

### Property 15: Translation Validates Required Fields

For any platform-specific signal with missing required fields, the Signal_Translator.validate() function must return false, and the translate() function must return null.

**Validates: Requirements 8.2**

### Property 16: Malformed Signals Are Rejected

For any platform-specific signal with invalid field values (negative timestamps, invalid event types, missing entity identifiers), the Signal_Translator must reject the signal and return null.

**Validates: Requirements 8.5**

## Error Handling

### Translation Errors

**Validation Failures:**
- When a signal fails validation (missing required fields), the translator returns null
- The original signal is logged with error details for investigation
- The Lambda function continues processing other signals in the batch

**Entity Resolution Failures:**
- When no correlation keys can be extracted, the translator returns null
- When entity resolution fails, a new entity mapping is created with available information
- Confidence level is set to 'low' for entities with minimal correlation data

**DynamoDB Write Failures:**
- Failed writes are retried with exponential backoff (AWS SDK default)
- After max retries, the signal is sent to a Dead Letter Queue (DLQ)
- CloudWatch alarms trigger on DLQ message count > 0

### Query Errors

**Invalid Query Parameters:**
- Empty or invalid primaryKey returns empty array
- Invalid time ranges (startTime > endTime) throw validation error
- Invalid eventType throws validation error with list of valid types

**DynamoDB Query Failures:**
- Transient errors are retried automatically by AWS SDK
- Persistent errors are logged and thrown to caller
- Caller should implement retry logic with exponential backoff

### Entity Resolution Errors

**Conflicting Mappings:**
- When two entities with different primaryKeys have the same platform ID, log warning
- Use the most recently updated mapping
- Flag for manual review in CloudWatch Logs

**Missing Platform Data:**
- When a platform ID lookup returns no mapping, create new mapping
- Set confidence to 'low' until additional correlation keys are added

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests for comprehensive coverage:

**Unit Tests** focus on:
- Specific examples of signal translation (one example per platform)
- Edge cases (missing optional fields, empty arrays, boundary values)
- Error conditions (malformed signals, missing required fields)
- Integration points (DynamoDB operations, entity resolution)

**Property-Based Tests** focus on:
- Universal properties that hold for all inputs (the 16 properties defined above)
- Comprehensive input coverage through randomization
- Round-trip properties (translation, storage, entity resolution)
- Invariants (schema structure, taxonomy validity)

Both approaches are complementary and necessary. Unit tests catch concrete bugs in specific scenarios, while property tests verify general correctness across all possible inputs.

### Property-Based Testing Configuration

**Library:** fast-check (TypeScript property-based testing library)

**Configuration:**
- Minimum 100 iterations per property test (due to randomization)
- Each test must reference its design document property in a comment
- Tag format: `// Feature: universal-signal-schema, Property {number}: {property_text}`

**Example Property Test Structure:**

```typescript
import fc from 'fast-check';
import { describe, it, expect } from 'vitest';

describe('Universal Signal Schema Properties', () => {
  // Feature: universal-signal-schema, Property 1: Universal Signal Schema Completeness
  it('should contain all required fields for any Universal_Signal', () => {
    fc.assert(
      fc.property(
        universalSignalArbitrary(),
        (signal) => {
          expect(signal.signalId).toBeDefined();
          expect(['revenue', 'relationship', 'behavioral']).toContain(signal.category);
          expect(signal.eventType).toBeDefined();
          expect(signal.entity.primaryKey).toBeDefined();
          expect(signal.entity.platformIds).toBeDefined();
          expect(signal.occurredAt).toBeGreaterThan(0);
          expect(signal.processedAt).toBeGreaterThan(0);
          expect(signal.source.platform).toBeDefined();
          expect(signal.impact.severity).toBeDefined();
          expect(signal.platformDetails).toBeDefined();
          expect(signal.ttl).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Test Generators (Arbitraries)

Property-based tests require generators for random test data:

**Signal Generators:**
- `revenueSignalArbitrary()`: Generates random RevenueSignalEvents
- `relationshipSignalArbitrary()`: Generates random RelationshipSignalEvents
- `behavioralSignalArbitrary()`: Generates random BehavioralSignalEvents
- `universalSignalArbitrary()`: Generates random Universal_Signals

**Entity Generators:**
- `entityMappingArbitrary()`: Generates random EntityMappings
- `correlationKeysArbitrary()`: Generates random correlation key arrays

**Edge Case Generators:**
- `malformedSignalArbitrary()`: Generates signals with missing/invalid fields
- `partialEntityMappingArbitrary()`: Generates mappings with some platforms missing

### Unit Test Coverage

**Translation Tests:**
- Test each platform translator with one valid example
- Test validation with missing required fields
- Test error handling with malformed input

**Entity Resolution Tests:**
- Test email-based resolution
- Test fallback to alternative identifiers
- Test conflicting mappings
- Test partial platform coverage

**Storage Tests:**
- Test storing and retrieving signals
- Test querying by entity, type, and time range
- Test TTL calculation

**Integration Tests:**
- Test end-to-end flow from platform signal to Universal_Signal storage
- Test DynamoDB Stream trigger to Lambda
- Test error handling and DLQ

### Test Organization

```
packages/lambdas/signal-translator/
  src/
    __tests__/
      translators/
        stripe-translator.test.ts          # Unit tests
        stripe-translator.properties.test.ts  # Property tests
        hubspot-translator.test.ts
        hubspot-translator.properties.test.ts
        mixpanel-translator.test.ts
        mixpanel-translator.properties.test.ts
      entity-resolver.test.ts
      entity-resolver.properties.test.ts
      signal-store.test.ts
      signal-store.properties.test.ts
      integration.test.ts
    arbitraries/
      signal-generators.ts                 # fast-check generators
      entity-generators.ts
```

