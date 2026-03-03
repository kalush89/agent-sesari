/**
 * Unit tests for Mixpanel webhook Lambda handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../index.js';
import * as webhookSecurity from '../webhook-security.js';
import * as signalExtractor from '../signal-extractor.js';
import * as eventStore from '../event-store.js';

// Mock modules
vi.mock('../webhook-security.js');
vi.mock('../signal-extractor.js');
vi.mock('../event-store.js');

describe('Mixpanel Webhook Handler', () => {
  beforeEach(() => {
    // Set required environment variables
    process.env.MIXPANEL_WEBHOOK_SECRET = 'test-secret';
    process.env.DYNAMODB_SIGNALS_TABLE = 'test-signals-table';
    process.env.DYNAMODB_BASELINES_TABLE = 'test-baselines-table';
    process.env.AWS_REGION = 'us-east-1';

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Request Parsing', () => {
    it('should return 400 for empty payload', async () => {
      const event = createMockEvent({
        body: null,
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toBe('Bad Request');
      expect(JSON.parse(result.body).message).toBe('Empty request body');
    });

    it('should return 400 for malformed JSON', async () => {
      const event = createMockEvent({
        body: '{invalid json}',
        headers: {
          'X-Mixpanel-Signature': 'test-signature',
        },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toBe('Bad Request');
      expect(JSON.parse(result.body).message).toBe('Malformed JSON payload');
    });

    it('should return 400 for missing user ID (distinct_id)', async () => {
      const event = createMockEvent({
        body: JSON.stringify({
          event: 'Test Event',
          properties: {
            // Missing distinct_id
            time: 1234567890,
          },
        }),
        headers: {
          'X-Mixpanel-Signature': 'test-signature',
        },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toBe('Bad Request');
      expect(JSON.parse(result.body).message).toBe('Missing required field: properties.distinct_id');
    });

    it('should return 400 for missing signature header', async () => {
      const event = createMockEvent({
        body: JSON.stringify({
          event: 'Test Event',
          properties: {
            distinct_id: 'user123',
          },
        }),
        headers: {
          // Missing X-Mixpanel-Signature
        },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toBe('Bad Request');
      expect(JSON.parse(result.body).message).toBe('Missing X-Mixpanel-Signature header');
    });

    it('should return 400 for missing event name', async () => {
      const event = createMockEvent({
        body: JSON.stringify({
          // Missing event field
          properties: {
            distinct_id: 'user123',
          },
        }),
        headers: {
          'X-Mixpanel-Signature': 'test-signature',
        },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toBe('Bad Request');
      expect(JSON.parse(result.body).message).toContain('Invalid payload format');
    });

    it('should handle case-insensitive headers', async () => {
      const mockEvent = {
        event: 'Test Event',
        properties: {
          distinct_id: 'user123',
          $insert_id: 'event123',
        },
      };

      const event = createMockEvent({
        body: JSON.stringify(mockEvent),
        headers: {
          'x-mixpanel-signature': 'test-signature', // lowercase
          'x-mixpanel-timestamp': '1234567890',
        },
      });

      vi.mocked(webhookSecurity.getWebhookSecret).mockReturnValue('test-secret');
      vi.mocked(webhookSecurity.verifyWebhookSignature).mockReturnValue({
        isValid: true,
      });
      vi.mocked(signalExtractor.processBatchEvents).mockReturnValue([
        {
          eventId: 'event123',
          userId: 'user123',
          feature: 'test_event',
          eventName: 'Test Event',
          timestamp: 1234567890,
          properties: mockEvent.properties,
          expiresAt: 1234567890 + (90 * 24 * 60 * 60),
        },
      ]);
      vi.mocked(eventStore.eventExists).mockResolvedValue(false);
      vi.mocked(eventStore.storeUsageEvent).mockResolvedValue();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(vi.mocked(webhookSecurity.verifyWebhookSignature)).toHaveBeenCalled();
    });
  });

  describe('Signature Verification', () => {
    it('should return 401 for invalid signature', async () => {
      const event = createMockEvent({
        body: JSON.stringify({
          event: 'Test Event',
          properties: {
            distinct_id: 'user123',
          },
        }),
        headers: {
          'X-Mixpanel-Signature': 'invalid-signature',
        },
      });

      vi.mocked(webhookSecurity.getWebhookSecret).mockReturnValue('test-secret');
      vi.mocked(webhookSecurity.verifyWebhookSignature).mockReturnValue({
        isValid: false,
        error: 'Signature verification failed',
        errorType: 'invalid_signature',
      });
      vi.mocked(webhookSecurity.createSecurityLogEntry).mockReturnValue({
        timestamp: Date.now(),
        errorType: 'invalid_signature',
        errorMessage: 'Signature verification failed',
      });
      vi.mocked(webhookSecurity.logSecurityFailure).mockImplementation(() => {});

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).error).toBe('Unauthorized');
      expect(vi.mocked(webhookSecurity.logSecurityFailure)).toHaveBeenCalled();
    });

    it('should return 401 for expired timestamp', async () => {
      const event = createMockEvent({
        body: JSON.stringify({
          event: 'Test Event',
          properties: {
            distinct_id: 'user123',
          },
        }),
        headers: {
          'X-Mixpanel-Signature': 'test-signature',
          'X-Mixpanel-Timestamp': String(Date.now() - 10 * 60 * 1000), // 10 minutes ago
        },
      });

      vi.mocked(webhookSecurity.getWebhookSecret).mockReturnValue('test-secret');
      vi.mocked(webhookSecurity.verifyWebhookSignature).mockReturnValue({
        isValid: false,
        error: 'Webhook timestamp too old',
        errorType: 'expired_timestamp',
      });
      vi.mocked(webhookSecurity.createSecurityLogEntry).mockReturnValue({
        timestamp: Date.now(),
        errorType: 'expired_timestamp',
        errorMessage: 'Webhook timestamp too old',
      });
      vi.mocked(webhookSecurity.logSecurityFailure).mockImplementation(() => {});

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).error).toBe('Unauthorized');
    });
  });

  describe('Event Processing', () => {
    it('should process valid single event successfully', async () => {
      const mockEvent = {
        event: 'Feature Used',
        properties: {
          distinct_id: 'user123',
          $insert_id: 'event123',
          feature: 'dashboard',
        },
      };

      const event = createMockEvent({
        body: JSON.stringify(mockEvent),
        headers: {
          'X-Mixpanel-Signature': 'valid-signature',
        },
      });

      vi.mocked(webhookSecurity.getWebhookSecret).mockReturnValue('test-secret');
      vi.mocked(webhookSecurity.verifyWebhookSignature).mockReturnValue({
        isValid: true,
      });
      vi.mocked(signalExtractor.processBatchEvents).mockReturnValue([
        {
          eventId: 'event123',
          userId: 'user123',
          feature: 'dashboard',
          eventName: 'Feature Used',
          timestamp: 1234567890,
          properties: mockEvent.properties,
          expiresAt: 1234567890 + (90 * 24 * 60 * 60),
        },
      ]);
      vi.mocked(eventStore.eventExists).mockResolvedValue(false);
      vi.mocked(eventStore.storeUsageEvent).mockResolvedValue();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).success).toBe(true);
      expect(vi.mocked(eventStore.storeUsageEvent)).toHaveBeenCalledTimes(1);
    });

    it('should process batch events successfully', async () => {
      const mockEvents = [
        {
          event: 'Feature Used',
          properties: {
            distinct_id: 'user123',
            $insert_id: 'event1',
          },
        },
        {
          event: 'Button Clicked',
          properties: {
            distinct_id: 'user456',
            $insert_id: 'event2',
          },
        },
      ];

      const event = createMockEvent({
        body: JSON.stringify(mockEvents),
        headers: {
          'X-Mixpanel-Signature': 'valid-signature',
        },
      });

      vi.mocked(webhookSecurity.getWebhookSecret).mockReturnValue('test-secret');
      vi.mocked(webhookSecurity.verifyWebhookSignature).mockReturnValue({
        isValid: true,
      });
      vi.mocked(signalExtractor.processBatchEvents).mockReturnValue([
        {
          eventId: 'event1',
          userId: 'user123',
          feature: 'feature_used',
          eventName: 'Feature Used',
          timestamp: 1234567890,
          properties: mockEvents[0].properties,
          expiresAt: 1234567890 + (90 * 24 * 60 * 60),
        },
        {
          eventId: 'event2',
          userId: 'user456',
          feature: 'button_clicked',
          eventName: 'Button Clicked',
          timestamp: 1234567890,
          properties: mockEvents[1].properties,
          expiresAt: 1234567890 + (90 * 24 * 60 * 60),
        },
      ]);
      vi.mocked(eventStore.eventExists).mockResolvedValue(false);
      vi.mocked(eventStore.storeUsageEvent).mockResolvedValue();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).success).toBe(true);
      expect(vi.mocked(eventStore.storeUsageEvent)).toHaveBeenCalledTimes(2);
    });

    it('should handle duplicate events gracefully', async () => {
      const mockEvent = {
        event: 'Feature Used',
        properties: {
          distinct_id: 'user123',
          $insert_id: 'event123',
        },
      };

      const event = createMockEvent({
        body: JSON.stringify(mockEvent),
        headers: {
          'X-Mixpanel-Signature': 'valid-signature',
        },
      });

      vi.mocked(webhookSecurity.getWebhookSecret).mockReturnValue('test-secret');
      vi.mocked(webhookSecurity.verifyWebhookSignature).mockReturnValue({
        isValid: true,
      });
      vi.mocked(signalExtractor.processBatchEvents).mockReturnValue([
        {
          eventId: 'event123',
          userId: 'user123',
          feature: 'feature_used',
          eventName: 'Feature Used',
          timestamp: 1234567890,
          properties: mockEvent.properties,
          expiresAt: 1234567890 + (90 * 24 * 60 * 60),
        },
      ]);
      vi.mocked(eventStore.eventExists).mockResolvedValue(true); // Duplicate
      vi.mocked(eventStore.storeUsageEvent).mockResolvedValue();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).success).toBe(true);
      expect(vi.mocked(eventStore.storeUsageEvent)).not.toHaveBeenCalled();
    });

    it('should return success when no behavioral events to process', async () => {
      const mockEvent = {
        event: 'Session Start', // System event
        properties: {
          distinct_id: 'user123',
        },
      };

      const event = createMockEvent({
        body: JSON.stringify(mockEvent),
        headers: {
          'X-Mixpanel-Signature': 'valid-signature',
        },
      });

      vi.mocked(webhookSecurity.getWebhookSecret).mockReturnValue('test-secret');
      vi.mocked(webhookSecurity.verifyWebhookSignature).mockReturnValue({
        isValid: true,
      });
      vi.mocked(signalExtractor.processBatchEvents).mockReturnValue([]); // No behavioral events

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).message).toBe('No behavioral events to process');
      expect(vi.mocked(eventStore.storeUsageEvent)).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should return 500 for DynamoDB unavailability', async () => {
      const mockEvent = {
        event: 'Feature Used',
        properties: {
          distinct_id: 'user123',
          $insert_id: 'event123',
        },
      };

      const event = createMockEvent({
        body: JSON.stringify(mockEvent),
        headers: {
          'X-Mixpanel-Signature': 'valid-signature',
        },
      });

      vi.mocked(webhookSecurity.getWebhookSecret).mockReturnValue('test-secret');
      vi.mocked(webhookSecurity.verifyWebhookSignature).mockReturnValue({
        isValid: true,
      });
      vi.mocked(signalExtractor.processBatchEvents).mockReturnValue([
        {
          eventId: 'event123',
          userId: 'user123',
          feature: 'feature_used',
          eventName: 'Feature Used',
          timestamp: 1234567890,
          properties: mockEvent.properties,
          expiresAt: 1234567890 + (90 * 24 * 60 * 60),
        },
      ]);
      vi.mocked(eventStore.eventExists).mockResolvedValue(false);
      vi.mocked(eventStore.storeUsageEvent).mockRejectedValue(
        new Error('DynamoDB unavailable')
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toBe('Internal Server Error');
    });

    it('should return 500 for DynamoDB throttling', async () => {
      const mockEvent = {
        event: 'Feature Used',
        properties: {
          distinct_id: 'user123',
          $insert_id: 'event123',
        },
      };

      const event = createMockEvent({
        body: JSON.stringify(mockEvent),
        headers: {
          'X-Mixpanel-Signature': 'valid-signature',
        },
      });

      vi.mocked(webhookSecurity.getWebhookSecret).mockReturnValue('test-secret');
      vi.mocked(webhookSecurity.verifyWebhookSignature).mockReturnValue({
        isValid: true,
      });
      vi.mocked(signalExtractor.processBatchEvents).mockReturnValue([
        {
          eventId: 'event123',
          userId: 'user123',
          feature: 'feature_used',
          eventName: 'Feature Used',
          timestamp: 1234567890,
          properties: mockEvent.properties,
          expiresAt: 1234567890 + (90 * 24 * 60 * 60),
        },
      ]);
      vi.mocked(eventStore.eventExists).mockResolvedValue(false);
      vi.mocked(eventStore.storeUsageEvent).mockRejectedValue(
        new Error('ProvisionedThroughputExceededException: Request rate throttled')
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toBe('Internal Server Error');
    });

    it('should return 500 for unhandled exceptions', async () => {
      const mockEvent = {
        event: 'Feature Used',
        properties: {
          distinct_id: 'user123',
          $insert_id: 'event123',
        },
      };

      const event = createMockEvent({
        body: JSON.stringify(mockEvent),
        headers: {
          'X-Mixpanel-Signature': 'valid-signature',
        },
      });

      vi.mocked(webhookSecurity.getWebhookSecret).mockReturnValue('test-secret');
      vi.mocked(webhookSecurity.verifyWebhookSignature).mockReturnValue({
        isValid: true,
      });
      vi.mocked(signalExtractor.processBatchEvents).mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toBe('Internal Server Error');
    });

    it('should return 500 for missing environment variables', async () => {
      delete process.env.MIXPANEL_WEBHOOK_SECRET;

      const event = createMockEvent({
        body: JSON.stringify({
          event: 'Test Event',
          properties: {
            distinct_id: 'user123',
          },
        }),
        headers: {
          'X-Mixpanel-Signature': 'test-signature',
        },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toBe('Internal Server Error');
      expect(JSON.parse(result.body).message).toContain('environment variable');
    });
  });

  describe('Timeout Handling', () => {
    it('should log warning when processing exceeds 8 seconds', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const mockEvent = {
        event: 'Feature Used',
        properties: {
          distinct_id: 'user123',
          $insert_id: 'event123',
        },
      };

      const event = createMockEvent({
        body: JSON.stringify(mockEvent),
        headers: {
          'X-Mixpanel-Signature': 'valid-signature',
        },
      });

      vi.mocked(webhookSecurity.getWebhookSecret).mockReturnValue('test-secret');
      vi.mocked(webhookSecurity.verifyWebhookSignature).mockReturnValue({
        isValid: true,
      });
      vi.mocked(signalExtractor.processBatchEvents).mockReturnValue([
        {
          eventId: 'event123',
          userId: 'user123',
          feature: 'feature_used',
          eventName: 'Feature Used',
          timestamp: 1234567890,
          properties: mockEvent.properties,
          expiresAt: 1234567890 + (90 * 24 * 60 * 60),
        },
      ]);
      vi.mocked(eventStore.eventExists).mockResolvedValue(false);
      vi.mocked(eventStore.storeUsageEvent).mockImplementation(async () => {
        // Simulate slow processing
        await new Promise(resolve => setTimeout(resolve, 8100));
      });

      await handler(event);

      // Wait for timeout warning
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleSpy).toHaveBeenCalled();
      const warnCalls = consoleSpy.mock.calls.filter(call => 
        call[0].includes('Processing time exceeded 8 seconds')
      );
      expect(warnCalls.length).toBeGreaterThan(0);

      consoleSpy.mockRestore();
    }, 10000); // Set timeout to 10 seconds for this test
  });
});

/**
 * Helper function to create mock API Gateway event
 */
function createMockEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/mixpanel-webhook',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      authorizer: null,
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: '1.2.3.4',
        user: null,
        userAgent: 'test-agent',
        userArn: null,
      },
      path: '/mixpanel-webhook',
      stage: 'test',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'test-resource',
      resourcePath: '/mixpanel-webhook',
    },
    resource: '/mixpanel-webhook',
    ...overrides,
  } as APIGatewayProxyEvent;
}
