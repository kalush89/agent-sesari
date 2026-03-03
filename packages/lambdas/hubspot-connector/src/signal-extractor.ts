/**
 * Signal Extraction Module
 * 
 * Maps HubSpot webhook events to relationship signals (deal progression,
 * sentiment, and communication gaps). Filters relevant events and extracts
 * structured data for storage in the Event Store.
 */

import { RelationshipSignalEvent, DealProgressionDetails, SentimentDetails } from './types';
import { analyzeSentiment } from './sentiment-analyzer';

/**
 * HubSpot webhook event structure
 */
export interface HubSpotWebhookEvent {
  eventId: string;
  subscriptionId: number;
  portalId: number;
  occurredAt: number;
  eventType: string;
  attemptNumber: number;
  objectId: number;
  propertyName?: string;
  propertyValue?: string;
  changeSource?: string;
  sourceId?: string;
  // Additional fields for different event types
  [key: string]: any;
}

/**
 * Deal stage order for progression detection
 * Lower index = earlier stage, higher index = later stage
 */
const DEAL_STAGE_ORDER = [
  'Lead',
  'Qualified',
  'Qualified Lead',
  'Meeting Scheduled',
  'Proposal',
  'Proposal Sent',
  'Negotiation',
  'Closed Won',
  'Closed Lost'
];

/**
 * Extracts relationship signal from HubSpot webhook event.
 * Returns null for non-relationship event types.
 * 
 * @param event - HubSpot webhook event
 * @returns RelationshipSignalEvent or null if event should be ignored
 */
export function extractRelationshipSignal(
  event: HubSpotWebhookEvent
): RelationshipSignalEvent | null {
  const { eventType } = event;

  // Filter and route to appropriate extraction function
  if (eventType === 'deal.propertyChange') {
    return extractDealProgressionSignal(event);
  }

  if (eventType === 'engagement.created' || eventType === 'note.created') {
    return extractSentimentSignal(event);
  }

  // Log ignored event types for monitoring
  console.log(JSON.stringify({
    level: 'info',
    message: 'Ignoring non-relationship event type',
    eventType,
    eventId: event.eventId,
  }));

  return null;
}

/**
 * Extracts deal progression signal from deal.propertyChange events.
 * Detects stage changes, determines forward progression vs regression,
 * and extracts deal details.
 * 
 * @param event - HubSpot deal.propertyChange event
 * @returns RelationshipSignalEvent or null if not a stage change
 */
export function extractDealProgressionSignal(
  event: HubSpotWebhookEvent
): RelationshipSignalEvent | null {
  // Only process deal stage changes
  if (event.propertyName !== 'dealstage') {
    return null;
  }

  const oldStage = event.oldValue || '';
  const newStage = event.propertyValue || '';

  // No actual change
  if (oldStage === newStage) {
    return null;
  }

  // Determine if this is a regression (moving backward)
  const oldIndex = DEAL_STAGE_ORDER.indexOf(oldStage);
  const newIndex = DEAL_STAGE_ORDER.indexOf(newStage);
  const isRegression = oldIndex > newIndex && oldIndex !== -1 && newIndex !== -1;

  // Extract deal details
  const dealValue = parseFloat(event.dealValue || event.amount || '0');
  const currency = event.currency || 'USD';
  const dealName = event.dealName || event.name || `Deal ${event.objectId}`;
  const companyId = String(event.companyId || event.associatedCompanyId || event.portalId);
  const contactId = event.contactId ? String(event.contactId) : undefined;
  const closeDate = newStage === 'Closed Won' ? event.closeDate || Math.floor(Date.now() / 1000) : undefined;

  const details: DealProgressionDetails = {
    oldStage,
    newStage,
    isRegression,
    dealValue,
    currency,
    closeDate,
    dealName,
  };

  const relationshipEvent: RelationshipSignalEvent = {
    eventId: event.eventId,
    eventType: 'deal_progression',
    companyId,
    contactId,
    dealId: String(event.objectId),
    timestamp: Math.floor(event.occurredAt / 1000),
    processedAt: Math.floor(Date.now() / 1000),
    details,
    hubspotEventType: event.eventType,
  };

  return relationshipEvent;
}

/**
 * Extracts sentiment signal from engagement.created and note.created events.
 * Analyzes text content for sentiment indicators and creates sentiment event.
 * 
 * @param event - HubSpot engagement or note event
 * @returns RelationshipSignalEvent or null if no text content
 */
export function extractSentimentSignal(
  event: HubSpotWebhookEvent
): RelationshipSignalEvent | null {
  // Extract text content from various possible fields
  const textContent = event.body || event.text || event.noteBody || event.emailBody || '';

  // No text to analyze
  if (!textContent || textContent.trim().length === 0) {
    return null;
  }

  // Analyze sentiment
  const sentimentAnalysis = analyzeSentiment(textContent);

  // Determine source type
  let sourceType: 'note' | 'email' | 'call' = 'note';
  if (event.eventType === 'engagement.created') {
    if (event.engagementType === 'EMAIL' || event.type === 'EMAIL') {
      sourceType = 'email';
    } else if (event.engagementType === 'CALL' || event.type === 'CALL') {
      sourceType = 'call';
    }
  }

  const details: SentimentDetails = {
    sentimentScore: sentimentAnalysis.score,
    sentimentCategory: sentimentAnalysis.category,
    sourceType,
    sourceId: String(event.objectId || event.engagementId || event.eventId),
    textExcerpt: sentimentAnalysis.excerpt,
    keywords: sentimentAnalysis.keywords,
  };

  const companyId = String(event.companyId || event.associatedCompanyId || event.portalId);
  const contactId = event.contactId ? String(event.contactId) : undefined;

  const relationshipEvent: RelationshipSignalEvent = {
    eventId: event.eventId,
    eventType: 'sentiment',
    companyId,
    contactId,
    timestamp: Math.floor(event.occurredAt / 1000),
    processedAt: Math.floor(Date.now() / 1000),
    details,
    hubspotEventType: event.eventType,
  };

  return relationshipEvent;
}
