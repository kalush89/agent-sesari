# Requirements Document: Dynamic ICP Refinement Engine

## Feature Overview

The Dynamic ICP Refinement Engine autonomously analyzes customer data from HubSpot, Mixpanel, and Stripe to identify high-value customer traits and automatically update Sesari's Ideal Customer Profile. The system runs on a 7-day cycle, correlating LTV, product engagement, and retention signals to surface actionable insights about which customer segments drive the most value.

## User Stories

### US-1: Automated ICP Analysis
**As a** SaaS founder  
**I want** the system to automatically analyze my customer base every 7 days  
**So that** I always have an up-to-date understanding of which customer segments are most valuable

### US-2: Multi-Source Data Correlation
**As a** growth lead  
**I want** customer data from HubSpot, Mixpanel, and Stripe to be correlated automatically  
**So that** I can see a complete picture of customer value across sales, product, and revenue metrics

### US-3: Privacy-Preserving Analysis
**As a** SaaS founder concerned about data privacy  
**I want** personal information stripped before AI analysis  
**So that** I can use AI insights while maintaining customer privacy and compliance

### US-4: Explainable ICP Updates
**As a** growth lead  
**I want** to understand why the ICP changed  
**So that** I can trust the system's recommendations and explain them to my team

### US-5: Knowledge Base Integration
**As a** Sesari agent  
**I want** the updated ICP profile stored in my Knowledge Base  
**So that** I can use the latest ICP to inform growth plays and recommendations

## Functional Requirements (EARS Notation)

### 1. Data Collection

#### 1.1 HubSpot Integration
**WHEN** the ICP refinement cycle starts, **THE SYSTEM SHALL** fetch all company records from HubSpot including industry, employee count, region, and total revenue (LTV).

**Acceptance Criteria:**
- System retrieves company ID, name, industry, employee count, region, and total revenue
- System handles pagination for large datasets (>100 companies)
- System implements retry logic with exponential backoff for API failures
- System aborts analysis if HubSpot data cannot be retrieved after 3 retries

#### 1.2 Mixpanel Integration
**WHEN** HubSpot company data is retrieved, **THE SYSTEM SHALL** fetch corresponding Mixpanel cohort data including 'Aha! Moment' event frequency and 30-day retention rates.

**Acceptance Criteria:**
- System queries Mixpanel using company identifiers
- System retrieves event counts for configured 'Aha! Moment' events
- System calculates 30-day retention rate for each company
- System continues analysis with null values if Mixpanel data is unavailable

#### 1.3 Stripe Integration
**WHEN** company data is being collected, **THE SYSTEM SHALL** fetch Stripe customer records to identify churn signals (cancelled subscriptions or failed payments).

**Acceptance Criteria:**
- System retrieves subscription status and payment history
- System identifies churn signals: cancelled subscriptions or payment failures
- System retrieves MRR (Monthly Recurring Revenue) for each customer
- System continues analysis with null values if Stripe data is unavailable

#### 1.4 Batch Processing
**WHERE** API rate limits exist, **THE SYSTEM SHALL** process data in batches with appropriate delays to stay within rate limits.

**Acceptance Criteria:**
- HubSpot: 100 companies per batch, 1-second delay between batches
- Mixpanel: 50 companies per batch, 500ms delay between batches
- Stripe: 100 customers per batch, 1-second delay between batches
- System logs batch progress for monitoring

### 2. Data Correlation

#### 2.1 Cross-Platform Joining
**WHEN** data from all sources is collected, **THE SYSTEM SHALL** correlate records using company identifiers to create unified customer profiles.

**Acceptance Criteria:**
- System uses HubSpot company ID as primary key
- System performs left join with Mixpanel and Stripe data
- System creates one CorrelatedCustomer record per HubSpot company
- System handles missing Mixpanel or Stripe data with null values

#### 2.2 Data Completeness Tracking
**WHEN** correlating data, **THE SYSTEM SHALL** track which data sources are available for each customer.

**Acceptance Criteria:**
- System records data completeness metrics (% with Mixpanel, % with Stripe)
- System includes completeness metrics in analysis record
- System logs warnings for customers with incomplete data

### 3. Customer Scoring

#### 3.1 Ideal Customer Score Calculation
**WHEN** customer data is correlated, **THE SYSTEM SHALL** calculate an Ideal Customer Score (0-100) based on LTV, engagement, and retention.

**Acceptance Criteria:**
- System calculates LTV score from HubSpot total revenue (40% weight)
- System calculates engagement score from Mixpanel 'Aha! Moment' frequency (30% weight)
- System calculates retention score from Mixpanel retention rate and Stripe churn signals (30% weight)
- System produces scores in range [0, 100] for all components
- System uses default values (0) for missing data points

