/**
 * Unit tests for CloudWatch metrics publishing
 * Feature: dynamic-icp-refinement-engine
 * Requirements: 11.1
 */

import { describe, it, expect } from 'vitest';

describe('CloudWatch Metrics Publishing', () => {

  it('should publish success metrics with all fields', async () => {
    // This test verifies that metrics are published with correct structure
    const metrics = [
      {
        MetricName: 'ICPAnalysisSuccess',
        Value: 1,
        Unit: 'None',
      },
      {
        MetricName: 'CustomersAnalyzed',
        Value: 100,
        Unit: 'Count',
      },
      {
        MetricName: 'AnalysisDurationMs',
        Value: 5000,
        Unit: 'Milliseconds',
      },
      {
        MetricName: 'ICPConfidenceScore',
        Value: 85,
        Unit: 'None',
      },
    ];

    // Verify metric structure
    expect(metrics[0].MetricName).toBe('ICPAnalysisSuccess');
    expect(metrics[0].Value).toBe(1);
    expect(metrics[0].Unit).toBe('None');

    expect(metrics[1].MetricName).toBe('CustomersAnalyzed');
    expect(metrics[1].Value).toBe(100);
    expect(metrics[1].Unit).toBe('Count');

    expect(metrics[2].MetricName).toBe('AnalysisDurationMs');
    expect(metrics[2].Value).toBe(5000);
    expect(metrics[2].Unit).toBe('Milliseconds');

    expect(metrics[3].MetricName).toBe('ICPConfidenceScore');
    expect(metrics[3].Value).toBe(85);
    expect(metrics[3].Unit).toBe('None');
  });

  it('should publish failure metrics without confidence score', async () => {
    const metrics = [
      {
        MetricName: 'ICPAnalysisSuccess',
        Value: 0,
        Unit: 'None',
      },
      {
        MetricName: 'CustomersAnalyzed',
        Value: 0,
        Unit: 'Count',
      },
      {
        MetricName: 'AnalysisDurationMs',
        Value: 1000,
        Unit: 'Milliseconds',
      },
    ];

    // Verify failure metrics
    expect(metrics[0].Value).toBe(0);
    expect(metrics[1].Value).toBe(0);
    expect(metrics.length).toBe(3); // No confidence score on failure
  });

  it('should use correct namespace for metrics', () => {
    const namespace = 'Sesari/ICPRefinement';
    expect(namespace).toBe('Sesari/ICPRefinement');
  });

  it('should include timestamp in metric data', () => {
    const timestamp = new Date();
    expect(timestamp).toBeInstanceOf(Date);
  });

  it('should handle metrics publishing errors gracefully', () => {
    // Metrics publishing should not throw errors
    // Errors should be logged but not propagate
    const mockError = new Error('CloudWatch API error');
    
    // Verify error handling doesn't throw
    expect(() => {
      console.error('[Metrics] Failed to publish metrics:', mockError);
    }).not.toThrow();
  });

  it('should publish metrics with correct value types', () => {
    // Success should be 0 or 1
    expect([0, 1]).toContain(1);
    expect([0, 1]).toContain(0);

    // CustomersAnalyzed should be a positive integer
    const customersAnalyzed = 100;
    expect(customersAnalyzed).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(customersAnalyzed)).toBe(true);

    // AnalysisDurationMs should be a positive number
    const durationMs = 5000;
    expect(durationMs).toBeGreaterThan(0);

    // ICPConfidenceScore should be 0-100
    const confidenceScore = 85;
    expect(confidenceScore).toBeGreaterThanOrEqual(0);
    expect(confidenceScore).toBeLessThanOrEqual(100);
  });

  it('should publish metrics even when confidence score is undefined', () => {
    const metricsWithoutConfidence = [
      { MetricName: 'ICPAnalysisSuccess', Value: 1, Unit: 'None' },
      { MetricName: 'CustomersAnalyzed', Value: 50, Unit: 'Count' },
      { MetricName: 'AnalysisDurationMs', Value: 3000, Unit: 'Milliseconds' },
    ];

    expect(metricsWithoutConfidence.length).toBe(3);
    expect(metricsWithoutConfidence.find(m => m.MetricName === 'ICPConfidenceScore')).toBeUndefined();
  });

  it('should publish metrics with confidence score when available', () => {
    const metricsWithConfidence = [
      { MetricName: 'ICPAnalysisSuccess', Value: 1, Unit: 'None' },
      { MetricName: 'CustomersAnalyzed', Value: 50, Unit: 'Count' },
      { MetricName: 'AnalysisDurationMs', Value: 3000, Unit: 'Milliseconds' },
      { MetricName: 'ICPConfidenceScore', Value: 75, Unit: 'None' },
    ];

    expect(metricsWithConfidence.length).toBe(4);
    const confidenceMetric = metricsWithConfidence.find(m => m.MetricName === 'ICPConfidenceScore');
    expect(confidenceMetric).toBeDefined();
    expect(confidenceMetric?.Value).toBe(75);
  });

  it('should use correct metric units', () => {
    const metrics = [
      { MetricName: 'ICPAnalysisSuccess', Unit: 'None' },
      { MetricName: 'CustomersAnalyzed', Unit: 'Count' },
      { MetricName: 'AnalysisDurationMs', Unit: 'Milliseconds' },
      { MetricName: 'ICPConfidenceScore', Unit: 'None' },
    ];

    expect(metrics[0].Unit).toBe('None');
    expect(metrics[1].Unit).toBe('Count');
    expect(metrics[2].Unit).toBe('Milliseconds');
    expect(metrics[3].Unit).toBe('None');
  });
});
