/**
 * CloudWatch custom metrics utility for Lambda functions
 * Tracks credential operations for monitoring and alerting
 */
export type MetricName = 'CredentialStored' | 'ValidationSuccess' | 'ValidationFailure' | 'TokenRefresh';
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
export declare function recordMetric(metricName: MetricName, value?: number, dimensions?: MetricDimensions): Promise<void>;
/**
 * Records a CredentialStored metric
 * @param serviceName - Service name (hubspot, stripe, mixpanel)
 * @param credentialType - Credential type (oauth, api_key, service_account)
 */
export declare function recordCredentialStored(serviceName: string, credentialType: string): Promise<void>;
/**
 * Records a ValidationSuccess metric
 * @param serviceName - Service name (stripe, mixpanel)
 */
export declare function recordValidationSuccess(serviceName: string): Promise<void>;
/**
 * Records a ValidationFailure metric
 * @param serviceName - Service name (stripe, mixpanel)
 */
export declare function recordValidationFailure(serviceName: string): Promise<void>;
/**
 * Records a TokenRefresh metric
 * @param serviceName - Service name (hubspot)
 */
export declare function recordTokenRefresh(serviceName: string): Promise<void>;
//# sourceMappingURL=metrics.d.ts.map