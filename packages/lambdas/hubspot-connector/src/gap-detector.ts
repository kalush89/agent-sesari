/**
 * Communication Gap Detector Lambda
 * Scheduled Lambda that detects communication gaps for active deals and existing customers
 */

import { EventBridgeEvent } from 'aws-lambda';
import { Client } from '@hubspot/api-client';
import { putEvent } from './event-store';
import { RelationshipSignalEvent, CommunicationGapDetails } from './types';
import { randomUUID } from 'crypto';
import { logInfo, logWarn, logError } from './logger';

// Environment configuration
const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY || '';
const DEAL_GAP_THRESHOLD_DAYS = parseInt(process.env.DEAL_GAP_THRESHOLD_DAYS || '14', 10);
const CUSTOMER_GAP_THRESHOLD_DAYS = parseInt(process.env.CUSTOMER_GAP_THRESHOLD_DAYS || '30', 10);

// Retry configuration for HubSpot API
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
};

/**
 * Sleep utility for retry delays
 */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * HubSpot deal representation
 */
interface HubSpotDeal {
  id: string;
  companyId: string;
  contactId: string;
  dealValue: number;
  stage: string;
}

/**
 * HubSpot contact representation
 */
interface HubSpotContact {
  id: string;
  companyId: string;
  customerLifetimeValue: number;
}

/**
 * Main handler function for EventBridge scheduled execution
 */
export async function handler(event: EventBridgeEvent<string, any>): Promise<void> {
  logInfo('Communication gap detection started', undefined, {
    timestamp: new Date().toISOString(),
  });

  try {
    // Validate environment variables
    if (!HUBSPOT_API_KEY) {
      throw new Error('HUBSPOT_API_KEY environment variable is required');
    }

    const hubspotClient = createHubSpotClient();

    // Process active deals
    const deals = await getActiveDeals(hubspotClient);
    logInfo('Retrieved active deals', undefined, {
      count: deals.length,
    });

    let dealsProcessed = 0;
    let dealGapsCreated = 0;

    for (const deal of deals) {
      try {
        const daysSinceContact = await getDaysSinceLastContact(hubspotClient, deal.contactId);
        await createGapEventIfNeeded(
          deal.contactId,
          deal.companyId,
          daysSinceContact,
          calculateImportanceLevel(deal.dealValue, deal.stage),
          'active_deal',
          deal.dealValue
        );
        
        if (daysSinceContact >= DEAL_GAP_THRESHOLD_DAYS) {
          dealGapsCreated++;
        }
        dealsProcessed++;
      } catch (error) {
        logError('Failed to process deal', undefined, {
          dealId: deal.id,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue processing other deals
      }
    }

    // Process existing customers
    const customers = await getExistingCustomers(hubspotClient);
    logInfo('Retrieved existing customers', undefined, {
      count: customers.length,
    });

    let customersProcessed = 0;
    let customerGapsCreated = 0;

    for (const customer of customers) {
      try {
        const daysSinceContact = await getDaysSinceLastContact(hubspotClient, customer.id);
        await createGapEventIfNeeded(
          customer.id,
          customer.companyId,
          daysSinceContact,
          calculateImportanceLevel(customer.customerLifetimeValue),
          'existing_customer',
          undefined,
          customer.customerLifetimeValue
        );
        
        if (daysSinceContact >= CUSTOMER_GAP_THRESHOLD_DAYS) {
          customerGapsCreated++;
        }
        customersProcessed++;
      } catch (error) {
        logError('Failed to process customer', undefined, {
          contactId: customer.id,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue processing other customers
      }
    }

    logInfo('Communication gap detection completed', undefined, {
      dealsProcessed,
      dealGapsCreated,
      customersProcessed,
      customerGapsCreated,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError('Communication gap detection failed', undefined, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Creates and initializes HubSpot API client with error handling
 */
function createHubSpotClient(): Client {
  try {
    return new Client({ accessToken: HUBSPOT_API_KEY });
  } catch (error) {
    logError('Failed to initialize HubSpot client', undefined, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('Failed to initialize HubSpot client');
  }
}

/**
 * Retrieves active deals from HubSpot API with retry logic
 */
export async function getActiveDeals(client: Client): Promise<HubSpotDeal[]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const response = await client.crm.deals.searchApi.doSearch({
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'dealstage',
                operator: 'NOT_IN',
                values: ['closedwon', 'closedlost'],
              },
            ],
          },
        ],
        properties: ['dealname', 'amount', 'dealstage', 'associatedcompanyid', 'associatedcontactid'],
        limit: 100,
      });

      return response.results.map((deal) => ({
        id: deal.id,
        companyId: deal.properties.associatedcompanyid || '',
        contactId: deal.properties.associatedcontactid || '',
        dealValue: parseFloat(deal.properties.amount || '0'),
        stage: deal.properties.dealstage || '',
      }));
    } catch (error) {
      lastError = error as Error;

      if (attempt < RETRY_CONFIG.maxRetries) {
        const delayMs = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
        
        logWarn('HubSpot API call failed, retrying', undefined, {
          attempt: attempt + 1,
          delayMs,
          error: error instanceof Error ? error.message : String(error),
        });
        
        await sleep(delayMs);
        continue;
      }

      logError('Failed to retrieve active deals from HubSpot', undefined, {
        attempt: attempt + 1,
        error: error instanceof Error ? error.message : String(error),
      });
      
      throw new Error(`Failed to retrieve active deals: ${lastError?.message}`);
    }
  }

  throw new Error(`Failed to retrieve active deals after ${RETRY_CONFIG.maxRetries + 1} attempts`);
}

/**
 * Retrieves existing customers from HubSpot API with retry logic
 */
export async function getExistingCustomers(client: Client): Promise<HubSpotContact[]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const response = await client.crm.contacts.searchApi.doSearch({
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'lifecyclestage',
                operator: 'EQ',
                value: 'customer',
              },
            ],
          },
        ],
        properties: ['associatedcompanyid', 'hs_lifetime_value'],
        limit: 100,
      });

      return response.results.map((contact) => ({
        id: contact.id,
        companyId: contact.properties.associatedcompanyid || '',
        customerLifetimeValue: parseFloat(contact.properties.hs_lifetime_value || '0'),
      }));
    } catch (error) {
      lastError = error as Error;

      if (attempt < RETRY_CONFIG.maxRetries) {
        const delayMs = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
        
        logWarn('HubSpot API call failed, retrying', undefined, {
          attempt: attempt + 1,
          delayMs,
          error: error instanceof Error ? error.message : String(error),
        });
        
        await sleep(delayMs);
        continue;
      }

      logError('Failed to retrieve existing customers from HubSpot', undefined, {
        attempt: attempt + 1,
        error: error instanceof Error ? error.message : String(error),
      });
      
      throw new Error(`Failed to retrieve existing customers: ${lastError?.message}`);
    }
  }

  throw new Error(`Failed to retrieve existing customers after ${RETRY_CONFIG.maxRetries + 1} attempts`);
}

