# Requirements Document

## Introduction

Relationship Senses is a HubSpot monitoring system that provides real-time detection of critical relationship signals for B2B SaaS businesses. It acts as a "Relationship Sense" for the Sesari autonomous growth agent, continuously monitoring deal progression, communication patterns, and customer sentiment to help founders and growth teams stay informed about sales opportunities, engagement risks, and relationship health.

## Glossary

- **Relationship_Senses**: The HubSpot monitoring system that detects and processes relationship-related business signals
- **HubSpot_Connector**: The Lambda function that receives and processes HubSpot webhook events
- **Deal_Progression_Event**: A business signal indicating a deal has moved forward or backward in the sales pipeline
- **Communication_Gap_Event**: A business signal indicating a significant period has passed without contact with an important customer or prospect
- **Sentiment_Event**: A business signal indicating customer sentiment has been detected from notes, emails, or interactions
- **Webhook_Event**: An HTTP POST request sent by HubSpot to notify the system of events
- **Event_Store**: The persistent storage system for processed relationship signals
- **HubSpot**: The CRM platform being monitored
- **Deal_Stage**: A position in the sales pipeline (e.g., "Qualified Lead", "Proposal Sent", "Closed Won")
- **Contact**: A person in HubSpot CRM (customer, prospect, or lead)
- **Company**: An organization in HubSpot CRM

## Requirements

### Requirement 1: Deal Stage Progression Monitoring

**User Story:** As a SaaS founder, I want to be notified when deals move through pipeline stages, so that I can understand sales velocity and identify deals that need attention.

#### Acceptance Criteria

1. WHEN a HubSpot deal moves to a more advanced stage, THE HubSpot_Connector SHALL create a Deal_Progression_Event with the old stage and new stage
2. WHEN a HubSpot deal moves backward to an earlier stage, THE HubSpot_Connector SHALL create a Deal_Progression_Event marked as regression
3. WHEN a HubSpot deal is marked as "Closed Won", THE HubSpot_Connector SHALL create a Deal_Progression_Event with the deal value and close date
4. THE Deal_Progression_Event SHALL include the deal identifier, company identifier, contact identifier, timestamp, old stage, new stage, and deal value
5. THE HubSpot_Connector SHALL store the Deal_Progression_Event in the Event_Store within 5 seconds of receiving the webhook

### Requirement 2: Communication Gap Detection

**User Story:** As a growth lead, I want to be alerted when I haven't contacted important customers or prospects recently, so that I can maintain strong relationships and prevent deals from going cold.

#### Acceptance Criteria

1. WHEN 14 days pass without a logged communication for a deal in an active stage, THE HubSpot_Connector SHALL create a Communication_Gap_Event
2. WHEN 30 days pass without a logged communication for an existing customer, THE HubSpot_Connector SHALL create a Communication_Gap_Event
3. THE Communication_Gap_Event SHALL include the contact identifier, company identifier, last communication date, days since last contact, and relationship importance level
4. THE HubSpot_Connector SHALL determine importance level based on deal value, customer lifetime value, or deal stage
5. THE HubSpot_Connector SHALL store the Communication_Gap_Event in the Event_Store within 5 seconds of detection

### Requirement 3: Customer Sentiment Detection

**User Story:** As a SaaS founder, I want to understand customer sentiment from interactions, so that I can identify at-risk relationships and expansion opportunities.

#### Acceptance Criteria

1. WHEN a HubSpot note or email contains negative sentiment indicators, THE HubSpot_Connector SHALL create a Sentiment_Event marked as negative
2. WHEN a HubSpot note or email contains positive sentiment indicators, THE HubSpot_Connector SHALL create a Sentiment_Event marked as positive
3. THE Sentiment_Event SHALL include the contact identifier, company identifier, sentiment score, sentiment category, source text excerpt, and timestamp
4. THE HubSpot_Connector SHALL categorize sentiment as positive, neutral, or negative based on keyword analysis or AI analysis
5. THE HubSpot_Connector SHALL store the Sentiment_Event in the Event_Store within 5 seconds of receiving the webhook

### Requirement 4: Webhook Security

**User Story:** As a security-conscious engineer, I want to ensure only legitimate HubSpot webhooks are processed, so that the system is protected from malicious requests.

#### Acceptance Criteria

