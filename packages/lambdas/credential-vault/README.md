# Credential Vault

Secure credential management system for third-party service integrations (HubSpot, Stripe, Mixpanel).

## Architecture

This package contains Lambda functions for:
- **OAuth Handler**: Manages OAuth 2.0 flows and token refresh (HubSpot)
- **Validation**: Validates API keys and service accounts through smoke tests
- **Retrieval**: Provides decrypted credentials to the Sesari agent
- **Storage**: Encrypts and stores credentials in DynamoDB with KMS encryption

## Project Structure

```
src/
├── types/          # Shared TypeScript types
├── config/         # Configuration and environment variables
├── utils/          # Shared utilities (encryption, storage, masking)
└── handlers/       # Lambda function handlers
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Build TypeScript:
```bash
npm run build
```

4. Run tests:
```bash
npm test
```

## AWS Free Tier Compliance

- Uses Lambda for compute (1M free requests/month)
- Uses DynamoDB on-demand pricing
- Uses single KMS key (20K free operations/month)
- Optimized for minimal storage and compute costs
