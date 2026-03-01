# Requirements Document: Goal Decomposition Engine

## Introduction

The Goal Decomposition Engine is a core component of Sesari that transforms high-level growth goals into actionable SMART objectives. The system leverages Amazon Nova's reasoning capabilities and Bedrock Knowledge Bases to provide context-aware decomposition that connects strategic ambitions to tactical execution. This enables lean SaaS founders and growth leads to bridge the "Execution Gap" by automatically breaking down abstract goals into measurable, time-bound objectives.

## Glossary

- **Goal_Decomposition_Engine**: The system component responsible for transforming high-level goals into SMART objectives
- **SMART_Objective**: A Specific, Measurable, Achievable, Relevant, and Time-bound objective derived from a high-level goal
- **Company_Context**: Historical data including recent metrics, past goals, and company profile retrieved from Bedrock Knowledge Bases
- **Nova**: Amazon Nova AI model used for reasoning and goal decomposition
- **Bedrock_Knowledge_Base**: AWS managed vector store containing historical company data for RAG (Retrieval-Augmented Generation)
- **Signal**: A measurable data point from integrated platforms (Stripe, HubSpot, Mixpanel) used to track objective progress
- **Decomposition_Response**: The structured JSON output containing exactly 3 SMART objectives with associated metadata

## Requirements

### Requirement 1: Goal Input Processing

**User Story:** As a SaaS founder, I want to submit high-level growth goals, so that the system can break them down into actionable objectives.

#### Acceptance Criteria

1. WHEN a user submits a goal string, THE Goal_Decomposition_Engine SHALL accept the input and initiate the decomposition process
2. WHEN a user submits an empty goal string, THE Goal_Decomposition_Engine SHALL reject the input and return a 400 error with a descriptive message
3. WHEN a user submits a goal containing only whitespace, THE Goal_Decomposition_Engine SHALL reject the input and return a 400 error with a descriptive message
4. WHEN a user submits a goal exceeding 1000 characters, THE Goal_Decomposition_Engine SHALL accept and process the input without truncation
5. WHEN a user submits a goal containing special characters or Unicode, THE Goal_Decomposition_Engine SHALL process the input correctly without encoding errors

### Requirement 2: Company Context Retrieval

**User Story:** As a growth lead, I want the system to consider my company's historical data when decomposing goals, so that objectives are relevant to my specific business context.

#### Acceptance Criteria

1. WHEN decomposing a goal, THE Goal_Decomposition_Engine SHALL query the Bedrock_Knowledge_Base using the goal string as a semantic search query
2. WHEN the Bedrock_Knowledge_Base returns results, THE Goal_Decomposition_Engine SHALL extract recent metrics, historical goals, and company profile into a Company_Context object
3. IF the Bedrock_Knowledge_Base query fails, THEN THE Goal_Decomposition_Engine SHALL log the error and continue with empty context rather than failing the entire request
4. WHEN retrieving context, THE Goal_Decomposition_Engine SHALL limit results to the top 3-5 most relevant documents to optimize token usage
5. WHEN context retrieval succeeds, THE Goal_Decomposition_Engine SHALL include all three context components (recentMetrics, historicalGoals, companyProfile) in the Nova prompt

### Requirement 3: Goal Decomposition via Nova

**User Story:** As a SaaS founder, I want the system to use AI reasoning to decompose my goals, so that I receive intelligent, context-aware SMART objectives.

#### Acceptance Criteria

1. WHEN invoking Nova, THE Goal_Decomposition_Engine SHALL construct a prompt containing the user goal, company context, and strict JSON output format instructions
2. WHEN Nova processes the request, THE Goal_Decomposition_Engine SHALL use Amazon Nova Lite model to optimize for cost-effectiveness
3. WHEN Nova returns a response, THE Goal_Decomposition_Engine SHALL receive exactly 3 SMART objectives in JSON format
4. IF Nova API fails due to timeout, THEN THE Goal_Decomposition_Engine SHALL log the error and return a 500 error with a user-friendly message
5. IF Nova API fails due to rate limiting, THEN THE Goal_Decomposition_Engine SHALL log the error and return a 500 error indicating temporary unavailability
6. WHEN constructing the prompt, THE Goal_Decomposition_Engine SHALL include instructions for creating Specific, Measurable, Achievable, Relevant, and Time-bound objectives

