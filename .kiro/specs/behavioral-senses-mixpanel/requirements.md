# Requirements Document

## Introduction

Behavioral Senses is a Mixpanel monitoring system that provides real-time detection of product usage signals for B2B SaaS businesses. It acts as a "Usage Sense" for the Sesari autonomous growth agent, continuously monitoring feature adoption patterns and user engagement levels to help founders and growth teams identify churn risks from declining usage and expansion opportunities from power users.

## Glossary

- **Behavioral_Senses**: The Mixpanel monitoring system that detects and processes product usage signals
- **Mixpanel_Connector**: The Lambda function that receives and processes Mixpanel webhook events
- **Feature_Adoption_Drop_Event**: A business signal indicating a user or cohort has significantly decreased usage of a specific feature
- **Power_User_Event**: A business signal indicating a user demonstrates high-frequency, consistent product usage
- **Webhook_Event**: An HTTP POST request sent by Mixpanel to notify the system of events
- **Event_Store**: The persistent storage system for processed behavioral signals
- **Mixpanel**: The product analytics platform being monitored
- **Feature**: A distinct capability or tool within the product being tracked
- **Usage_Frequency**: The count of feature interactions within a time window
- **Engagement_Score**: A calculated metric representing overall product usage intensity

## Requirements

### Requirement 1: Feature Adoption Drop Detection

**User Story:** As a SaaS founder, I want to be alerted when users stop using specific features, so that I can identify churn risks and understand which features are losing value.

#### Acceptance Criteria

1. WHEN a user's feature usage drops by 50% or more compared to their 30-day average, THE Mixpanel_Connector SHALL create a Feature_Adoption_Drop_Event
2. WHEN a user has not used a previously active feature for 14 consecutive days, THE Mixpanel_Connector SHALL create a Feature_Adoption_Drop_Event
3. THE Feature_Adoption_Drop_Event SHALL include the user identifier, feature name, previous usage frequency, current usage frequency, drop percentage, and timestamp
4. THE Mixpanel_Connector SHALL calculate usage baselines using a rolling 30-day window
5. THE Mixpanel_Connector SHALL store the Feature_Adoption_Drop_Event in the Event_Store within 5 seconds of detection

### Requirement 2: Power User Identification

**User Story:** As a growth lead, I want to identify users who engage heavily with the product, so that I can request testimonials, offer premium features, or understand what drives high engagement.

#### Acceptance Criteria

1. WHEN a user logs product events on 20 or more days within a 30-day period, THE Mixpanel_Connector SHALL create a Power_User_Event
2. WHEN a user's engagement score exceeds the 90th percentile of all active users, THE Mixpanel_Connector SHALL create a Power_User_Event
3. THE Power_User_Event SHALL include the user identifier, engagement score, days active in last 30 days, most used features, and timestamp
4. THE Mixpanel_Connector SHALL calculate engagement scores based on event frequency and feature diversity
5. THE Mixpanel_Connector SHALL store the Power_User_Event in the Event_Store within 5 seconds of detection

### Requirement 3: Webhook Security

**User Story:** As a security-conscious engineer, I want to ensure only legitimate Mixpanel webhooks are processed, so that the system is protected from malicious requests.

#### Acceptance Criteria

1. WHEN a webhook request is received, THE Mixpanel_Connector SHALL verify the Mixpanel signature using the webhook signing secret
2. IF the signature verification fails, THEN THE Mixpanel_Connector SHALL reject the request with a 401 status code and log the security violation
3. IF the webhook timestamp is older than 5 minutes, THEN THE Mixpanel_Connector SHALL reject the request to prevent replay attacks
4. THE Mixpanel_Connector SHALL retrieve the webhook signing secret from environment variables
5. THE Mixpanel_Connector SHALL log all signature verification failures with the request source IP address

### Requirement 4: Event Storage and Retrieval

**User Story:** As the Sesari agent, I want to access historical behavioral signals, so that I can analyze usage patterns and make informed growth recommendations.

#### Acceptance Criteria

1. THE Event_Store SHALL persist all Feature_Adoption_Drop_Events and Power_User_Events in DynamoDB
2. THE Event_Store SHALL index events by user identifier and timestamp for efficient retrieval
3. WHEN querying events by user, THE Event_Store SHALL return results within 200 milliseconds
4. THE Event_Store SHALL retain events for at least 90 days to support trend analysis
5. THE Event_Store SHALL support querying events by type, user, feature, and date range