1. WHEN a webhook request is received, THE HubSpot_Connector SHALL verify the HubSpot signature using the webhook signing secret
2. IF the signature verification fails, THEN THE HubSpot_Connector SHALL reject the request with a 401 status code and log the security violation
3. IF the webhook timestamp is older than 5 minutes, THEN THE HubSpot_Connector SHALL reject the request to prevent replay attacks
4. THE HubSpot_Connector SHALL retrieve the webhook signing secret from environment variables
5. THE HubSpot_Connector SHALL log all signature verification failures with the request source IP address

### Requirement 5: Event Storage and Retrieval

**User Story:** As the Sesari agent, I want to access historical relationship signals, so that I can analyze patterns and make informed growth recommendations.

#### Acceptance Criteria

1. THE Event_Store SHALL persist all Deal_Progression_Events, Communication_Gap_Events, and Sentiment_Events in DynamoDB
2. THE Event_Store SHALL index events by company identifier and timestamp for efficient retrieval
3. WHEN querying events by company, THE Event_Store SHALL return results within 200 milliseconds
4. THE Event_Store SHALL retain events for at least 90 days to support trend analysis
5. THE Event_Store SHALL support querying events by type, company, contact, and date range

### Requirement 6: Idempotent Event Processing

**User Story:** As a reliability engineer, I want duplicate webhook deliveries to be handled gracefully, so that the same event is not processed multiple times.

#### Acceptance Criteria

1. WHEN a webhook with a previously processed event identifier is received, THE HubSpot_Connector SHALL return a 200 status code without creating a duplicate event
2. THE HubSpot_Connector SHALL use the HubSpot event identifier as the deduplication key
3. THE HubSpot_Connector SHALL check for existing events before processing new webhooks
4. THE Event_Store SHALL enforce unique constraints on the HubSpot event identifier
5. THE HubSpot_Connector SHALL log duplicate webhook attempts for monitoring purposes

### Requirement 7: Error Handling and Retry Logic

**User Story:** As a DevOps engineer, I want the system to handle transient failures gracefully, so that temporary issues don't result in lost relationship signals.

#### Acceptance Criteria

1. IF the Event_Store is temporarily unavailable, THEN THE HubSpot_Connector SHALL return a 500 status code to trigger HubSpot's retry mechanism
2. IF an unexpected error occurs during processing, THEN THE HubSpot_Connector SHALL log the full error details and return a 500 status code
3. THE HubSpot_Connector SHALL complete processing within 10 seconds to avoid Lambda timeout
4. IF a webhook payload cannot be parsed, THEN THE HubSpot_Connector SHALL log the raw payload and return a 400 status code
5. THE HubSpot_Connector SHALL implement exponential backoff when writing to the Event_Store fails

### Requirement 8: AWS Free Tier Compliance

**User Story:** As a cost-conscious founder, I want the monitoring system to operate within AWS Free Tier limits, so that infrastructure costs remain minimal.

#### Acceptance Criteria

1. THE HubSpot_Connector SHALL use AWS Lambda with execution time optimized to stay under 1 million monthly invocations
2. THE Event_Store SHALL use DynamoDB with on-demand pricing to avoid provisioned capacity costs
3. THE HubSpot_Connector SHALL minimize cold start time by keeping dependencies minimal
4. THE HubSpot_Connector SHALL use environment variables for configuration to avoid additional AWS service calls
5. THE HubSpot_Connector SHALL log only essential information to minimize CloudWatch Logs costs

### Requirement 9: Monitoring and Observability

**User Story:** As a system administrator, I want visibility into webhook processing health, so that I can detect and resolve issues quickly.

#### Acceptance Criteria

1. THE HubSpot_Connector SHALL log each processed webhook with the event type and processing duration
2. THE HubSpot_Connector SHALL emit CloudWatch metrics for successful events, failed events, and processing latency
3. WHEN processing fails, THE HubSpot_Connector SHALL log the error with sufficient context for debugging
4. THE HubSpot_Connector SHALL include the HubSpot event identifier in all log entries for traceability
5. THE HubSpot_Connector SHALL log a warning when processing time exceeds 5 seconds

### Requirement 10: Webhook Event Filtering

**User Story:** As a system designer, I want to process only relevant HubSpot events, so that the system remains efficient and focused on relationship signals.

#### Acceptance Criteria

1. THE HubSpot_Connector SHALL process deal.propertyChange events for deal stage progression monitoring
2. THE HubSpot_Connector SHALL process engagement.created events for communication tracking
3. THE HubSpot_Connector SHALL process note.created events for sentiment detection
4. THE HubSpot_Connector SHALL ignore events not related to relationship signals and return a 200 status code
5. THE HubSpot_Connector SHALL log ignored event types for monitoring and potential future expansion