### Requirement 4: Response Validation

**User Story:** As a system architect, I want strict validation of AI-generated responses, so that downstream components receive reliable, well-structured data.

#### Acceptance Criteria

1. WHEN Nova returns a response, THE Goal_Decomposition_Engine SHALL validate it against a strict JSON schema before returning to the user
2. WHEN the Nova response is not valid JSON, THE Goal_Decomposition_Engine SHALL throw an error that is caught and returned as a 500 response
3. WHEN the Nova response is valid JSON but contains fewer than 3 objectives, THE Goal_Decomposition_Engine SHALL reject the response and return a validation error
4. WHEN the Nova response is valid JSON but contains more than 3 objectives, THE Goal_Decomposition_Engine SHALL reject the response and return a validation error
5. WHEN any objective is missing required fields (title, description, successThreshold, requiredSignals, strategicWhy), THE Goal_Decomposition_Engine SHALL reject the response with details about which fields are invalid
6. WHEN any objective has an empty requiredSignals array, THE Goal_Decomposition_Engine SHALL reject the response and return a validation error
7. WHEN validation succeeds, THE Goal_Decomposition_Engine SHALL return the validated Decomposition_Response object with a 200 status code

### Requirement 5: SMART Objective Structure

**User Story:** As a growth lead, I want each objective to follow the SMART framework, so that I can measure progress and hold the system accountable.

#### Acceptance Criteria

1. WHEN an objective is created, THE Goal_Decomposition_Engine SHALL ensure it contains a specific, actionable title
2. WHEN an objective is created, THE Goal_Decomposition_Engine SHALL ensure it contains a detailed description explaining what needs to be accomplished
3. WHEN an objective is created, THE Goal_Decomposition_Engine SHALL ensure it contains a measurable success threshold defining when the objective is achieved
4. WHEN an objective is created, THE Goal_Decomposition_Engine SHALL ensure it contains at least one required signal from integrated platforms (Stripe, HubSpot, Mixpanel)
5. WHEN an objective is created, THE Goal_Decomposition_Engine SHALL ensure it contains a strategic justification explaining why this objective matters for the overall goal

### Requirement 6: Signal Identification

**User Story:** As a SaaS founder, I want each objective to specify which business signals are needed, so that the system can autonomously monitor progress.

#### Acceptance Criteria

1. WHEN decomposing a goal, THE Goal_Decomposition_Engine SHALL identify relevant Stripe signals for revenue-related objectives
2. WHEN decomposing a goal, THE Goal_Decomposition_Engine SHALL identify relevant HubSpot signals for customer relationship objectives
3. WHEN decomposing a goal, THE Goal_Decomposition_Engine SHALL identify relevant Mixpanel signals for product usage objectives
4. WHEN an objective requires multiple signals, THE Goal_Decomposition_Engine SHALL include all necessary signals in the requiredSignals array
5. WHEN listing required signals, THE Goal_Decomposition_Engine SHALL use clear, descriptive signal names that map to actual platform metrics

### Requirement 7: Error Handling and Resilience

**User Story:** As a system architect, I want robust error handling throughout the decomposition flow, so that the system degrades gracefully and provides useful feedback.

#### Acceptance Criteria

1. WHEN any AWS SDK call fails, THE Goal_Decomposition_Engine SHALL log the error with sufficient detail for debugging
2. WHEN context retrieval fails, THE Goal_Decomposition_Engine SHALL continue processing with empty context rather than failing the entire request
3. WHEN Nova invocation fails, THE Goal_Decomposition_Engine SHALL return a 500 error with a user-friendly message indicating the service is temporarily unavailable
4. WHEN validation fails, THE Goal_Decomposition_Engine SHALL return a 500 error with details about what validation rules were violated
5. WHEN any unexpected error occurs, THE Goal_Decomposition_Engine SHALL catch it, log it, and return a generic 500 error to avoid exposing internal details
6. WHEN running in development mode, THE Goal_Decomposition_Engine SHALL include technical error details in the response for debugging
7. WHEN running in production mode, THE Goal_Decomposition_Engine SHALL return only user-friendly error messages without exposing internal implementation details

