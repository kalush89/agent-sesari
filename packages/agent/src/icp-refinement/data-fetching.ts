/**
 * Data fetching layer for external API integrations
 * Handles HubSpot, Mixpanel, and Stripe API calls with retry logic and rate limiting
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { HubSpotCompany, MixpanelCohort, StripeCustomer } from './types.js';
import {  
  DecryptedCredential,
  OAuthCredential,
  APIKeyCredential,
  ServiceAccountCredential,
  ServiceName
} from './credential-types.js';
/**
 * Retrieves credentials from the credential vault for a specific service
 * Invokes the credential retrieval Lambda to get decrypted credentials
 * 
 * @param userId - User identifier
 * @param serviceName - Service to retrieve credentials for (hubspot, stripe, mixpanel)
 * @returns Decrypted credential data
 * @throws Error if service is not connected or Lambda invocation fails
 */
async function getServiceCredentials(
  userId: string,
  serviceName: ServiceName
): Promise<DecryptedCredential> {
  const lambdaClient = new LambdaClient({ 
    region: process.env.AWS_REGION || 'us-east-1' 
  });

  const functionName = process.env.CREDENTIAL_RETRIEVAL_LAMBDA_NAME || 'credential-retrieval';

  try {
    const command = new InvokeCommand({
      FunctionName: functionName,
      Payload: JSON.stringify({ userId, serviceName }),
    });

    const response = await lambdaClient.send(command);

    if (!response.Payload) {
      throw new Error('Empty response from credential retrieval Lambda');
    }

    const payloadString = new TextDecoder().decode(response.Payload);
    const result = JSON.parse(payloadString);

    // Check if Lambda returned an error
    if (result.errorType || result.errorMessage) {
      const errorMessage = result.errorMessage || 'Unknown error from credential retrieval';
      
      // Check if it's a NOT_FOUND error
      if (errorMessage.includes('No credentials found') || errorMessage.includes('NOT_FOUND')) {
        throw new Error(`Service not connected. Please connect ${serviceName} first.`);
      }
      
      throw new Error(`Credential retrieval failed: ${errorMessage}`);
    }

    return result as DecryptedCredential;
  } catch (error) {
    if (error instanceof Error) {
      // Re-throw our custom error messages
      if (error.message.includes('Service not connected')) {
        throw error;
      }
      
      throw new Error(`Failed to retrieve credentials for ${serviceName}: ${error.message}`);
    }
    
    throw new Error(`Failed to retrieve credentials for ${serviceName}: Unknown error`);
  }
}

/**
 * Creates HubSpot authentication header with Bearer token
 * 
 * @param accessToken - OAuth access token
 * @returns Authorization header object
 */
function createHubSpotAuthHeader(accessToken: string): { Authorization: string } {
  return {
    Authorization: `Bearer ${accessToken}`
  };
}

/**
 * Creates Stripe authentication header with Bearer token
 * 
 * @param apiKey - Stripe API key
 * @returns Authorization header object
 */
function createStripeAuthHeader(apiKey: string): { Authorization: string } {
  return {
    Authorization: `Bearer ${apiKey}`
  };
}

/**
 * Creates Mixpanel authentication header with Basic auth
 * 
 * @param username - Mixpanel service account username
 * @param secret - Mixpanel service account secret
 * @returns Authorization header object with Base64-encoded credentials
 */
function createMixpanelAuthHeader(username: string, secret: string): { Authorization: string } {
  const credentials = Buffer.from(`${username}:${secret}`).toString('base64');
  return {
    Authorization: `Basic ${credentials}`
  };
}

/**
 * Delays execution for specified milliseconds
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries a function with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  context: string
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      console.error(`${context} failed (attempt ${attempt}/${maxAttempts}):`, error);

      if (attempt < maxAttempts) {
        const delayMs = Math.pow(2, attempt) * 1000;
        console.log(`Retrying in ${delayMs}ms...`);
        await delay(delayMs);
      }
    }
  }

  throw new Error(`${context} failed after ${maxAttempts} attempts: ${lastError?.message}`);
}

/**
 * Fetches companies from HubSpot with pagination and retry logic
 * 
 * @param userId - User identifier for credential retrieval
 * @param limit - Maximum number of companies to fetch
 * @returns Array of HubSpot company records
 * @throws Error if HubSpot API fails after all retries
 */
