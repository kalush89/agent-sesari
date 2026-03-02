# Bugfix Requirements Document: Credential Vault Integration for Data Fetching

## Introduction

The ICP refinement engine's data-fetching module currently reads API credentials directly from environment variables (process.env.HUBSPOT_API_KEY, process.env.MIXPANEL_API_KEY, process.env.STRIPE_API_KEY). This creates a security vulnerability and bypasses the newly implemented credential vault system that provides centralized, encrypted credential management with OAuth token refresh capabilities.

The credential vault introduces a secure, production-ready credential management system where:
- HubSpot uses OAuth 2.0 with automatic token refresh (access tokens, not static API keys)
- Stripe uses restricted API keys stored encrypted in DynamoDB with KMS
- Mixpanel uses service account credentials (username + secret) stored encrypted

This bugfix integrates the data-fetching module with the credential vault by replacing direct environment variable access with secure credential retrieval through the vault's Retrieval Lambda, ensuring all API calls use properly authenticated and encrypted credentials.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN fetchHubSpotCompanies() is called THEN the system reads credentials from process.env.HUBSPOT_API_KEY

1.2 WHEN fetchMixpanelCohorts() is called THEN the system reads credentials from process.env.MIXPANEL_API_KEY

1.3 WHEN fetchStripeCustomers() is called THEN the system reads credentials from process.env.STRIPE_API_KEY

1.4 WHEN any fetch function is called THEN the system does not use the credential vault's encrypted storage

1.5 WHEN any fetch function is called THEN the system does not benefit from automatic OAuth token refresh for HubSpot

1.6 WHEN HubSpot OAuth tokens expire THEN the system fails with authentication errors instead of automatically refreshing

1.7 WHEN credentials are stored in environment variables THEN they are exposed in plaintext in the Lambda execution environment

1.8 WHEN authentication headers are constructed THEN the system uses Bearer tokens for all services instead of service-specific authentication patterns

### Expected Behavior (Correct)

2.1 WHEN fetchHubSpotCompanies() is called THEN the system SHALL retrieve OAuth credentials from the credential vault using getCredentials(userId, 'hubspot')

2.2 WHEN fetchMixpanelCohorts() is called THEN the system SHALL retrieve service account credentials from the credential vault using getCredentials(userId, 'mixpanel')

2.3 WHEN fetchStripeCustomers() is called THEN the system SHALL retrieve API key credentials from the credential vault using getCredentials(userId, 'stripe')

2.4 WHEN any fetch function is called THEN the system SHALL use credentials decrypted from KMS-encrypted DynamoDB storage

2.5 WHEN HubSpot credentials are retrieved THEN the system SHALL automatically receive refreshed access tokens if the current token is expired

2.6 WHEN HubSpot OAuth tokens expire THEN the system SHALL transparently refresh them without failing API calls

2.7 WHEN credentials are retrieved THEN they SHALL be decrypted in-memory and never stored in environment variables

2.8 WHEN HubSpot authentication headers are constructed THEN the system SHALL use Bearer token with OAuth access_token

2.9 WHEN Mixpanel authentication headers are constructed THEN the system SHALL use Basic authentication with Base64-encoded username:secret

2.10 WHEN Stripe authentication headers are constructed THEN the system SHALL use Bearer token with API key

2.11 WHEN credential retrieval fails THEN the system SHALL throw a descriptive error indicating the service is not connected

2.12 WHEN getCredentials() is called THEN the system SHALL pass a valid userId to identify which user's credentials to retrieve

### Unchanged Behavior (Regression Prevention)

3.1 WHEN fetchHubSpotCompanies() is called with a valid limit THEN the system SHALL CONTINUE TO fetch companies with pagination and retry logic

3.2 WHEN fetchMixpanelCohorts() is called with company IDs THEN the system SHALL CONTINUE TO fetch cohort data with batch processing and rate limiting

3.3 WHEN fetchStripeCustomers() is called with company IDs THEN the system SHALL CONTINUE TO fetch customer data with batch processing and rate limiting

3.4 WHEN any API call fails THEN the system SHALL CONTINUE TO retry with exponential backoff

3.5 WHEN API responses are received THEN the system SHALL CONTINUE TO parse and transform data into the same HubSpotCompany, MixpanelCohort, and StripeCustomer types

3.6 WHEN data completeness metrics are calculated THEN the system SHALL CONTINUE TO track availability percentages for each service

3.7 WHEN fetchAllCustomerData() is called THEN the system SHALL CONTINUE TO orchestrate all three service calls and return combined results

3.8 WHEN HubSpot API calls are made THEN the system SHALL CONTINUE TO request the same properties (name, industry, numberofemployees, state, total_revenue, createdate)

3.9 WHEN Mixpanel API calls are made THEN the system SHALL CONTINUE TO filter by company_id property and calculate retention rates

3.10 WHEN Stripe API calls are made THEN the system SHALL CONTINUE TO search by metadata company_id and calculate MRR and churn signals

3.11 WHEN rate limiting delays are applied THEN the system SHALL CONTINUE TO use the same delay intervals (1000ms for HubSpot/Stripe, 500ms for Mixpanel)

3.12 WHEN batch sizes are determined THEN the system SHALL CONTINUE TO use the same batch sizes (100 for HubSpot/Stripe, 50 for Mixpanel)
