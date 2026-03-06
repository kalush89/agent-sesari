/**
 * Core type definitions for the Automated Growth Plays system
 * 
 * This module defines all data structures used across the growth plays feature,
 * including Growth Plays, Risk Profiles, Customer Profiles, and supporting types.
 */

/**
 * Communication type for Growth Play execution
 */
export type CommunicationType = 'email' | 'slack';

/**
 * Growth Play status throughout its lifecycle
 */
export type GrowthPlayStatus = 'pending' | 'approved' | 'dismissed' | 'executed' | 'failed' | 'resolved';

/**
 * Risk factor types detected by the Signal Correlator
 */
export type RiskFactorType = 'usage_decline' | 'renewal_approaching' | 'support_tickets' | 'payment_issues';

/**
 * Audit trail action types
 */
export type AuditAction = 'created' | 'approved' | 'dismissed' | 'edited' | 'executed' | 'failed' | 'resolved';

/**
 * Stripe subscription status
 */
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled';

/**
 * Risk factor contributing to overall customer risk score
 */
export interface RiskFactor {
  /** Type of risk factor */
  type: RiskFactorType;
  /** Severity score (0-100) */
  severity: number;
  /** Raw signal data for audit trail */
  signalValues: Record<string, any>;
  /** Weight contribution to overall risk score (0-1) */
  weight: number;
}

/**
 * Thought trace explaining why a Growth Play was created
 */
export interface ThoughtTrace {
  /** Risk factors that triggered this Growth Play */
  riskFactors: RiskFactor[];
  /** Natural language explanation of the reasoning */
  reasoning: string;
  /** Signal sources used (e.g., ["Mixpanel", "Stripe"]) */
  signalSources: string[];
}

/**
 * Audit trail entry tracking Growth Play state changes
 */
export interface AuditEntry {
  /** Action performed */
  action: AuditAction;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** User ID who performed the action (optional) */
  userId?: string;
  /** Additional metadata about the action */
  metadata?: Record<string, any>;
}

/**
 * Growth Play - A system-generated actionable recommendation
 */
export interface GrowthPlay {
  /** Unique identifier (UUID) */
  id: string;
  /** Customer identifier */
  customerId: string;
  /** Customer name */
  customerName: string;
  /** Company name */
  companyName: string;
  /** Risk score (0-100) */
  riskScore: number;
  /** Communication type */
  communicationType: CommunicationType;
  /** Email subject line (required for email, omitted for Slack) */
  subject?: string;
  /** Generated draft content */
  draftContent: string;
  /** User-edited content (if modified before approval) */
  editedContent?: string;
  /** Explainability information */
  thoughtTrace: ThoughtTrace;
  /** Current status */
  status: GrowthPlayStatus;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 last update timestamp */
  updatedAt: string;
  /** Complete audit trail */
  auditTrail: AuditEntry[];
  /** Execution metadata (message ID, delivery status, etc.) */
  executionMetadata?: Record<string, any>;
}

/**
 * Customer risk profile with calculated risk score
 */
export interface RiskProfile {
  /** Customer identifier */
  customerId: string;
  /** Calculated risk score (0-100) */
  riskScore: number;
  /** Risk factors contributing to the score */
  riskFactors: RiskFactor[];
  /** ISO 8601 detection timestamp */
  detectedAt: string;
}

/**
 * Mixpanel behavioral signals
 */
export interface MixpanelSignals {
  /** Event count in last 30 days */
  eventCount30Days: number;
  /** Event count in last 60 days */
  eventCount60Days: number;
  /** ISO 8601 last active date */
  lastActiveDate: string;
}

/**
 * HubSpot relationship signals
 */
export interface HubSpotSignals {
  /** Number of open support tickets */
  openTickets: number;
  /** ISO 8601 last contact date */
  lastContactDate: string;
}

/**
 * Stripe revenue signals
 */
export interface StripeSignals {
  /** Current subscription status */
  subscriptionStatus: SubscriptionStatus;
  /** ISO 8601 renewal date */
  renewalDate: string;
  /** Monthly recurring revenue in cents */
  mrr: number;
}

/**
 * Unified customer profile combining all signal sources
 */
