# Requirements Document

## Introduction

Revenue Senses is a Stripe monitoring system that provides real-time detection of critical revenue signals for B2B SaaS businesses. It acts as a "Money Sense" for the Sesari autonomous growth agent, continuously monitoring cash flow and revenue health indicators to help founders and growth teams stay informed about expansion opportunities, churn risks, and payment issues.

## Glossary

- **Revenue_Senses**: The Stripe monitoring system that detects and processes revenue-related business signals
- **Stripe_Connector**: The Lambda function that receives and processes Stripe webhook events
- **Expansion_Event**: A business signal indicating a customer has increased their spending or upgraded their plan
- **Churn_Event**: A business signal indicating a customer has canceled their subscription
- **Failed_Payment_Event**: A business signal indicating a payment attempt has failed due to card issues
- **Webhook_Event**: An HTTP POST request sent by Stripe to notify the system of events
- **Event_Store**: The persistent storage system for processed revenue signals
- **Stripe**: The payment processing platform being monitored

## Requirements

### Requirement 1: Expansion Monitoring

**User Story:** As a SaaS founder, I want to be notified when customers upgrade their plans or increase spending, so that I can understand what's driving expansion and replicate success patterns.

#### Acceptance Criteria

1. WHEN a Stripe subscription is upgraded to a higher-value plan, THE Stripe_Connector SHALL create an Expansion_Event with the old plan value and new plan value
2. WHEN a Stripe subscription quantity increases, THE Stripe_Connector SHALL create an Expansion_Event with the old quantity and new quantity
3. WHEN a Stripe customer adds additional products or services, THE Stripe_Connector SHALL create an Expansion_Event with the additional revenue amount
4. THE Expansion_Event SHALL include the customer identifier, timestamp, old monthly recurring revenue, and new monthly recurring revenue
5. THE Stripe_Connector SHALL store the Expansion_Event in the Event_Store within 5 seconds of receiving the webhook

### Requirement 2: Churn Detection

**User Story:** As a growth lead, I want to be alerted immediately when customers cancel their subscriptions, so that I can attempt to retain them or understand why they left.

#### Acceptance Criteria

1. WHEN a Stripe subscription is canceled, THE Stripe_Connector SHALL create a Churn_Event with the cancellation reason if provided
2. WHEN a Stripe subscription reaches the end of its billing period without renewal, THE Stripe_Connector SHALL create a Churn_Event
3. THE Churn_Event SHALL include the customer identifier, subscription identifier, cancellation timestamp, monthly recurring revenue lost, and cancellation reason
4. THE Stripe_Connector SHALL store the Churn_Event in the Event_Store within 5 seconds of receiving the webhook
5. THE Churn_Event SHALL distinguish between immediate cancellations and end-of-period cancellations

### Requirement 3: Failed Payment Detection

**User Story:** As a SaaS founder, I want to know immediately when customer payments fail, so that I can proactively reach out before losing the customer to involuntary churn.

#### Acceptance Criteria

1. WHEN a Stripe payment attempt fails, THE Stripe_Connector SHALL create a Failed_Payment_Event with the failure reason
2. THE Failed_Payment_Event SHALL include the customer identifier, subscription identifier, failure timestamp, payment amount, and failure code
3. THE Stripe_Connector SHALL categorize failure reasons into card_declined, expired_card, insufficient_funds, and other
4. THE Stripe_Connector SHALL store the Failed_Payment_Event in the Event_Store within 5 seconds of receiving the webhook
5. WHEN multiple payment retries fail for the same subscription, THE Stripe_Connector SHALL create separate Failed_Payment_Events for each attempt

### Requirement 4: Webhook Security

**User Story:** As a security-conscious engineer, I want to ensure only legitimate Stripe webhooks are processed, so that the system is protected from malicious requests.

#### Acceptance Criteria

1. WHEN a webhook request is received, THE Stripe_Connector SHALL verify the Stripe signature using the webhook signing secret
2. IF the signature verification fails, THEN THE Stripe_Connector SHALL reject the request with a 401 status code and log the security violation
3. IF the webhook timestamp is older than 5 minutes, THEN THE Stripe_Connector SHALL reject the request to prevent replay attacks
4. THE Stripe_Connector SHALL retrieve the webhook signing secret from AWS Secrets Manager or environment variables
5. THE Stripe_Connector SHALL log all signature verification failures with the request source IP address

