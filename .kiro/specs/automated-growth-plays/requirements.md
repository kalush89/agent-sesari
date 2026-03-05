# Requirements Document

## Introduction

The Automated Growth Plays feature enables Sesari to proactively detect at-risk customers by correlating signals across multiple integrated platforms (Mixpanel, HubSpot, and Stripe). When patterns indicate potential churn, the system automatically drafts actionable communications that users can review and approve with one click, bridging the execution gap between insight and action.

## Glossary

- **Growth_Play**: A system-generated, actionable recommendation consisting of a risk insight and a drafted communication (email or Slack message) ready for user approval
- **Signal_Correlator**: The component that combines behavioral, relationship, and revenue data to detect at-risk customer patterns
- **Risk_Pattern**: A specific combination of signals that indicates potential customer churn (e.g., low usage + upcoming renewal)
- **Draft_Generator**: The component that creates context-aware email or Slack message drafts using Amazon Bedrock
- **Approval_Workflow**: The user interface and backend process for reviewing and executing Growth Plays
- **Signal_Connector**: Lambda functions that retrieve data from integrated platforms (Mixpanel, HubSpot, Stripe)
- **Execution_Engine**: The component that sends approved communications via email or Slack

## Requirements

### Requirement 1: Cross-Signal Correlation

**User Story:** As a SaaS founder, I want the system to detect at-risk customers by analyzing patterns across multiple platforms, so that I can intervene before they churn.

#### Acceptance Criteria

1. WHEN Signal_Connectors retrieve data from Mixpanel, HubSpot, and Stripe, THE Signal_Correlator SHALL combine the data into a unified customer risk profile
2. THE Signal_Correlator SHALL identify customers with usage decline greater than 50% over the last 30 days
3. THE Signal_Correlator SHALL identify customers with contract renewals within 30 days
4. WHEN a customer has both usage decline and upcoming renewal, THE Signal_Correlator SHALL flag the customer as high-risk
5. THE Signal_Correlator SHALL calculate a risk score between 0 and 100 for each customer based on signal strength
6. FOR ALL risk calculations, THE Signal_Correlator SHALL store intermediate signal values and the final risk score for auditability

### Requirement 2: Proactive Risk Detection

**User Story:** As a growth lead, I want to be notified of at-risk customers before they churn, so that I have time to take preventive action.

#### Acceptance Criteria

1. WHEN the Signal_Correlator identifies a high-risk customer (risk score above 70), THE System SHALL create a Growth_Play within 5 minutes
2. THE System SHALL detect risk patterns at least once every 24 hours via EventBridge scheduled triggers
3. WHEN multiple risk patterns are detected for the same customer, THE System SHALL create a single Growth_Play with the highest priority pattern
4. THE System SHALL store all detected risk patterns in DynamoDB with timestamps for historical analysis
5. IF a customer's risk score drops below 50, THEN THE System SHALL mark any pending Growth_Plays for that customer as resolved

### Requirement 3: Automated Action Drafting

**User Story:** As a SaaS founder, I want the system to draft personalized communications for at-risk customers, so that I can quickly review and send them without writing from scratch.

#### Acceptance Criteria

1. WHEN a Growth_Play is created, THE Draft_Generator SHALL generate a communication draft within 10 seconds using Amazon Bedrock Nova Lite
2. THE Draft_Generator SHALL include the customer name, specific risk signals, and a relevant call-to-action in the draft
3. THE Draft_Generator SHALL support both email and Slack message formats
4. THE Draft_Generator SHALL use a professional, empathetic tone aligned with B2B SaaS communication standards
5. WHEN generating drafts, THE Draft_Generator SHALL include a "Thought Trace" section explaining which signals triggered the draft
6. THE Draft_Generator SHALL limit email drafts to 200 words and Slack messages to 100 words for readability

### Requirement 4: Parser and Serializer for Growth Plays

**User Story:** As a developer, I want to reliably parse and serialize Growth Play data, so that the system can store and retrieve Growth Plays without data corruption.

#### Acceptance Criteria