### Requirement 5: Idempotent Event Processing

**User Story:** As a reliability engineer, I want duplicate webhook deliveries to be handled gracefully, so that the same event is not processed multiple times.

#### Acceptance Criteria

1. WHEN a webhook with a previously processed event identifier is received, THE Mixpanel_Connector SHALL return a 200 status code without creating a duplicate event
2. THE Mixpanel_Connector SHALL use the Mixpanel event identifier as the deduplication key
3. THE Mixpanel_Connector SHALL check for existing events before processing new webhooks
4. THE Event_Store SHALL enforce unique constraints on the Mixpanel event identifier
5. THE Mixpanel_Connector SHALL log duplicate webhook attempts for monitoring purposes

### Requirement 6: Error Handling and Retry Logic

**User Story:** As a DevOps engineer, I want the system to handle transient failures gracefully, so that temporary issues don't result in lost behavioral signals.

#### Acceptance Criteria

1. IF the Event_Store is temporarily unavailable, THEN THE Mixpanel_Connector SHALL return a 500 status code to trigger Mixpanel's retry mechanism
2. IF an unexpected error occurs during processing, THEN THE Mixpanel_Connector SHALL log the full error details and return a 500 status code
3. THE Mixpanel_Connector SHALL complete processing within 10 seconds to avoid Lambda timeout
4. IF a webhook payload cannot be parsed, THEN THE Mixpanel_Connector SHALL log the raw payload and return a 400 status code
5. THE Mixpanel_Connector SHALL implement exponential backoff when writing to the Event_Store fails

### Requirement 7: AWS Free Tier Compliance

**User Story:** As a cost-conscious founder, I want the monitoring system to operate within AWS Free Tier limits, so that infrastructure costs remain minimal.

#### Acceptance Criteria

1. THE Mixpanel_Connector SHALL use AWS Lambda with execution time optimized to stay under 1 million monthly invocations
2. THE Event_Store SHALL use DynamoDB with on-demand pricing to avoid provisioned capacity costs
3. THE Mixpanel_Connector SHALL minimize cold start time by keeping dependencies minimal
4. THE Mixpanel_Connector SHALL use environment variables for configuration to avoid additional AWS service calls
5. THE Mixpanel_Connector SHALL log only essential information to minimize CloudWatch Logs costs

### Requirement 8: Monitoring and Observability

**User Story:** As a system administrator, I want visibility into webhook processing health, so that I can detect and resolve issues quickly.

#### Acceptance Criteria

1. THE Mixpanel_Connector SHALL log each processed webhook with the event type and processing duration
2. THE Mixpanel_Connector SHALL emit CloudWatch metrics for successful events, failed events, and processing latency
3. WHEN processing fails, THE Mixpanel_Connector SHALL log the error with sufficient context for debugging
4. THE Mixpanel_Connector SHALL include the Mixpanel event identifier in all log entries for traceability
5. THE Mixpanel_Connector SHALL log a warning when processing time exceeds 5 seconds

### Requirement 9: Webhook Event Filtering

**User Story:** As a system designer, I want to process only relevant Mixpanel events, so that the system remains efficient and focused on behavioral signals.

#### Acceptance Criteria

1. THE Mixpanel_Connector SHALL process user activity events for feature adoption monitoring
2. THE Mixpanel_Connector SHALL process engagement summary events for power user identification
3. THE Mixpanel_Connector SHALL ignore events not related to behavioral signals and return a 200 status code
4. THE Mixpanel_Connector SHALL log ignored event types for monitoring and potential future expansion
5. THE Mixpanel_Connector SHALL support batch processing of multiple events in a single webhook payload

### Requirement 10: Usage Baseline Calculation

**User Story:** As a data analyst, I want accurate usage baselines calculated automatically, so that feature adoption drops are detected reliably without manual threshold configuration.

#### Acceptance Criteria

1. THE Mixpanel_Connector SHALL maintain a rolling 30-day usage history for each user-feature combination
2. THE Mixpanel_Connector SHALL calculate average usage frequency from the rolling window
3. WHEN insufficient historical data exists (less than 7 days), THE Mixpanel_Connector SHALL skip drop detection for that user-feature combination
4. THE Mixpanel_Connector SHALL update usage baselines daily using scheduled EventBridge triggers
5. THE Mixpanel_Connector SHALL store usage baselines in DynamoDB with automatic expiration after 90 days