#### 3.2 Score Normalization
**WHEN** calculating component scores, **THE SYSTEM SHALL** normalize values to 0-100 scale using percentile ranking.

**Acceptance Criteria:**
- LTV score: Percentile rank of total revenue across all customers
- Engagement score: Percentile rank of 'Aha! Moment' event count
- Retention score: Combination of retention rate percentile and churn penalty
- System handles edge cases (all zeros, single customer) without errors

#### 3.3 Churn Signal Penalty
**WHEN** a customer has a churn signal from Stripe, **THE SYSTEM SHALL** apply a penalty to the retention score.

**Acceptance Criteria:**
- Churn signal reduces retention score by 50 points
- Customers with churn signals always score lower than identical customers without churn
- System logs churn signal count for monitoring

#### 3.4 Score Breakdown Storage
**WHEN** calculating the Ideal Customer Score, **THE SYSTEM SHALL** store the breakdown of component scores for transparency.

**Acceptance Criteria:**
- System stores ltvScore, engagementScore, retentionScore separately
- System stores final idealCustomerScore
- Breakdown is available for audit and debugging

### 4. Top Customer Selection

#### 4.1 Percentile Filtering
**WHEN** all customers are scored, **THE SYSTEM SHALL** select the top 10% by Ideal Customer Score for trait analysis.

**Acceptance Criteria:**
- System sorts customers by idealCustomerScore descending
- System selects top ceil(N * 0.10) customers where N is total count
- System requires minimum 20 customers in dataset (configurable)
- System aborts analysis if fewer than minimum sample size

#### 4.2 Sample Size Validation
**WHEN** selecting top customers, **THE SYSTEM SHALL** validate that the sample size is sufficient for reliable analysis.

**Acceptance Criteria:**
- System checks that top 10% contains at least 5 customers
- System aborts with error if sample size too small
- System logs sample size in analysis record

### 5. Data Privacy

#### 5.1 PII Masking
**BEFORE** sending customer data to the LLM, **THE SYSTEM SHALL** strip all personally identifiable information.

**Acceptance Criteria:**
- System removes all email addresses (validated by regex)
- System removes company names (keeps industry only)
- System removes personal names and contact information
- System replaces exact revenue with buckets: "<$10K", "$10K-$50K", "$50K-$100K", ">$100K"
- System replaces exact employee counts with ranges: "1-10", "11-50", "51-200", "200+"
- System keeps: industry, size range, region, aggregated metrics

#### 5.2 PII Detection Validation
**WHEN** masking data, **THE SYSTEM SHALL** validate that no PII remains in the masked output.

**Acceptance Criteria:**
- System runs regex checks for email patterns
- System runs regex checks for phone number patterns
- System logs warning if potential PII detected after masking
- System aborts LLM analysis if PII validation fails

#### 5.3 Audit Trail
**WHEN** masking data, **THE SYSTEM SHALL** log which fields were masked for audit purposes.

**Acceptance Criteria:**
- System logs count of emails removed
- System logs count of names removed
- System never logs actual PII values in CloudWatch

### 6. Trait Analysis

#### 6.1 LLM-Based Trait Identification
**WHEN** top customers are selected and masked, **THE SYSTEM SHALL** use Amazon Nova Lite to identify common traits.

**Acceptance Criteria:**
- System sends masked customer data to Nova Lite
- System requests identification of: common industries, size range, regions, usage patterns
- System receives structured JSON response with traits
- System retries once on API failure with 5-second delay

#### 6.2 Reasoning Generation
**WHEN** analyzing traits, **THE SYSTEM SHALL** generate natural language reasoning explaining the identified patterns.

**Acceptance Criteria:**
- Reasoning explains why each trait was identified
- Reasoning includes quantitative support (e.g., "40% higher retention")
- Reasoning compares to previous ICP if available
- Reasoning is stored in ICP profile for explainability

#### 6.3 Confidence Scoring
**WHEN** Nova Lite analyzes traits, **THE SYSTEM SHALL** include a confidence score (0-100) in the output.

**Acceptance Criteria:**
- System requests confidence score from Nova Lite
- System flags analysis as uncertain if confidence < 50
- System includes confidence score in ICP profile
- System logs low confidence warnings

#### 6.4 Fallback Analysis
**IF** Nova Lite API fails after retry, **THE SYSTEM SHALL** use a heuristic fallback to identify basic traits.

**Acceptance Criteria:**
- Fallback calculates mode for industry and region
- Fallback calculates median for size range
- Fallback marks analysis as "degraded" in metadata
- System logs that LLM analysis was unavailable

