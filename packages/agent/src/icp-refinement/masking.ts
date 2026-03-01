/**
 * Data masking layer for privacy-preserving LLM analysis
 * Strips PII before sending customer data to Nova Lite
 */

import { ScoredCustomer, MaskedCustomer } from './types';

/**
 * Audit metrics for masking operations
 */
interface MaskingAuditMetrics {
  emailsRemoved: number;
  namesRemoved: number;
  recordsMasked: number;
}

/**
 * Converts exact revenue to privacy-preserving buckets
 */
function bucketRevenue(revenue: number): string {
  if (revenue < 10000) return '<$10K';
  if (revenue < 50000) return '$10K-$50K';
  if (revenue < 100000) return '$50K-$100K';
  return '>$100K';
}

/**
 * Converts exact employee count to privacy-preserving ranges
 */
function bucketEmployeeCount(count: number): string {
  if (count <= 10) return '1-10';
  if (count <= 50) return '11-50';
  if (count <= 200) return '51-200';
  return '200+';
}

/**
 * Calculates engagement bucket from engagement score
 */
function bucketEngagement(score: number): string {
  if (score < 33) return 'Low';
  if (score < 67) return 'Medium';
  return 'High';
}

/**
 * Calculates retention bucket from retention score
 */
function bucketRetention(score: number): string {
  if (score < 33) return 'Low';
  if (score < 67) return 'Medium';
  return 'High';
}

/**
 * Masks customer data by removing PII and bucketing exact values
 * Requirements: 5.1
 */
export function maskCustomerData(customers: ScoredCustomer[]): MaskedCustomer[] {
  const auditMetrics: MaskingAuditMetrics = {
    emailsRemoved: 0,
    namesRemoved: 0,
    recordsMasked: 0,
  };

  const maskedCustomers = customers.map((customer) => {
    // Count PII removals for audit trail
    const emailPattern = /[\w\.-]+@[\w\.-]+\.\w+/g;
    const companyNameEmailMatches = customer.hubspot.name.match(emailPattern);
    if (companyNameEmailMatches) {
      auditMetrics.emailsRemoved += companyNameEmailMatches.length;
    }

    // Remove company name (keep industry only)
    auditMetrics.namesRemoved += 1;

    // Create masked customer record
    const masked: MaskedCustomer = {
      companyId: customer.companyId,
      industry: customer.hubspot.industry,
      employeeCount: customer.hubspot.employeeCount,
      region: customer.hubspot.region,
      ltvBucket: bucketRevenue(customer.hubspot.totalRevenue),
      engagementBucket: bucketEngagement(customer.scoreBreakdown.engagementScore),
      retentionBucket: bucketRetention(customer.scoreBreakdown.retentionScore),
      idealCustomerScore: customer.idealCustomerScore,
    };

    auditMetrics.recordsMasked += 1;
    return masked;
  });

  // Log audit metrics (never log actual PII values)
  console.log('[Masking] Audit trail:', {
    emailsRemoved: auditMetrics.emailsRemoved,
    namesRemoved: auditMetrics.namesRemoved,
    recordsMasked: auditMetrics.recordsMasked,
  });

  return maskedCustomers;
}

/**
 * Validates that no PII remains in masked data
 * Requirements: 5.2
 */
export function validateNoPII(maskedData: MaskedCustomer[]): boolean {
  const emailPattern = /[\w\.-]+@[\w\.-]+\.\w+/g;
  const phonePattern = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

  let piiDetected = false;

  for (const customer of maskedData) {
    // Check all string fields for PII
    const fieldsToCheck = [
      customer.industry,
      customer.region,
      customer.ltvBucket,
      customer.engagementBucket,
      customer.retentionBucket,
    ];

    for (const field of fieldsToCheck) {
      if (emailPattern.test(field)) {
        console.warn('[Masking] Potential email detected in masked data:', {
          companyId: customer.companyId,
          field: 'redacted',
        });
        piiDetected = true;
      }

      if (phonePattern.test(field)) {
        console.warn('[Masking] Potential phone number detected in masked data:', {
          companyId: customer.companyId,
          field: 'redacted',
        });
        piiDetected = true;
      }
    }
  }

  if (piiDetected) {
    throw new Error('PII validation failed: Potential PII detected in masked data');
  }

  return true;
}