### Requirement 8: API Interface

**User Story:** As a frontend developer, I want a simple, well-defined API for goal decomposition, so that I can easily integrate it into the Next.js dashboard.

#### Acceptance Criteria

1. THE Goal_Decomposition_Engine SHALL expose a POST endpoint accepting JSON with a goal field
2. WHEN a request is received, THE Goal_Decomposition_Engine SHALL validate the request body contains a goal field
3. WHEN decomposition succeeds, THE Goal_Decomposition_Engine SHALL return a 200 status code with the Decomposition_Response JSON
4. WHEN decomposition fails due to client error, THE Goal_Decomposition_Engine SHALL return a 4xx status code with an error message
5. WHEN decomposition fails due to server error, THE Goal_Decomposition_Engine SHALL return a 500 status code with an error message
6. WHEN returning responses, THE Goal_Decomposition_Engine SHALL set appropriate Content-Type headers (application/json)

### Requirement 9: AWS Free Tier Compliance

**User Story:** As a cost-conscious founder, I want the system to operate within AWS Free Tier limits, so that I can minimize infrastructure costs.

#### Acceptance Criteria

1. WHEN deployed as a Lambda function, THE Goal_Decomposition_Engine SHALL be configured with 512 MB memory to balance cost and performance
2. WHEN deployed as a Lambda function, THE Goal_Decomposition_Engine SHALL have a 30-second timeout to stay within reasonable execution bounds
3. WHEN invoking Nova, THE Goal_Decomposition_Engine SHALL use Amazon Nova Lite model to minimize token costs
4. WHEN retrieving context, THE Goal_Decomposition_Engine SHALL limit Bedrock_Knowledge_Base queries to top 3-5 documents to reduce retrieval costs
5. WHEN constructing prompts, THE Goal_Decomposition_Engine SHALL use concise instructions to minimize input token usage
6. WHEN processing requests, THE Goal_Decomposition_Engine SHALL complete within 100ms average execution time to maximize free tier request capacity

### Requirement 10: Stateless Operation

**User Story:** As a system architect, I want the decomposition engine to be stateless, so that it scales horizontally and remains simple to maintain.

#### Acceptance Criteria

1. THE Goal_Decomposition_Engine SHALL not maintain any session state between requests
2. WHEN processing a request, THE Goal_Decomposition_Engine SHALL retrieve all necessary context from external sources (Bedrock_Knowledge_Base)
3. WHEN a request completes, THE Goal_Decomposition_Engine SHALL not persist any state beyond logging
4. WHEN multiple requests are processed concurrently, THE Goal_Decomposition_Engine SHALL handle each independently without shared state
5. WHEN the Lambda function is cold-started, THE Goal_Decomposition_Engine SHALL initialize AWS SDK clients and be ready to process requests

### Requirement 11: Logging and Observability

**User Story:** As a system operator, I want comprehensive logging of the decomposition process, so that I can debug issues and monitor system health.

#### Acceptance Criteria

1. WHEN a request is received, THE Goal_Decomposition_Engine SHALL log the incoming goal string (truncated if necessary)
2. WHEN context retrieval completes, THE Goal_Decomposition_Engine SHALL log the number of documents retrieved and whether the operation succeeded
3. WHEN invoking Nova, THE Goal_Decomposition_Engine SHALL log the model ID and approximate token count
4. WHEN Nova returns a response, THE Goal_Decomposition_Engine SHALL log whether the response was valid JSON
5. WHEN validation completes, THE Goal_Decomposition_Engine SHALL log whether the response passed schema validation
6. WHEN any error occurs, THE Goal_Decomposition_Engine SHALL log the error type, message, and stack trace
7. WHEN a request completes successfully, THE Goal_Decomposition_Engine SHALL log the total execution time