### 7. Knowledge Base Update

#### 7.1 ICP Profile Storage
**WHEN** trait analysis completes, **THE SYSTEM SHALL** write the updated ICP profile to the Bedrock Knowledge Base.

**Acceptance Criteria:**
- System formats profile as markdown in `icp_profile.md`
- Profile includes: version number, timestamp, traits, reasoning, confidence
- System increments version number from previous profile
- System retries Knowledge Base update 3 times with exponential backoff

#### 7.2 Profile Versioning
**WHEN** updating the ICP profile, **THE SYSTEM SHALL** maintain strict version numbering.

**Acceptance Criteria:**
- Version numbers are monotonically increasing integers
- No version gaps or duplicates
- System reads previous version before incrementing
- First profile starts at version 1

#### 7.3 Markdown Formatting
**WHEN** writing the ICP profile, **THE SYSTEM SHALL** format it for human readability.

**Acceptance Criteria:**
- Profile includes metadata header with version and timestamp
- Traits are formatted as bullet lists
- Reasoning is in paragraph format
- Confidence score is clearly displayed
- Sample size is included

### 8. Analysis History

#### 8.1 DynamoDB Storage
**WHEN** analysis completes, **THE SYSTEM SHALL** store the complete analysis record in DynamoDB.

**Acceptance Criteria:**
- Record includes: timestamp, version, profile, top customer IDs, score distribution
- Record includes execution metrics: duration, customer count, API call count
- System uses ISO timestamp as partition key
- System retries DynamoDB write once on failure

#### 8.2 Historical Tracking
**WHEN** storing analysis records, **THE SYSTEM SHALL** enable querying of ICP evolution over time.

**Acceptance Criteria:**
- Records are queryable by timestamp range
- Records include previous version reference for comparison
- System stores score distribution statistics (min, max, mean, p90)

### 9. Scheduling

#### 9.1 EventBridge Trigger
**THE SYSTEM SHALL** be triggered by EventBridge on a 7-day schedule.

**Acceptance Criteria:**
- EventBridge rule configured with "rate(7 days)" expression
- Rule targets the ICP refinement Lambda function
- Rule is enabled by default
- System logs each scheduled invocation

#### 9.2 Manual Trigger Support
**THE SYSTEM SHALL** support manual triggering for testing and immediate updates.

**Acceptance Criteria:**
- Lambda can be invoked directly via AWS console or CLI
- Manual invocations are logged with "manual" trigger type
- Manual invocations follow same execution path as scheduled

### 10. Error Handling

#### 10.1 Critical Failure Handling
**IF** HubSpot API fails after all retries, **THE SYSTEM SHALL** abort the analysis and alert operators.

**Acceptance Criteria:**
- System logs error with full context
- System sends CloudWatch alarm
- System does not update Knowledge Base with partial data
- System exits with non-zero status code

#### 10.2 Degraded Operation
**IF** Mixpanel or Stripe APIs fail, **THE SYSTEM SHALL** continue with available data and mark analysis as degraded.

**Acceptance Criteria:**
- System logs warning about missing data source
- System includes data completeness metric in analysis record
- System proceeds with scoring using default values for missing data
- Analysis record flagged as "degraded"

#### 10.3 Insufficient Data Handling
**IF** fewer than minimum sample size customers exist, **THE SYSTEM SHALL** abort analysis with diagnostic information.

**Acceptance Criteria:**
- System checks sample size before trait analysis
- System logs current count and minimum required
- System does not update Knowledge Base
- System returns error response with details

### 11. Monitoring

#### 11.1 CloudWatch Metrics
**WHEN** analysis runs, **THE SYSTEM SHALL** publish custom CloudWatch metrics.

**Acceptance Criteria:**
- Metric: ICPAnalysisSuccess (1 for success, 0 for failure)
- Metric: CustomersAnalyzed (count)
- Metric: AnalysisDurationMs (execution time)
- Metric: ICPConfidenceScore (0-100)
- Metrics published even on failure (where applicable)

#### 11.2 CloudWatch Alarms
**THE SYSTEM SHALL** have CloudWatch alarms configured for critical conditions.

**Acceptance Criteria:**
- Alarm: 2 consecutive analysis failures
- Alarm: Confidence score < 50
- Alarm: Sample size below minimum
- Alarms trigger SNS notifications

#### 11.3 Structured Logging
**WHEN** executing, **THE SYSTEM SHALL** log all operations with structured data.

**Acceptance Criteria:**
- Logs include correlation ID for tracing
- Logs use appropriate levels: INFO, WARN, ERROR
- Logs never contain PII
- Logs include execution phase for debugging

## Non-Functional Requirements