/**
 * Calculates days since last contact for a given contact ID
 */
export async function getDaysSinceLastContact(client: Client, contactId: string): Promise<number> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const response = await client.crm.contacts.basicApi.getById(contactId, ['lastmodifieddate', 'notes_last_contacted']);

      const lastContactedStr = response.properties.notes_last_contacted || response.properties.lastmodifieddate;
      
      if (!lastContactedStr) {
        // No communication history - return a large number
        return 999;
      }

      const lastContactedDate = new Date(lastContactedStr);
      const now = new Date();
      const diffMs = now.getTime() - lastContactedDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      return diffDays;
    } catch (error) {
      lastError = error as Error;

      if (attempt < RETRY_CONFIG.maxRetries) {
        const delayMs = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
        
        logWarn('HubSpot API call failed, retrying', undefined, {
          contactId,
          attempt: attempt + 1,
          delayMs,
          error: error instanceof Error ? error.message : String(error),
        });
        
        await sleep(delayMs);
        continue;
      }

      logError('Failed to get last contact date from HubSpot', undefined, {
        contactId,
        attempt: attempt + 1,
        error: error instanceof Error ? error.message : String(error),
      });
      
      throw new Error(`Failed to get last contact date: ${lastError?.message}`);
    }
  }

  throw new Error(`Failed to get last contact date after ${RETRY_CONFIG.maxRetries + 1} attempts`);
}

/**
 * Calculates importance level based on deal value or customer lifetime value
 */
export function calculateImportanceLevel(
  value: number,
  stage?: string
): 'high' | 'medium' | 'low' {
  // High importance: >$10k
  if (value > 10000) {
    return 'high';
  }
  
  // Medium importance: $1k-$10k
  if (value >= 1000) {
    return 'medium';
  }
  
  // Low importance: <$1k
  return 'low';
}

/**
 * Creates a communication gap event if threshold is exceeded
 */
export async function createGapEventIfNeeded(
  contactId: string,
  companyId: string,
  daysSinceContact: number,
  importanceLevel: 'high' | 'medium' | 'low',
  relationshipType: 'active_deal' | 'existing_customer',
  dealValue?: number,
  customerLifetimeValue?: number
): Promise<void> {
  const threshold = relationshipType === 'active_deal' 
    ? DEAL_GAP_THRESHOLD_DAYS 
    : CUSTOMER_GAP_THRESHOLD_DAYS;

  if (daysSinceContact < threshold) {
    return;
  }

  const now = Date.now();
  const lastCommunicationDate = now - (daysSinceContact * 24 * 60 * 60 * 1000);

  const gapDetails: CommunicationGapDetails = {
    lastCommunicationDate: Math.floor(lastCommunicationDate / 1000),
    daysSinceLastContact: daysSinceContact,
    importanceLevel,
    relationshipType,
    dealValue,
    customerLifetimeValue,
  };

  const event: RelationshipSignalEvent = {
    eventId: `gap-${contactId}-${now}`,
    eventType: 'communication_gap',
    companyId,
    contactId,
    timestamp: Math.floor(now / 1000),
    processedAt: Math.floor(now / 1000),
    details: gapDetails,
  };

  try {
    await putEvent(event);
    
    logInfo('Communication gap event created', event.eventId, {
      contactId,
      companyId,
      daysSinceContact,
      importanceLevel,
      relationshipType,
    });
  } catch (error) {
    logError('Failed to store communication gap event', event.eventId, {
      contactId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
