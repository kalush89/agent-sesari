# Requirements Document

## Introduction

The Daily Briefing Generator is a proactive narrative summary system that transforms raw business signals into a clean, editorial-style morning memo. Instead of forcing users to check multiple dashboards, it delivers a single, story-driven summary that highlights what matters and recommends specific actions.

This feature bridges the execution gap by surfacing insights from integrated platforms (Stripe, HubSpot, Mixpanel) in a format that feels like reading a well-written newspaper article rather than interpreting complex charts.

## Glossary

- **Briefing_Generator**: The system component that creates daily narrative summaries
- **Signal_Store**: The DynamoDB table containing universal signals from all connectors
- **Narrative_Engine**: The AI component that transforms signals into human-readable stories
- **Briefing_UI**: The Next.js frontend component that displays the daily briefing
- **Growth_Play**: An actionable recommendation button presented to the user
- **Thought_Trace**: The source signals and reasoning that led to an insight
- **Briefing_Scheduler**: The EventBridge rule that triggers daily briefing generation
- **Briefing_Store**: The S3 bucket or DynamoDB table storing generated briefings
- **Signal_Prioritizer**: The component that ranks signals by importance and urgency
- **Insight_Card**: A UI component displaying a single insight with context and action

## Requirements

### Requirement 1: Daily Briefing Generation

**User Story:** As a SaaS founder, I want to receive a daily narrative summary of my business signals, so that I can understand what's happening without checking multiple dashboards.

#### Acceptance Criteria

1. WHEN the Briefing_Scheduler triggers at 8:00 AM UTC, THE Briefing_Generator SHALL retrieve all signals from the past 24 hours from the Signal_Store
2. THE Briefing_Generator SHALL query signals with timestamps between (current_time - 24 hours) and current_time
3. WHEN no signals exist for the past 24 hours, THE Briefing_Generator SHALL generate a briefing stating "No new activity detected"
4. THE Briefing_Generator SHALL complete generation within 30 seconds of trigger
5. WHEN generation fails, THE Briefing_Generator SHALL log the error and retry once after 5 minutes

### Requirement 2: Signal Prioritization

**User Story:** As a user, I want the most important signals surfaced first, so that I can focus on what matters most.

#### Acceptance Criteria

1. THE Signal_Prioritizer SHALL rank signals by combining urgency score and business impact score
2. WHEN a signal has severity "critical", THE Signal_Prioritizer SHALL assign it priority weight 10
3. WHEN a signal has severity "warning", THE Signal_Prioritizer SHALL assign it priority weight 5
4. WHEN a signal has severity "info", THE Signal_Prioritizer SHALL assign it priority weight 1
5. THE Signal_Prioritizer SHALL return signals in descending priority order
6. THE Signal_Prioritizer SHALL limit results to the top 10 highest-priority signals

### Requirement 3: Narrative Generation

**User Story:** As a user, I want insights written in plain English, so that I can quickly understand what's happening without technical jargon.

#### Acceptance Criteria

1. THE Narrative_Engine SHALL transform each prioritized signal into a narrative sentence
2. THE Narrative_Engine SHALL use Amazon Nova Lite model for text generation
3. WHEN generating narrative, THE Narrative_Engine SHALL include the entity name, the observation, and the recommended action
4. THE Narrative_Engine SHALL limit each narrative to 150 words maximum
5. WHEN the Narrative_Engine receives a revenue signal, THE Narrative_Engine SHALL format currency values in USD with two decimal places
6. WHEN the Narrative_Engine receives a behavioral signal, THE Narrative_Engine SHALL include the specific user action and frequency

### Requirement 4: Briefing Storage

**User Story:** As a user, I want to access previous briefings, so that I can track how situations evolved over time.

#### Acceptance Criteria

1. WHEN a briefing is generated, THE Briefing_Generator SHALL store it in the Briefing_Store with a timestamp key
2. THE Briefing_Generator SHALL use the key format "briefing/{user_id}/{YYYY-MM-DD}"
3. THE Briefing_Store SHALL retain briefings for 90 days
4. WHEN a briefing is stored, THE Briefing_Generator SHALL include metadata: generation_timestamp, signal_count, and priority_level
5. THE Briefing_Generator SHALL compress briefing content before storage to minimize storage costs

### Requirement 5: Briefing UI Display

**User Story:** As a user, I want to view my daily briefing in a clean, editorial layout, so that it feels like reading a morning newspaper rather than a technical dashboard.

#### Acceptance Criteria

1. THE Briefing_UI SHALL display briefings in a single-column layout with background color #FAFAFA
2. THE Briefing_UI SHALL use Inter or Geist font family for all text
3. THE Briefing_UI SHALL display the briefing date at the top in format "Monday, January 15, 2024"
4. WHEN the briefing contains zero insights, THE Briefing_UI SHALL display "All quiet today. No new signals detected."
5. THE Briefing_UI SHALL render each insight as an Insight_Card component
6. THE Briefing_UI SHALL use skeleton loaders while the briefing is loading

### Requirement 6: Insight Card Display

**User Story:** As a user, I want each insight presented as a clear card with context and action, so that I know exactly what to do next.

#### Acceptance Criteria