### Requirement 5: Event Storage and Retrieval

**User Story:** As the Sesari agent, I want to access historical revenue signals, so that I can analyze patterns and make informed growth recommendations.

#### Acceptance Criteria

1. THE Event_Store SHALL persist all Expansion_Events, Churn_Events, and Failed_Payment_Events in DynamoDB
2. THE Event_Store SHALL index events by customer identifier and timestamp for efficient retrieval
3. WHEN querying events by customer, THE Event_Store SHALL return results within 200 milliseconds
4. THE Event_Store SHALL retain events for at least 90 days to support trend analysis
5. THE Event_Store SHALL support querying events by type, customer, and date range

### Requirement 6: Idempotent Event Processing

**User Story:** As a reliability engineer, I want duplicate webhook deliveries to be handled gracefully, so that the same event is not processed multiple times.

#### Acceptance Criteria

1. WHEN a webhook with a previously processed event identifier is received, THE Stripe_Connector SHALL return a 200 status code without creating a duplicate event
2. THE Stripe_Connector SHALL use the Stripe event identifier as the deduplication key
3. THE Stripe_Connector SHALL check for existing events before processing new webhooks
4. THE Event_Store SHALL enforce unique constraints on the Stripe event identifier
5. THE Stripe_Connector SHALL log duplicate webhook attempts for monitoring purposes

### Requirement 7: Error Handling and Retry Logic

**User Story:** As a DevOps engineer, I want the system to handle transient failures gracefully, so that temporary issues don't result in lost revenue signals.

#### Acceptance Criteria

1. IF the Event_Store is temporarily unavailable, THEN THE Stripe_Connector SHALL return a 500 status code to trigger Stripe's retry mechanism
2. IF an unexpected error occurs during processing, THEN THE Stripe_Connector SHALL log the full error details and return a 500 status code
3. THE Stripe_Connector SHALL complete processing within 10 seconds to avoid Lambda timeout
4. IF a webhook payload cannot be parsed, THEN THE Stripe_Connector SHALL log the raw payload and return a 400 status code
5. THE Stripe_Connector SHALL implement exponential backoff when writing to the Event_Store fails

### Requirement 8: AWS Free Tier Compliance

**User Story:** As a cost-conscious founder, I want the monitoring system to operate within AWS Free Tier limits, so that infrastructure costs remain minimal.

#### Acceptance Criteria

1. THE Stripe_Connector SHALL use AWS Lambda with execution time optimized to stay under 1 million monthly invocations
2. THE Event_Store SHALL use DynamoDB with on-demand pricing to avoid provisioned capacity costs
3. THE Stripe_Connector SHALL minimize cold start time by keeping dependencies minimal
4. THE Stripe_Connector SHALL use environment variables for configuration to avoid additional AWS service calls
5. THE Stripe_Connector SHALL log only essential information to minimize CloudWatch Logs costs

### Requirement 9: Monitoring and Observability

**User Story:** As a system administrator, I want visibility into webhook processing health, so that I can detect and resolve issues quickly.

#### Acceptance Criteria

1. THE Stripe_Connector SHALL log each processed webhook with the event type and processing duration
2. THE Stripe_Connector SHALL emit CloudWatch metrics for successful events, failed events, and processing latency
3. WHEN processing fails, THE Stripe_Connector SHALL log the error with sufficient context for debugging
4. THE Stripe_Connector SHALL include the Stripe event identifier in all log entries for traceability
5. THE Stripe_Connector SHALL log a warning when processing time exceeds 5 seconds

### Requirement 10: Webhook Event Filtering

**User Story:** As a system designer, I want to process only relevant Stripe events, so that the system remains efficient and focused on revenue signals.

#### Acceptance Criteria

1. THE Stripe_Connector SHALL process customer.subscription.updated events for expansion monitoring
2. THE Stripe_Connector SHALL process customer.subscription.deleted events for churn detection
3. THE Stripe_Connector SHALL process invoice.payment_failed events for failed payment detection
4. THE Stripe_Connector SHALL ignore events not related to revenue signals and return a 200 status code
5. THE Stripe_Connector SHALL log ignored event types for monitoring and potential future expansion
