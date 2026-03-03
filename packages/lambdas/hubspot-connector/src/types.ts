/**
 * Core type definitions for HubSpot Relationship Senses
 */

/**
 * Main event stored in DynamoDB
 */
export interface RelationshipSignalEvent {
  // Primary Key
  eventId: string;
  
  // Event Classification
  eventType: 'deal_progression' | 'communication_gap' | 'sentiment';
  
  // Relationship Information
  companyId: string;
  contactId?: string;
  dealId?: string;
  
  // Temporal Data
  timestamp: number;
  processedAt: number;
  
  // Event-Specific Details
  details: DealProgressionDetails | CommunicationGapDetails | SentimentDetails;
  
  // Metadata
  hubspotEventType?: string;
  rawPayload?: string;
}

/**
 * Details for deal stage progression events
 */
export interface DealProgressionDetails {
  oldStage: string;
  newStage: string;
  isRegression: boolean;
  dealValue: number;
  currency: string;
  closeDate?: number;
  dealName: string;
}

/**
 * Details for communication gap detection events
 */
export interface CommunicationGapDetails {
  lastCommunicationDate: number;
  daysSinceLastContact: number;
  importanceLevel: 'high' | 'medium' | 'low';
  relationshipType: 'active_deal' | 'existing_customer';
  dealValue?: number;
  customerLifetimeValue?: number;
}

/**
 * Details for customer sentiment events
 */
export interface SentimentDetails {
  sentimentScore: number;
  sentimentCategory: 'positive' | 'neutral' | 'negative';
  sourceType: 'note' | 'email' | 'call';
  sourceId: string;
  textExcerpt: string;
  keywords: string[];
}
