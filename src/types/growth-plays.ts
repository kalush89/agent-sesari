/**
 * Growth Plays type definitions for frontend
 */

export type CommunicationType = 'email' | 'slack';
export type GrowthPlayStatus = 'pending' | 'approved' | 'dismissed' | 'executed' | 'failed' | 'resolved';
export type RiskFactorType = 'usage_decline' | 'renewal_approaching' | 'support_tickets' | 'payment_issues';
export type AuditAction = 'created' | 'approved' | 'dismissed' | 'edited' | 'executed' | 'failed' | 'resolved';

export interface RiskFactor {
  type: RiskFactorType;
  severity: number;
  signalValues: Record<string, any>;
  weight: number;
}

export interface ThoughtTrace {
  riskFactors: RiskFactor[];
  reasoning: string;
  signalSources: string[];
  sourceSignalIds?: string[];
}

export interface AuditEntry {
  action: AuditAction;
  timestamp: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface GrowthPlay {
  id: string;
  customerId: string;
  customerName: string;
  companyName: string;
  riskScore: number;
  communicationType: CommunicationType;
  subject?: string;
  draftContent: string;
  editedContent?: string;
  thoughtTrace: ThoughtTrace;
  status: GrowthPlayStatus;
  createdAt: string;
  updatedAt: string;
  auditTrail: AuditEntry[];
  executionMetadata?: Record<string, any>;
}
