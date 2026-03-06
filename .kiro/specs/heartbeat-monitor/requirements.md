# Requirements Document

## Introduction

The Heartbeat Monitor runs daily via EventBridge to ensure all scheduled Lambda functions execute correctly. It detects failures, generates AI health reports, and displays system status in a dashboard.

## Glossary

- **Heartbeat_Monitor**: EventBridge-scheduled Lambda that monitors all scheduled jobs
- **Execution_Record**: DynamoDB record tracking job execution status and duration
- **Health_Report**: Daily AI-generated summary of system health
- **Critical_Job**: Job requiring immediate alert on failure (Growth Plays, Daily Briefing)

## Requirements

### Requirement 1: Track Job Executions

**User Story:** As a SaaS founder, I want the system to track all scheduled job executions automatically.

#### Acceptance Criteria

1. WHEN a scheduled job completes, IT SHALL write an Execution_Record to DynamoDB with job name, timestamp, status, duration, and error details
2. THE Heartbeat_Monitor SHALL run daily at 9 AM UTC via EventBridge
3. THE Heartbeat_Monitor SHALL query all Execution_Records from the past 24 hours

### Requirement 2: Detect Failures

**User Story:** As a SaaS founder, I want to be alerted when critical processes fail.

#### Acceptance Criteria

1. IF a Critical_Job has no execution within 24 hours, THE Heartbeat_Monitor SHALL mark it as "missing"
2. IF a Critical_Job has status "failure", THE Heartbeat_Monitor SHALL mark it as "failed"
3. WHEN a Critical_Job is marked as "failed" or "missing", THE Heartbeat_Monitor SHALL create an alert

### Requirement 3: Generate Health Reports

**User Story:** As a SaaS founder, I want a daily summary of system health.

#### Acceptance Criteria

1. THE Heartbeat_Monitor SHALL invoke Bedrock Nova Lite to generate a Health_Report
2. THE Health_Report SHALL include overall status and job-by-job summary
3. THE Heartbeat_Monitor SHALL store the Health_Report in DynamoDB

### Requirement 4: Display Health Dashboard

**User Story:** As a SaaS founder, I want to see the current health status of all automated processes.

#### Acceptance Criteria

1. THE Health_Dashboard SHALL display current status for all monitored jobs
2. THE Health_Dashboard SHALL show last execution timestamp and 7-day success rate
3. THE Health_Dashboard SHALL display the most recent Health_Report
4. THE Health_Dashboard SHALL use Sesari UI standards (#FAFAFA background, Inter font)

### Requirement 5: Self-Monitor

**User Story:** As a SaaS founder, I want the monitoring system to detect if it fails.

#### Acceptance Criteria

1. THE Heartbeat_Monitor SHALL write its own Execution_Record after each run
2. THE Heartbeat_Monitor SHALL use CloudWatch alarms to detect its own failures
3. IF the Heartbeat_Monitor fails, CloudWatch SHALL send an SNS notification
