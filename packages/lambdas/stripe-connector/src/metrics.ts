/**
 * CloudWatch metrics emission for webhook processing observability
 * Tracks success, failure, and latency metrics
 */

import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

/**
 * Lazy initialization of CloudWatch client
 */
let cloudWatchClient: CloudWatchClient | null = null;

function getCloudWatchClient(): CloudWatchClient {
  if (!cloudWatchClient) {
    cloudWatchClient = new CloudWatchClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
  }
  return cloudWatchClient;
}

/**
 * Namespace for custom CloudWatch metrics
 */
const METRIC_NAMESPACE = 'RevenueSenses/StripeConnector';

/**
 * Emits a metric for successful event processing
 * 
 * @param eventType - Type of revenue signal event processed
 */
export async function emitSuccessMetric(eventType: string): Promise<void> {
  try {
    await getCloudWatchClient().send(
      new PutMetricDataCommand({
        Namespace: METRIC_NAMESPACE,
        MetricData: [
          {
            MetricName: 'EventProcessed',
            Value: 1,
            Unit: 'Count',
            Dimensions: [
              {
                Name: 'EventType',
                Value: eventType,
              },
              {
                Name: 'Status',
                Value: 'Success',
              },
            ],
          },
        ],
      })
    );
  } catch (error) {
    // Don't fail webhook processing if metrics emission fails
    console.error('Failed to emit success metric:', error);
  }
}

/**
 * Emits a metric for failed event processing
 * 
 * @param errorType - Type of error that occurred
 */
export async function emitFailureMetric(errorType: string): Promise<void> {
  try {
    await getCloudWatchClient().send(
      new PutMetricDataCommand({
        Namespace: METRIC_NAMESPACE,
        MetricData: [
          {
            MetricName: 'EventProcessed',
            Value: 1,
            Unit: 'Count',
            Dimensions: [
              {
                Name: 'Status',
                Value: 'Failure',
              },
              {
                Name: 'ErrorType',
                Value: errorType,
              },
            ],
          },
        ],
      })
    );
  } catch (error) {
    console.error('Failed to emit failure metric:', error);
  }
}

/**
 * Emits a metric for webhook processing latency
 * 
 * @param durationMs - Processing duration in milliseconds
 * @param eventType - Type of event processed
 */
export async function emitLatencyMetric(durationMs: number, eventType?: string): Promise<void> {
  try {
    const dimensions = eventType
      ? [{ Name: 'EventType', Value: eventType }]
      : [];

    await getCloudWatchClient().send(
      new PutMetricDataCommand({
        Namespace: METRIC_NAMESPACE,
        MetricData: [
          {
            MetricName: 'ProcessingLatency',
            Value: durationMs,
            Unit: 'Milliseconds',
            Dimensions: dimensions,
          },
        ],
      })
    );
  } catch (error) {
    console.error('Failed to emit latency metric:', error);
  }
}
