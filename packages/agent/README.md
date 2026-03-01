# @sesari/agent

Core Bedrock Agent logic and orchestration for the Sesari autonomous growth agent.

## Goal Decomposition Engine

Transforms high-level growth goals into actionable SMART objectives using Amazon Nova and Bedrock Knowledge Bases.

### Setup

1. Copy `.env.example` to `.env` and configure:
   - `AWS_REGION`: Your AWS region (e.g., us-east-1)
   - `KNOWLEDGE_BASE_ID`: Your Bedrock Knowledge Base ID
   - `NOVA_MODEL_ID`: Amazon Nova model ID (e.g., amazon.nova-lite-v1:0)
   - `NODE_ENV`: development or production

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run tests:
   ```bash
   npm test
   ```

### Environment Variables

The Goal Decomposition Engine requires the following environment variables:

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `AWS_REGION` | AWS region for Bedrock services | `us-east-1` | Yes |
| `KNOWLEDGE_BASE_ID` | Bedrock Knowledge Base ID for company context retrieval | `ABC123XYZ` | Yes |
| `NOVA_MODEL_ID` | Amazon Nova model identifier for goal decomposition | `amazon.nova-lite-v1:0` | Yes |
| `NODE_ENV` | Environment mode (affects error detail visibility) | `development` or `production` | Yes |

**Environment Validation:**

The system validates all required environment variables at startup. If any variable is missing or empty, the application will throw an error with details about which variables are missing.

```typescript
import { validateEnvironment, getEnvironmentConfig } from '@sesari/agent';

// Validate environment at startup
const config = validateEnvironment();

// Or use cached config
const config = getEnvironmentConfig();
```

### Project Structure

```
src/
  goal-decomposition/
    types.ts          # Core TypeScript interfaces
    clients.ts        # AWS SDK client configuration
    index.ts          # Public exports
```

### Requirements

- Node.js 20+
- AWS credentials configured (IAM role or environment variables)
- Bedrock Knowledge Base set up with company context
- IAM permissions (see IAM Permissions section below)

### IAM Permissions

The Goal Decomposition Engine requires specific IAM permissions to interact with AWS Bedrock services.

#### Required Permissions

**1. Bedrock Runtime (for Amazon Nova invocation)**
- `bedrock:InvokeModel` - Required to invoke Amazon Nova models for goal decomposition

**2. Bedrock Agent Runtime (for Knowledge Base retrieval)**
- `bedrock:Retrieve` - Required to query Bedrock Knowledge Bases for company context

#### Example IAM Policy

An example IAM policy is provided in `iam-policy-example.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockRuntimeAccess",
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel"],
      "Resource": ["arn:aws:bedrock:*::foundation-model/amazon.nova-lite-v1:0"]
    },
    {
      "Sid": "BedrockAgentRuntimeAccess",
      "Effect": "Allow",
      "Action": ["bedrock:Retrieve"],
      "Resource": ["arn:aws:bedrock:*:*:knowledge-base/*"]
    }
  ]
}
```

#### Deployment Considerations

**Lambda Execution Role:**
When deploying as a Lambda function, attach this policy to the Lambda execution role.

**Local Development:**
For local development, ensure your AWS credentials (via `~/.aws/credentials` or environment variables) have these permissions.

**Least Privilege:**
For production, restrict the `Resource` ARNs to specific model IDs and Knowledge Base IDs:
- Replace `amazon.nova-lite-v1:0` with your specific model ID
- Replace `*` in Knowledge Base ARN with your specific Knowledge Base ID

**Free Tier Compliance:**
These permissions align with AWS Free Tier usage:
- Amazon Nova Lite is cost-effective for reasoning tasks
- Bedrock Knowledge Base retrieval is limited to 3-5 documents per request