1. THE Insight_Card SHALL display the narrative text in primary text color #1A1A1A
2. THE Insight_Card SHALL include a collapsible "Why?" section containing the Thought_Trace
3. WHEN the Thought_Trace section is collapsed, THE Insight_Card SHALL display a chevron-down icon
4. WHEN the Thought_Trace section is expanded, THE Insight_Card SHALL display a chevron-up icon
5. THE Insight_Card SHALL display a Growth_Play button in accent color #00C853
6. WHEN the insight severity is "critical", THE Insight_Card SHALL display a red indicator dot
7. THE Insight_Card SHALL use 16px padding and 8px border radius

### Requirement 7: Thought Trace Display

**User Story:** As a user, I want to see the source signals behind each insight, so that I can trust the agent's reasoning.

#### Acceptance Criteria

1. THE Thought_Trace SHALL list all source signals that contributed to the insight
2. THE Thought_Trace SHALL display each signal with its source system (Stripe, HubSpot, or Mixpanel)
3. THE Thought_Trace SHALL display each signal timestamp in relative format (e.g., "2 hours ago")
4. THE Thought_Trace SHALL display signal severity with a colored badge
5. THE Thought_Trace SHALL limit display to 5 source signals maximum

### Requirement 8: Growth Play Actions

**User Story:** As a user, I want one-click actions for each insight, so that I can immediately act on recommendations.

#### Acceptance Criteria

1. THE Growth_Play button SHALL display action text (e.g., "Check on Customer", "Review Metrics")
2. WHEN a Growth_Play button is clicked, THE Briefing_UI SHALL navigate to the relevant detail page
3. WHEN a Growth_Play involves an external system, THE Briefing_UI SHALL open the external URL in a new tab
4. THE Growth_Play button SHALL use emerald green background #00C853 with white text
5. THE Growth_Play button SHALL display a hover state with 10% darker background

### Requirement 9: Briefing History Navigation

**User Story:** As a user, I want to navigate to previous briefings, so that I can review past insights and track trends.

#### Acceptance Criteria

1. THE Briefing_UI SHALL display a date picker component at the top of the page
2. WHEN a user selects a date, THE Briefing_UI SHALL fetch and display the briefing for that date
3. WHEN no briefing exists for the selected date, THE Briefing_UI SHALL display "No briefing available for this date"
4. THE Briefing_UI SHALL display "Previous" and "Next" navigation buttons
5. WHEN the user clicks "Previous", THE Briefing_UI SHALL load the briefing from the previous day
6. WHEN the user clicks "Next", THE Briefing_UI SHALL load the briefing from the next day
7. WHEN the selected date is today, THE Briefing_UI SHALL disable the "Next" button

### Requirement 10: Empty State Handling

**User Story:** As a new user with no data yet, I want to see a helpful empty state, so that I understand what to expect once data flows in.

#### Acceptance Criteria

1. WHEN the Signal_Store contains zero signals, THE Briefing_Generator SHALL generate a welcome briefing
2. THE welcome briefing SHALL include text "Welcome to Sesari! Connect your first integration to start receiving daily briefings."
3. THE welcome briefing SHALL include a Growth_Play button labeled "Connect Integration"
4. WHEN the Growth_Play button is clicked, THE Briefing_UI SHALL navigate to the integrations page

### Requirement 11: Error Handling and Resilience

**User Story:** As a user, I want the system to handle errors gracefully, so that I still receive a briefing even if some data sources fail.

#### Acceptance Criteria

1. WHEN the Signal_Store query fails, THE Briefing_Generator SHALL log the error and return an empty signal list
2. WHEN the Narrative_Engine fails to generate text, THE Briefing_Generator SHALL fall back to displaying raw signal data
3. WHEN Amazon Nova Lite is unavailable, THE Briefing_Generator SHALL retry once after 10 seconds
4. WHEN retry fails, THE Briefing_Generator SHALL use a template-based narrative generator
5. THE Briefing_UI SHALL display an error banner when the briefing fails to load
6. THE error banner SHALL include a "Retry" button that refetches the briefing

### Requirement 12: Performance and Cost Optimization

**User Story:** As a system operator, I want the briefing generation to stay within AWS Free Tier limits, so that costs remain minimal.

#### Acceptance Criteria

1. THE Briefing_Generator SHALL use Amazon Nova Lite model to minimize token costs
2. THE Briefing_Generator SHALL limit narrative generation to 10 insights per briefing
3. THE Briefing_Generator SHALL cache generated briefings to avoid regeneration
4. WHEN a briefing is requested multiple times in the same day, THE Briefing_UI SHALL serve the cached version
5. THE Briefing_Generator SHALL use Lambda with 512MB memory allocation
6. THE Briefing_Generator SHALL complete execution within 30 seconds to optimize Lambda costs

### Requirement 13: Accessibility Compliance

**User Story:** As a user with accessibility needs, I want the briefing UI to be keyboard navigable and screen-reader friendly, so that I can access all features.

#### Acceptance Criteria

1. THE Briefing_UI SHALL support full keyboard navigation using Tab and Enter keys
2. THE Insight_Card SHALL include ARIA labels for all interactive elements
3. THE Thought_Trace toggle SHALL announce state changes to screen readers
4. THE Growth_Play button SHALL have sufficient color contrast ratio of at least 4.5:1
5. THE Briefing_UI SHALL support focus indicators with 2px solid outline
6. WHEN using a screen reader, THE Briefing_UI SHALL announce the number of insights in the briefing