1. WHEN a Growth_Play is created, THE Growth_Play_Parser SHALL parse the data structure into a typed Growth_Play object
2. WHEN storing a Growth_Play, THE Growth_Play_Serializer SHALL serialize the object into JSON format for DynamoDB storage
3. THE Growth_Play_Pretty_Printer SHALL format Growth_Play objects into human-readable JSON with proper indentation
4. FOR ALL valid Growth_Play objects, parsing then printing then parsing SHALL produce an equivalent object (round-trip property)
5. WHEN invalid Growth_Play data is provided, THE Growth_Play_Parser SHALL return a descriptive error message indicating which field is invalid

### Requirement 5: Human-in-the-Loop Approval

**User Story:** As a SaaS founder, I want to review all automated communications before they are sent, so that I maintain control over customer interactions.

#### Acceptance Criteria

1. THE Approval_Workflow SHALL display all pending Growth_Plays in the dashboard feed with "Approve & Send" and "Dismiss" buttons
2. WHEN a user clicks "Approve & Send", THE Approval_Workflow SHALL mark the Growth_Play as approved and trigger the Execution_Engine within 5 seconds
3. WHEN a user clicks "Dismiss", THE Approval_Workflow SHALL mark the Growth_Play as dismissed and remove it from the pending list
4. THE Approval_Workflow SHALL allow users to edit the draft before approval
5. WHEN a draft is edited, THE System SHALL preserve the original draft and store the edited version separately for comparison
6. THE Approval_Workflow SHALL display the "Thought Trace" in a collapsible section showing which signals triggered the Growth_Play

### Requirement 6: One-Click Execution

**User Story:** As a growth lead, I want to send approved communications with one click, so that I can act quickly on at-risk customer insights.

#### Acceptance Criteria

1. WHEN a Growth_Play is approved, THE Execution_Engine SHALL send the communication within 10 seconds
2. WHERE the communication type is email, THE Execution_Engine SHALL send the email via AWS SES
3. WHERE the communication type is Slack, THE Execution_Engine SHALL send the message via Slack API
4. WHEN the communication is sent successfully, THE Execution_Engine SHALL update the Growth_Play status to "executed" with a timestamp
5. IF the communication fails to send, THEN THE Execution_Engine SHALL retry up to 3 times with exponential backoff
6. IF all retries fail, THEN THE Execution_Engine SHALL mark the Growth_Play as "failed" and log the error for user notification

### Requirement 7: AWS Free Tier Compliance

**User Story:** As a SaaS founder, I want the system to operate within AWS Free Tier limits, so that I can minimize infrastructure costs.

#### Acceptance Criteria

1. THE System SHALL use AWS Lambda for all compute operations to avoid always-on EC2 costs
2. THE System SHALL use Amazon Bedrock Nova Lite for draft generation to minimize token costs
3. THE System SHALL use DynamoDB for Growth_Play storage with on-demand billing to scale to zero when idle
4. THE System SHALL batch Signal_Connector invocations to minimize Lambda execution count
5. THE System SHALL cache customer risk profiles for 1 hour to reduce redundant API calls to integrated platforms
6. THE System SHALL optimize Lambda memory allocation to complete executions within 512MB to stay within free tier limits

### Requirement 8: Audit Trail and Explainability

**User Story:** As a SaaS founder, I want to understand why the system recommended each Growth_Play, so that I can trust the system's decisions and learn from patterns.

#### Acceptance Criteria

1. THE System SHALL store all signal values used in risk calculation for each Growth_Play
2. THE System SHALL display the "Thought Trace" showing which signals contributed to the risk score and their weights
3. THE System SHALL track user actions (approve, dismiss, edit) with timestamps for each Growth_Play
4. THE System SHALL calculate and display the success rate of executed Growth_Plays (e.g., customer retained vs churned)
5. WHEN a user views a Growth_Play, THE System SHALL display the complete audit trail including signal sources, risk calculation, draft generation, and execution status
6. THE System SHALL retain audit data for at least 90 days for compliance and analysis purposes