export async function fetchHubSpotCompanies(userId: string, limit: number): Promise<HubSpotCompany[]> {
  // Retrieve OAuth credentials from vault
  const credentials = await getServiceCredentials(userId, 'hubspot');
  const oauthCred = credentials.data as OAuthCredential;
  
  if (!oauthCred.access_token) {
    throw new Error('HubSpot OAuth access token not available');
  }

  const companies: HubSpotCompany[] = [];
  const batchSize = 100;
  let after: string | undefined;

  while (companies.length < limit) {
    const remaining = limit - companies.length;
    const currentBatchSize = Math.min(batchSize, remaining);

    const batch = await retryWithBackoff(
      async () => fetchHubSpotBatch(oauthCred.access_token!, currentBatchSize, after),
      3,
      'HubSpot API call'
    );

    companies.push(...batch.companies);

    if (!batch.hasMore || companies.length >= limit) {
      break;
    }

    after = batch.after;

    // Rate limiting: 1-second delay between batches
    if (companies.length < limit) {
      await delay(1000);
    }
  }

  console.log(`Fetched ${companies.length} companies from HubSpot`);
  return companies.slice(0, limit);
}

/**
 * Fetches a single batch of companies from HubSpot
 */
async function fetchHubSpotBatch(
  accessToken: string,
  limit: number,
  after?: string
): Promise<{ companies: HubSpotCompany[]; hasMore: boolean; after?: string }> {
  const url = new URL('https://api.hubapi.com/crm/v3/objects/companies');
  url.searchParams.set('limit', limit.toString());
  url.searchParams.set('properties', 'name,industry,numberofemployees,state,total_revenue,createdate');
  
  if (after) {
    url.searchParams.set('after', after);
  }

  const authHeader = createHubSpotAuthHeader(accessToken);

  const response = await fetch(url.toString(), {
    headers: {
      ...authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HubSpot API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as any;

  const companies: HubSpotCompany[] = data.results.map((result: any) => ({
    companyId: result.id,
    name: result.properties.name || 'Unknown',
    industry: result.properties.industry || 'Unknown',
    employeeCount: parseInt(result.properties.numberofemployees || '0', 10),
    region: result.properties.state || 'Unknown',
    totalRevenue: parseFloat(result.properties.total_revenue || '0'),
    createdAt: result.properties.createdate || new Date().toISOString(),
    properties: result.properties,
  }));

  return {
    companies,
    hasMore: !!data.paging?.next,
    after: data.paging?.next?.after,
  };
}

/**
 * Fetches cohort data from Mixpanel for specified companies
 * 
 * @param userId - User identifier for credential retrieval
 * @param companyIds - Array of company IDs to fetch data for
 * @returns Array of Mixpanel cohort records (null for unavailable companies)
 */
export async function fetchMixpanelCohorts(userId: string, companyIds: string[]): Promise<MixpanelCohort[]> {
  // Retrieve service account credentials from vault
  const credentials = await getServiceCredentials(userId, 'mixpanel');
  const serviceAccountCred = credentials.data as ServiceAccountCredential;
  
  if (!serviceAccountCred.username || !serviceAccountCred.secret) {
    throw new Error('Mixpanel service account credentials not available');
  }

  const cohorts: MixpanelCohort[] = [];
  const batchSize = 50;

  for (let i = 0; i < companyIds.length; i += batchSize) {
    const batch = companyIds.slice(i, i + batchSize);

    try {
      const batchResults = await fetchMixpanelBatch(
        serviceAccountCred.username,
        serviceAccountCred.secret,
        batch
      );
      cohorts.push(...batchResults);
    } catch (error) {
      console.warn(`Mixpanel batch fetch failed, continuing with null values:`, error);
      // Add null entries for failed batch
      cohorts.push(...batch.map(() => null as any));
    }

    // Rate limiting: 500ms delay between batches
    if (i + batchSize < companyIds.length) {
      await delay(500);
    }
  }

  console.log(`Fetched ${cohorts.filter(c => c !== null).length}/${companyIds.length} cohorts from Mixpanel`);
  return cohorts;
}

/**
 * Fetches a single batch of cohort data from Mixpanel
 */
async function fetchMixpanelBatch(
  username: string,
  secret: string,
  companyIds: string[]
): Promise<MixpanelCohort[]> {
  // Calculate date range for 30-day retention
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  const cohorts: MixpanelCohort[] = [];

  for (const companyId of companyIds) {
    try {
      // Fetch 'Aha! Moment' event count
      const eventCount = await fetchMixpanelEventCount(username, secret, companyId, startDate, endDate);
      
      // Fetch 30-day retention rate
      const retentionRate = await fetchMixpanelRetention(username, secret, companyId, startDate, endDate);

      cohorts.push({
        companyId,
        ahaEventCount: eventCount,
        retentionRate,
        lastActiveDate: endDate.toISOString(),
        engagementScore: eventCount, // Simplified engagement score
      });
    } catch (error) {
      console.warn(`Failed to fetch Mixpanel data for company ${companyId}:`, error);
      cohorts.push(null as any);
    }
  }

  return cohorts;
}

/**
 * Fetches event count for a specific company from Mixpanel
 * 
 * IMPORTANT: This function assumes that Mixpanel events have a `company_id` property
 * set up in your Mixpanel implementation. The `where` parameter filters events by
 * this property using the expression: properties["company_id"]=="value"
 * 
 * If your Mixpanel events don't have this property, you'll need to:
 * 1. Add company_id tracking to your Mixpanel event instrumentation
 * 2. Or modify this function to use a different property name
 */
async function fetchMixpanelEventCount(
  username: string,
  secret: string,
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  const url = new URL('https://mixpanel.com/api/query/segmentation');
  url.searchParams.set('event', 'Aha! Moment');
  url.searchParams.set('type', 'general');
  url.searchParams.set('unit', 'day');
  url.searchParams.set('from_date', startDate.toISOString().split('T')[0]);
  url.searchParams.set('to_date', endDate.toISOString().split('T')[0]);
  url.searchParams.set('where', `properties["company_id"]=="${companyId}"`);

  const authHeader = createMixpanelAuthHeader(username, secret);

  const response = await fetch(url.toString(), {
    headers: {
      ...authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Mixpanel API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as any;
  
  // Sum up event counts across all days
  const eventData = data.data?.values?.['Aha! Moment'] || {};
  return Object.values(eventData).reduce((sum: number, count: any) => sum + (count || 0), 0);
}

/**
 * Fetches 30-day retention rate for a specific company from Mixpanel
 * 
 * IMPORTANT: This function assumes that Mixpanel events have a `company_id` property
 * set up in your Mixpanel implementation. The `where` parameter filters events by
 * this property using the expression: properties["company_id"]=="value"
 * 
 * If your Mixpanel events don't have this property, you'll need to:
 * 1. Add company_id tracking to your Mixpanel event instrumentation
 * 2. Or modify this function to use a different property name
 */
async function fetchMixpanelRetention(
  username: string,
  secret: string,
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  const url = new URL('https://mixpanel.com/api/query/retention');
  url.searchParams.set('from_date', startDate.toISOString().split('T')[0]);
  url.searchParams.set('to_date', endDate.toISOString().split('T')[0]);
  url.searchParams.set('retention_type', 'birth');
  url.searchParams.set('unit', 'day');
  url.searchParams.set('interval', '1');
  url.searchParams.set('interval_count', '30');
  url.searchParams.set('where', `properties["company_id"]=="${companyId}"`);

  const authHeader = createMixpanelAuthHeader(username, secret);

  const response = await fetch(url.toString(), {
    headers: {
      ...authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Mixpanel API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as any;
  
  // Calculate average retention across all cohorts
  let totalRetention = 0;
  let cohortCount = 0;
  
  for (const date in data) {
    const cohort = data[date];
    if (cohort.counts && cohort.counts.length > 0 && cohort.first > 0) {
      // Get the last interval (30 days) retention count
      const retainedUsers = cohort.counts[cohort.counts.length - 1] || 0;
      const retention = (retainedUsers / cohort.first) * 100;
      totalRetention += retention;
      cohortCount++;
    }
  }

  return cohortCount > 0 ? totalRetention / cohortCount : 0;
}

/**
 * Fetches customer data from Stripe for specified companies
 * 
 * @param userId - User identifier for credential retrieval
 * @param companyIds - Array of company IDs to fetch data for
 * @returns Array of Stripe customer records (null for unavailable companies)
 */
export async function fetchStripeCustomers(userId: string, companyIds: string[]): Promise<StripeCustomer[]> {
  // Retrieve API key credentials from vault
  const credentials = await getServiceCredentials(userId, 'stripe');
  const apiKeyCred = credentials.data as APIKeyCredential;
  
  if (!apiKeyCred.api_key) {
    throw new Error('Stripe API key not available');
  }

  const customers: StripeCustomer[] = [];
  const batchSize = 100;

  for (let i = 0; i < companyIds.length; i += batchSize) {
    const batch = companyIds.slice(i, i + batchSize);

    try {
      const batchResults = await fetchStripeBatch(apiKeyCred.api_key, batch);
      customers.push(...batchResults);
    } catch (error) {
      console.warn(`Stripe batch fetch failed, continuing with null values:`, error);
      // Add null entries for failed batch
      customers.push(...batch.map(() => null as any));
    }

    // Rate limiting: 1-second delay between batches
    if (i + batchSize < companyIds.length) {
      await delay(1000);
    }
  }

  console.log(`Fetched ${customers.filter(c => c !== null).length}/${companyIds.length} customers from Stripe`);
  return customers;
}

/**
 * Fetches a single batch of customer data from Stripe
 */
async function fetchStripeBatch(
  apiKey: string,
  companyIds: string[]
): Promise<StripeCustomer[]> {
  const customers: StripeCustomer[] = [];

  for (const companyId of companyIds) {
    try {
      const customer = await fetchStripeCustomer(apiKey, companyId);
      customers.push(customer);
    } catch (error) {
      console.warn(`Failed to fetch Stripe data for company ${companyId}:`, error);
      customers.push(null as any);
    }
  }

  return customers;
}

/**
 * Fetches a single customer from Stripe with subscription and payment data
 */
async function fetchStripeCustomer(
  apiKey: string,
  companyId: string
): Promise<StripeCustomer> {
  const authHeader = createStripeAuthHeader(apiKey);

  // Search for customer by metadata (assuming company_id is stored in metadata)
  const searchUrl = new URL('https://api.stripe.com/v1/customers/search');
  searchUrl.searchParams.set('query', `metadata['company_id']:'${companyId}'`);

  const searchResponse = await fetch(searchUrl.toString(), {
    headers: {
      ...authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!searchResponse.ok) {
    throw new Error(`Stripe API error: ${searchResponse.status} ${searchResponse.statusText}`);
  }

  const searchData = await searchResponse.json() as any;

  if (!searchData.data || searchData.data.length === 0) {
    throw new Error(`No Stripe customer found for company ${companyId}`);
  }

  const customer = searchData.data[0];
  const customerId = customer.id;

  // Fetch subscriptions for the customer
  const subscriptionsUrl = new URL('https://api.stripe.com/v1/subscriptions');
  subscriptionsUrl.searchParams.set('customer', customerId);
  subscriptionsUrl.searchParams.set('limit', '100');

  const subscriptionsResponse = await fetch(subscriptionsUrl.toString(), {
    headers: {
      ...authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!subscriptionsResponse.ok) {
    throw new Error(`Stripe API error: ${subscriptionsResponse.status} ${subscriptionsResponse.statusText}`);
  }

  const subscriptionsData = await subscriptionsResponse.json() as any;

  // Calculate MRR and detect churn signals
  let mrr = 0;
  let hasChurnSignal = false;
  let subscriptionStatus = 'none';

  if (subscriptionsData.data && subscriptionsData.data.length > 0) {
    for (const subscription of subscriptionsData.data) {
      // Calculate MRR from active subscriptions
      if (subscription.status === 'active' || subscription.status === 'trialing') {
        const amount = subscription.items?.data?.[0]?.price?.unit_amount || 0;
        const interval = subscription.items?.data?.[0]?.price?.recurring?.interval;
        
        if (interval === 'month') {
          mrr += amount / 100; // Convert cents to dollars
        } else if (interval === 'year') {
          mrr += (amount / 100) / 12; // Convert annual to monthly
        }
      }

      // Detect churn signals
      if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
        hasChurnSignal = true;
      }

      // Set subscription status (use the most recent active or first subscription)
      if (subscriptionStatus === 'none' || subscription.status === 'active') {
        subscriptionStatus = subscription.status;
      }
    }
  }

  // Check for failed payments
  const invoicesUrl = new URL('https://api.stripe.com/v1/invoices');
  invoicesUrl.searchParams.set('customer', customerId);
  invoicesUrl.searchParams.set('limit', '10');
  invoicesUrl.searchParams.set('status', 'open');

  const invoicesResponse = await fetch(invoicesUrl.toString(), {
    headers: {
      ...authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (invoicesResponse.ok) {
    const invoicesData = await invoicesResponse.json() as any;
    
    // Check for overdue invoices (payment failures)
    if (invoicesData.data && invoicesData.data.length > 0) {
      const hasOverdueInvoices = invoicesData.data.some(
        (invoice: any) => invoice.status === 'open' && invoice.due_date && invoice.due_date < Date.now() / 1000
      );
      
      if (hasOverdueInvoices) {
        hasChurnSignal = true;
      }
    }
  }

  return {
    customerId,
    companyId,
    hasChurnSignal,
    mrr,
    subscriptionStatus,
  };
}

/**
 * Data completeness metrics for tracking API availability
 */
export interface DataCompletenessMetrics {
  totalCompanies: number;
  hubspotAvailable: number;
  mixpanelAvailable: number;
  stripeAvailable: number;
  mixpanelCompleteness: number;
  stripeCompleteness: number;
}

/**
 * Calculates data completeness metrics from fetched data
 */
export function calculateDataCompleteness(
  hubspotCompanies: HubSpotCompany[],
  mixpanelCohorts: (MixpanelCohort | null)[],
  stripeCustomers: (StripeCustomer | null)[]
): DataCompletenessMetrics {
  const totalCompanies = hubspotCompanies.length;
  const mixpanelAvailable = mixpanelCohorts.filter(c => c !== null).length;
  const stripeAvailable = stripeCustomers.filter(c => c !== null).length;

  return {
    totalCompanies,
    hubspotAvailable: totalCompanies,
    mixpanelAvailable,
    stripeAvailable,
    mixpanelCompleteness: totalCompanies > 0 ? (mixpanelAvailable / totalCompanies) * 100 : 0,
    stripeCompleteness: totalCompanies > 0 ? (stripeAvailable / totalCompanies) * 100 : 0,
  };
}

/**
 * Logs data completeness metrics for monitoring
 */
export function logDataCompleteness(metrics: DataCompletenessMetrics): void {
  console.log('=== Data Completeness Metrics ===');
  console.log(`Total companies: ${metrics.totalCompanies}`);
  console.log(`HubSpot: ${metrics.hubspotAvailable} (100%)`);
  console.log(`Mixpanel: ${metrics.mixpanelAvailable} (${metrics.mixpanelCompleteness.toFixed(1)}%)`);
  console.log(`Stripe: ${metrics.stripeAvailable} (${metrics.stripeCompleteness.toFixed(1)}%)`);
  
  if (metrics.mixpanelCompleteness < 50) {
    console.warn('WARNING: Mixpanel data completeness is below 50%');
  }
  
  if (metrics.stripeCompleteness < 50) {
    console.warn('WARNING: Stripe data completeness is below 50%');
  }
}

/**
 * Fetches all customer data from HubSpot, Mixpanel, and Stripe with error handling
 */
export async function fetchAllCustomerData(userId: string, limit: number): Promise<{
  hubspotCompanies: HubSpotCompany[];
  mixpanelCohorts: (MixpanelCohort | null)[];
  stripeCustomers: (StripeCustomer | null)[];
  completenessMetrics: DataCompletenessMetrics;
}> {
  console.log(`Starting data fetch for ${limit} companies...`);

  // Fetch HubSpot data (critical - abort if fails)
  let hubspotCompanies: HubSpotCompany[];
  try {
    hubspotCompanies = await fetchHubSpotCompanies(userId, limit);
  } catch (error) {
    console.error('CRITICAL: HubSpot data fetch failed after all retries:', error);
    throw new Error(`Cannot proceed without HubSpot data: ${(error as Error).message}`);
  }

  if (hubspotCompanies.length === 0) {
    throw new Error('No companies found in HubSpot');
  }

  const companyIds = hubspotCompanies.map(c => c.companyId);

  // Fetch Mixpanel data (non-critical - continue with nulls if fails)
  let mixpanelCohorts: (MixpanelCohort | null)[];
  try {
    mixpanelCohorts = await fetchMixpanelCohorts(userId, companyIds);
  } catch (error) {
    console.warn('Mixpanel data fetch failed, continuing with null values:', error);
    mixpanelCohorts = companyIds.map(() => null);
  }

  // Fetch Stripe data (non-critical - continue with nulls if fails)
  let stripeCustomers: (StripeCustomer | null)[];
  try {
    stripeCustomers = await fetchStripeCustomers(userId, companyIds);
  } catch (error) {
    console.warn('Stripe data fetch failed, continuing with null values:', error);
    stripeCustomers = companyIds.map(() => null);
  }

  // Calculate and log completeness metrics
  const completenessMetrics = calculateDataCompleteness(
    hubspotCompanies,
    mixpanelCohorts,
    stripeCustomers
  );
  
  logDataCompleteness(completenessMetrics);

  return {
    hubspotCompanies,
    mixpanelCohorts,
    stripeCustomers,
    completenessMetrics,
  };
}