### NFR-1: Performance
**THE SYSTEM SHALL** complete analysis within 15 minutes to stay within Lambda timeout limits.

**Acceptance Criteria:**
- Average execution time < 10 minutes for 500 customers
- Batch processing prevents timeout
- System logs execution time for monitoring

### NFR-2: Cost Efficiency
**THE SYSTEM SHALL** operate within AWS Free Tier limits.

**Acceptance Criteria:**
- Lambda invocations: 4 per month (well within 1M free tier)
- Lambda execution time: < 15 minutes per run
- DynamoDB: On-demand pricing, minimal storage
- Bedrock: Nova Lite model for cost-effective reasoning
- No "always-on" infrastructure

### NFR-3: Reliability
**THE SYSTEM SHALL** have 95% success rate for scheduled analyses.

**Acceptance Criteria:**
- Retry logic for transient failures
- Graceful degradation for non-critical failures
- Comprehensive error handling
- Monitoring and alerting for failures

### NFR-4: Security
**THE SYSTEM SHALL** follow AWS security best practices.

**Acceptance Criteria:**
- IAM role with least-privilege permissions
- API keys stored in AWS Secrets Manager
- No credentials in code or logs
- DynamoDB encryption at rest
- All API calls over HTTPS

### NFR-5: Maintainability
**THE SYSTEM SHALL** be easy to understand and modify.

**Acceptance Criteria:**
- Functions follow single responsibility principle
- Functions under 20 lines where possible
- JSDoc comments on all functions
- Clear separation of concerns
- Minimal dependencies

### NFR-6: Testability
**THE SYSTEM SHALL** be thoroughly testable with both unit and property-based tests.

**Acceptance Criteria:**
- All core functions have unit tests
- All correctness properties have property-based tests
- Integration tests with mocked APIs
- Test coverage > 80%

## Constraints

### Technical Constraints
- Must use AWS Lambda (serverless, no EC2)
- Must use Amazon Bedrock Nova Lite (cost-effective)
- Must stay within AWS Free Tier limits
- Must complete within 15-minute Lambda timeout
- Must respect API rate limits for all integrations

### Privacy Constraints
- Must strip all PII before LLM analysis
- Must comply with GDPR/CCPA data handling
- Must not log sensitive customer data
- Must provide audit trail for data processing

### Business Constraints
- Must run on 7-day cycle (not more frequent)
- Must require minimum 20 customers for analysis
- Must provide explainable reasoning for ICP changes
- Must integrate with existing Bedrock Knowledge Base

## Dependencies

### External Services
- HubSpot API (Companies, Deals)
- Mixpanel API (Cohorts, Events)
- Stripe API (Customers, Subscriptions)

### AWS Services
- AWS Lambda
- Amazon EventBridge
- Amazon DynamoDB
- Amazon Bedrock (Nova Lite)
- Amazon Bedrock Knowledge Bases
- AWS CloudWatch
- AWS Secrets Manager
- AWS IAM

### Development Dependencies
- Node.js 18.x runtime
- TypeScript
- AWS SDK v3
- fast-check (property-based testing)
- Jest (unit testing)

## Success Metrics

### Functional Success
- Analysis completes successfully on schedule (95% success rate)
- ICP profile updates reflect actual high-value customer traits
- Knowledge Base integration works seamlessly
- No PII leaks to LLM or logs

### Business Success
- Growth plays informed by updated ICP show improved conversion rates
- Founders report increased confidence in customer targeting
- System identifies ICP shifts before manual analysis would

### Technical Success
- Execution time stays under 10 minutes average
- Costs stay within AWS Free Tier
- No critical failures requiring manual intervention
- Test coverage > 80%

## Out of Scope

The following are explicitly out of scope for this feature:

- Real-time ICP updates (only 7-day cycle)
- Multi-dimensional ICP profiles (single unified profile only)
- Predictive churn scoring (only historical churn signals)
- A/B testing framework for growth plays
- Custom scoring weight configuration UI (hardcoded weights)
- Integration with platforms beyond HubSpot, Mixpanel, Stripe
- Historical trend visualization (data stored but not visualized)

## Glossary

- **ICP**: Ideal Customer Profile - description of the customer segment most likely to derive value from the product
- **LTV**: Lifetime Value - total revenue generated by a customer
- **Aha! Moment**: Key product event indicating user has experienced core value
- **Churn Signal**: Indicator that a customer may cancel (e.g., failed payment, subscription cancellation)
- **EARS Notation**: Easy Approach to Requirements Syntax - structured format for writing requirements
- **PII**: Personally Identifiable Information - data that can identify an individual
- **Property-Based Testing**: Testing approach that verifies properties hold across all inputs
