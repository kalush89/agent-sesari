# Requirements Document

## Introduction

The Universal Signal Schema is a normalization layer that translates data from different integration sources (Stripe, HubSpot, Mixpanel) into a single unified format. This enables the AI agent to reason across all platforms simultaneously and correlate insights that span multiple tools.

Currently, each connector produces signals in its own format: Stripe emits RevenueSignalEvents, HubSpot emits RelationshipSignalEvents, and Mixpanel emits BehavioralSignalEvents. The agent cannot easily correlate a Stripe customer with a HubSpot contact and a Mixpanel user, limiting cross-platform reasoning capabilities.

The Universal Signal Schema creates a "Sesari Language" that all connectors translate to, enabling powerful cross-platform insights like "This Power User's payment just failed - alert immediately to prevent churn."

## Glossary

- **Signal**: A meaningful business event extracted from an integration platform (Stripe, HubSpot, Mixpanel)
- **Universal_Signal**: A normalized signal in the unified Sesari schema format
- **Signal_Translator**: Component that converts platform-specific signals into Universal_Signals
- **Entity_Resolver**: Component that matches entities across platforms (e.g., Stripe customer = HubSpot contact = Mixpanel user)
- **Signal_Store**: DynamoDB table storing Universal_Signals for agent retrieval
- **Correlation_Key**: Identifier used to link entities across platforms (email, user ID, etc.)

## Requirements

### Requirement 1: Universal Signal Schema Definition

**User Story:** As an AI agent, I want all signals in a consistent format, so that I can reason across platforms without platform-specific logic.

#### Acceptance Criteria

1. THE Universal_Signal SHALL include a unique signal identifier
2. THE Universal_Signal SHALL include a normalized event type from a fixed taxonomy
3. THE Universal_Signal SHALL include entity identifiers with correlation keys
4. THE Universal_Signal SHALL include temporal information (timestamp, processed time)
5. THE Universal_Signal SHALL include the source platform and original event type
6. THE Universal_Signal SHALL include normalized impact metrics
7. THE Universal_Signal SHALL preserve platform-specific details in a structured format

### Requirement 2: Signal Translation from Stripe

**User Story:** As a Stripe connector, I want to translate revenue signals into Universal_Signals, so that the agent can correlate revenue data with other platforms.

#### Acceptance Criteria

1. WHEN a RevenueSignalEvent is received, THE Signal_Translator SHALL convert it to a Universal_Signal
2. THE Signal_Translator SHALL map Stripe customer IDs to correlation keys
3. THE Signal_Translator SHALL normalize revenue impact into standard metrics
4. THE Signal_Translator SHALL preserve Stripe-specific details (subscription ID, MRR changes)
5. THE Signal_Translator SHALL map Stripe event types to the universal taxonomy

### Requirement 3: Signal Translation from HubSpot

**User Story:** As a HubSpot connector, I want to translate relationship signals into Universal_Signals, so that the agent can correlate CRM data with other platforms.

#### Acceptance Criteria

1. WHEN a RelationshipSignalEvent is received, THE Signal_Translator SHALL convert it to a Universal_Signal
2. THE Signal_Translator SHALL map HubSpot company and contact IDs to correlation keys
3. THE Signal_Translator SHALL normalize relationship metrics into standard formats
4. THE Signal_Translator SHALL preserve HubSpot-specific details (deal stages, sentiment scores)
5. THE Signal_Translator SHALL map HubSpot event types to the universal taxonomy

### Requirement 4: Signal Translation from Mixpanel

**User Story:** As a Mixpanel connector, I want to translate behavioral signals into Universal_Signals, so that the agent can correlate usage data with other platforms.

#### Acceptance Criteria

1. WHEN a BehavioralSignalEvent is received, THE Signal_Translator SHALL convert it to a Universal_Signal
2. THE Signal_Translator SHALL map Mixpanel user IDs to correlation keys
3. THE Signal_Translator SHALL normalize behavioral metrics into standard formats
4. THE Signal_Translator SHALL preserve Mixpanel-specific details (engagement scores, feature usage)
5. THE Signal_Translator SHALL map Mixpanel event types to the universal taxonomy

### Requirement 5: Entity Resolution Across Platforms

**User Story:** As an AI agent, I want to identify the same customer across Stripe, HubSpot, and Mixpanel, so that I can correlate their revenue, relationship, and behavioral signals.

#### Acceptance Criteria

1. THE Entity_Resolver SHALL match entities using email addresses as the primary correlation key
2. WHEN an email is unavailable, THE Entity_Resolver SHALL use alternative identifiers (customer ID, domain)
3. THE Entity_Resolver SHALL store entity mappings for fast lookup
4. THE Entity_Resolver SHALL handle cases where entities exist in some platforms but not others
5. THE Entity_Resolver SHALL support multiple correlation keys per entity

### Requirement 6: Universal Signal Storage

**User Story:** As an AI agent, I want to retrieve Universal_Signals efficiently, so that I can reason about cross-platform patterns quickly.

#### Acceptance Criteria

1. THE Signal_Store SHALL store Universal_Signals in DynamoDB
2. THE Signal_Store SHALL support queries by entity correlation key
3. THE Signal_Store SHALL support queries by signal type
4. THE Signal_Store SHALL support queries by time range
5. THE Signal_Store SHALL include TTL for automatic signal expiration

### Requirement 7: Universal Event Taxonomy

**User Story:** As an AI agent, I want a consistent event taxonomy, so that I can recognize similar events across platforms.

#### Acceptance Criteria

1. THE Universal_Signal SHALL use a fixed taxonomy of event categories (revenue, relationship, behavioral)
2. THE Universal_Signal SHALL use normalized event types within each category
3. THE taxonomy SHALL map platform-specific events to universal types
4. THE taxonomy SHALL preserve semantic meaning across translations
5. THE taxonomy SHALL be extensible for future integration platforms

### Requirement 8: Round-Trip Signal Validation

**User Story:** As a developer, I want to validate signal translations, so that I can ensure no data is lost during normalization.

#### Acceptance Criteria

1. FOR ALL platform-specific signals, translating to Universal_Signal and back SHALL preserve essential information
2. THE Signal_Translator SHALL validate required fields are present before translation
3. IF translation fails, THEN THE Signal_Translator SHALL log the error with the original signal
4. THE Signal_Translator SHALL include validation tests for each platform
5. THE Signal_Translator SHALL reject malformed signals with descriptive errors
