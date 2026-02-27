---
inclusion: always
---

# Technology Stack

## AWS Free Tier Compliance

All technology choices must strictly comply with AWS Free Tier limits to minimize costs.

## Stack Components

### Frontend
- **Next.js (App Router)**: Modern React framework with server-side rendering and API routes

### AI
- **Amazon Bedrock**: Managed AI service
- **Amazon Nova Models**: Cost-effective AI models for reasoning tasks

### Backend
- **AWS Lambda**: Serverless compute for event-driven functions

### Automation
- **AWS EventBridge**: Scheduled triggers for the agent's "heartbeat" and event-driven workflows

### Database
- **Amazon Aurora Serverless** or **Amazon DynamoDB**: Serverless database options that scale to zero

### RAG (Retrieval-Augmented Generation)
- **Amazon Bedrock Knowledge Bases**: Managed vector store and retrieval system

## Critical Constraint

**Strictly avoid:**
- "Always-on" EC2 instances
- Expensive non-free-tier services
- Any infrastructure that incurs costs when idle
