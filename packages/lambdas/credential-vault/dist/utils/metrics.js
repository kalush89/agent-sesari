"use strict";
/**
 * CloudWatch custom metrics utility for Lambda functions
 * Tracks credential operations for monitoring and alerting
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordMetric = recordMetric;
exports.recordCredentialStored = recordCredentialStored;
exports.recordValidationSuccess = recordValidationSuccess;
exports.recordValidationFailure = recordValidationFailure;
exports.recordTokenRefresh = recordTokenRefresh;
const client_cloudwatch_1 = require("@aws-sdk/client-cloudwatch");
const logging_1 = require("./logging");
/**
 * Records a custom metric to CloudWatch
 * @param metricName - Name of the metric to record
 * @param value - Metric value (default: 1 for count metrics)
 * @param dimensions - Additional dimensions for filtering (e.g., ServiceName)
 */
async function recordMetric(metricName, value = 1, dimensions = {}) {
    const client = new client_cloudwatch_1.CloudWatchClient({ region: process.env.AWS_REGION });
    const metricDimensions = Object.entries(dimensions)
        .filter(([_, v]) => v !== undefined)
        .map(([key, value]) => ({
        Name: key,
        Value: value
    }));
    try {
        await client.send(new client_cloudwatch_1.PutMetricDataCommand({
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
        }));
    }
    catch (error) {
        // Log error but don't throw - metrics should not break the main flow
        (0, logging_1.logError)('Failed to record CloudWatch metric', {
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
async function recordCredentialStored(serviceName, credentialType) {
    await recordMetric('CredentialStored', 1, {
        ServiceName: serviceName,
        CredentialType: credentialType
    });
}
/**
 * Records a ValidationSuccess metric
 * @param serviceName - Service name (stripe, mixpanel)
 */
async function recordValidationSuccess(serviceName) {
    await recordMetric('ValidationSuccess', 1, {
        ServiceName: serviceName
    });
}
/**
 * Records a ValidationFailure metric
 * @param serviceName - Service name (stripe, mixpanel)
 */
async function recordValidationFailure(serviceName) {
    await recordMetric('ValidationFailure', 1, {
        ServiceName: serviceName
    });
}
/**
 * Records a TokenRefresh metric
 * @param serviceName - Service name (hubspot)
 */
async function recordTokenRefresh(serviceName) {
    await recordMetric('TokenRefresh', 1, {
        ServiceName: serviceName
    });
}
//# sourceMappingURL=metrics.js.map