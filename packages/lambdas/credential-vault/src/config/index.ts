/**
 * Configuration for credential vault services
 */

/**
 * Service-specific configuration
 */
export interface ServiceConfig {
  hubspot: {
    authorizationURL: string;
    tokenURL: string;
    clientId: string;
    clientSecret: string;
    redirectURI: string;
    scopes: string[];
  };
  stripe: {
    apiBaseURL: string;
    keyPattern: RegExp;
    smokeTestEndpoint: string;
  };
  mixpanel: {
    apiBaseURL: string;
    smokeTestEndpoint: string;
  };
}

/**
 * Get service configuration from environment variables
 */
export function getServiceConfig(): ServiceConfig {
  return {
    hubspot: {
      authorizationURL: 'https://app.hubspot.com/oauth/authorize',
      tokenURL: 'https://api.hubapi.com/oauth/v1/token',
      clientId: process.env.HUBSPOT_CLIENT_ID || '',
      clientSecret: process.env.HUBSPOT_CLIENT_SECRET || '',
      redirectURI: process.env.HUBSPOT_REDIRECT_URI || '',
      scopes: ['crm.objects.companies.read', 'crm.objects.deals.read']
    },
    stripe: {
      apiBaseURL: 'https://api.stripe.com/v1',
      keyPattern: /^sk_(test|live)_[a-zA-Z0-9]+$/,
      smokeTestEndpoint: '/account'
    },
    mixpanel: {
      apiBaseURL: 'https://mixpanel.com/api/2.0',
      smokeTestEndpoint: '/engage'
    }
  };
}

/**
 * Environment configuration for Lambda functions
 */
export interface LambdaConfig {
  KMS_KEY_ID: string;
  CREDENTIAL_TABLE_NAME: string;
  AWS_REGION: string;
  VALIDATION_TIMEOUT_MS: number;
}

/**
 * Get Lambda configuration from environment variables
 */
export function getLambdaConfig(): LambdaConfig {
  return {
    KMS_KEY_ID: process.env.KMS_KEY_ID || '',
    CREDENTIAL_TABLE_NAME: process.env.CREDENTIAL_TABLE_NAME || 'sesari-credentials',
    AWS_REGION: process.env.AWS_REGION || 'us-east-1',
    VALIDATION_TIMEOUT_MS: parseInt(process.env.VALIDATION_TIMEOUT_MS || '5000', 10)
  };
}

/**
 * Alias for getLambdaConfig for backward compatibility
 */
export function getConfig(): LambdaConfig {
  return getLambdaConfig();
}
