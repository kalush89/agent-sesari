/**
 * CloudWatch custom metrics utility for Lambda functions
 * Tracks credential operations for monitoring and alerting
 */

import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { logError } from './logging';

export type MetricName =
  | 'CredentialStored'
  | 'ValidationSuccess'
  | 'ValidationFailure'
  | 'TokenRefresh';

export interface MetricDimensions {
  ServiceName?: string;
  CredentialType?: string;
  [key: string]: string | undefined;
}

/**
 * Records a custom metric to CloudWatch
 * @param metricName - Name of the metric to record
 * @param value - Metric value (default: 1 for count metrics)
 * @param dimensions - Additional dimensions for filtering (e.g., ServiceName)
 */
export async function recordMetric(
  metricName: MetricName,
  value: number = 1,
  dimensions: MetricDimensions = {}
): Promise<void> {
  const client = new CloudWatchClient({ region: process.env.AWS_REGION });

  const metricDimensions = Object.entries(dimensions)
    .filter(([_, v]) => v !== undefined)
    .map(([key, value]) => ({
      Name: key,
      Value: value as string
    }));

  try {
    await client.send(
      new PutMetricDataCommand({
        Namespace: 'Sesari/CredentialVault',
        MetricData: [
          {
            MetricName: metricName,
            Value: value,
            Unit: 'Count',
            Timestamp: new Date(),
            Dimensions: metricDimensions.length > 0 ? metricDimensions : undefined
          }
        ]
      })
    );
  } catch (error) {
    // Log error but don't throw - metrics should not break the main flow
    logError('Failed to record CloudWatch metric', {
      metric_name: metricName,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Records a CredentialStored metric
 * @param serviceName - Service name (hubspot, stripe, mixpanel)
 * @param credentialType - Credential type (oauth, api_key, service_account)
 */
export async function recordCredentialStored(
  serviceName: string,
  credentialType: string
): Promise<void> {
  await recordMetric('CredentialStored', 1, {
    ServiceName: serviceName,
    CredentialType: credentialType
  });
}

/**
 * Records a ValidationSuccess metric
 * @param serviceName - Service name (stripe, mixpanel)
 */
export async function recordValidationSuccess(serviceName: string): Promise<void> {
  await recordMetric('ValidationSuccess', 1, {
    ServiceName: serviceName
  });
}

/**
 * Records a ValidationFailure metric
 * @param serviceName - Service name (stripe, mixpanel)
 */
export async function recordValidationFailure(serviceName: string): Promise<void> {
  await recordMetric('ValidationFailure', 1, {
    ServiceName: serviceName
  });
}

/**
 * Records a TokenRefresh metric
 * @param serviceName - Service name (hubspot)
 */
export async function recordTokenRefresh(serviceName: string): Promise<void> {
  await recordMetric('TokenRefresh', 1, {
    ServiceName: serviceName
  });
}
