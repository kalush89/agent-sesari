---
inclusion: always
---

# Project Structure

## Monorepo Organization

The project follows a monorepo structure with clear separation of concerns:

```
/apps/web
  Next.js dashboard for user interface

/packages/agent
  Core Bedrock Agent logic and orchestration

/packages/lambdas
  Individual "Signal Connectors" for integrations:
  - Stripe connector
  - HubSpot connector
  - Additional integration lambdas

/packages/specs
  Kiro design and requirement documents
  Feature specifications and implementation plans
```

## Guidelines

- Keep packages focused and independently deployable
- Shared utilities should live in `/packages/shared` if needed
- Each package should have its own `package.json` and dependencies
- Use workspace features for dependency management across packages