export interface UnifiedCustomerProfile {
  /** Customer identifier */
  customerId: string;
  /** Customer email address */
  email: string;
  /** Company name */
  companyName: string;
  /** Mixpanel behavioral data */
  mixpanelData: MixpanelSignals;
  /** HubSpot relationship data */
  hubspotData: HubSpotSignals;
  /** Stripe revenue data */
  stripeData: StripeSignals;
}

/**
 * Signal Orchestrator input
 */
export interface SignalOrchestratorInput {
  /** Force refresh, bypassing cache */
  forceRefresh?: boolean;
  /** Time range in hours (default: 720 = 30 days) */
  timeRangeHours?: number;
}

/**
 * Signal Orchestrator output
 */
export interface SignalOrchestratorOutput {
  /** Entity signal profiles grouped by entity */
  entityProfiles: EntitySignalProfile[];
  /** Whether data was retrieved from cache */
  cacheHit: boolean;
  /** ISO 8601 timestamp */
  timestamp: string;
}

/**
 * Entity signal profile with signals grouped by category
 */
export interface EntitySignalProfile {
  /** Entity identifier (primary key from UniversalSignals) */
  entityId: string;
  /** Customer email address */
  email: string;
  /** Signals grouped by category */
  signals: {
    revenue: Universal_Signal[];
    relationship: Universal_Signal[];
    behavioral: Universal_Signal[];
  };
  /** Platform IDs for cross-platform correlation */
  platformIds: {
    stripe?: string;
    hubspot?: string;
    mixpanel?: string;
  };
}

/**
 * Universal Signal from the Universal Signal Schema feature
 */
export interface Universal_Signal {
  /** Unique signal identifier */
  signalId: string;
  /** Signal category */
  category: 'revenue' | 'relationship' | 'behavioral';
  /** Universal event type */
  eventType: string;
  /** Entity identification */
  entity: {
    primaryKey: string;
    alternateKeys: string[];
    platformIds: {
      stripe?: string;
      hubspot?: string;
      mixpanel?: string;
    };
  };
  /** Unix timestamp when event occurred */
  occurredAt: number;
  /** Unix timestamp when signal was processed */
  processedAt: number;
  /** Source tracking */
  source: {
    platform: 'stripe' | 'hubspot' | 'mixpanel';
    originalEventType: string;
    originalEventId: string;
  };
  /** Impact metrics */
  impact: {
    severity: 'critical' | 'high' | 'medium' | 'low';
    metrics: Record<string, any>;
  };
  /** Platform-specific details */
  platformDetails: Record<string, any>;
  /** TTL for automatic expiration */
  ttl: number;
}

/**
 * Signal Correlator input
 */
export interface SignalCorrelatorInput {
  /** Unified customer profiles to analyze */
  customers: UnifiedCustomerProfile[];
}

/**
 * Signal Correlator output
 */
export interface SignalCorrelatorOutput {
  /** High-risk customers (score > 70) */
  highRiskCustomers: RiskProfile[];
  /** Total customers analyzed */
  totalAnalyzed: number;
}

/**
 * Draft Generator input
 */
export interface DraftGeneratorInput {
  /** Risk profile for the customer */
  riskProfile: RiskProfile;
  /** Customer profile with contact information */
  customerProfile: UnifiedCustomerProfile;
  /** Type of communication to generate */
  communicationType: CommunicationType;
}

/**
 * Draft Generator output
 */
export interface DraftGeneratorOutput {
  /** Generated Growth Play */
  growthPlay: GrowthPlay;
}

/**
 * Execution Engine input
 */
export interface ExecutionEngineInput {
  /** Growth Play ID to execute */
  growthPlayId: string;
  /** User ID approving the execution */
  userId: string;
  /** User-edited content (if modified) */
  editedContent?: string;
}

/**
 * Execution Engine output
 */
export interface ExecutionEngineOutput {
  /** Whether execution succeeded */
  success: boolean;
  /** Delivery status */
  deliveryStatus: 'sent' | 'failed';
  /** Message ID from SES or Slack */
  messageId?: string;
  /** Error message if failed */
  error?: string;
  /** Number of retry attempts */
  retryCount: number;
}

/**
 * Parse error details
 */
export interface ParseError {
  /** Field that failed validation */
  field: string;
  /** Error message */
  message: string;
  /** Value that was received */
  receivedValue: any;
}

/**
 * Result type for operations that can fail
 */
export type Result<T, E> = 
  | { success: true; value: T }
  | { success: false; error: E };
