/**
 * Unit tests for HubSpot Webhook Lambda Handler
 * Tests parsing edge cases, error scenarios, and end-to-end processing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../index';
import * as webhookSecurity from '../webhook-security';
import * as signalExtractor from '../signal-extractor';
import * as eventStore from '../event-store';

// Mock all dependencies
vi.mock('../webhook-security');
vi.mock('../signal-extractor');
vi.mock('../event-store');

describe('HubSpot Webhook Lambda Handler', () => {
  beforeEach(() => {
    // Set up environment variables
    process.env.HUBSPOT_WEBHOOK_SECRET = 'test-secret';
    process.env.DYNAMODB_TABLE_NAME = 'test-table';
    process.env.AWS_REGION = 'us-east-1';

    // Reset all mocks
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(webhookSecurity.getWebhookSecret).mockReturnValue('test-secret');
    vi.mocked(webhookSecurity.verifyWebhookSignature).mockReturnValue({ isValid: true });
    vi.mocked(eventStore.eventExists).mockResolvedValue(false);
    vi.mocked(eventStore.putEvent).mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Request Parsing Edge Cases', () => {
    it('should return 400 for empty payload', async () => {
      const event = createMockEvent({
        body: null,
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toBe('Bad Request');
      expect(JSON.parse(result.body).message).toContain('Empty request body');
    });

    it('should return 400 for malformed JSON', async () => {
      const event = createMockEvent({
        body: '{ invalid json }',
        headers: {
          'X-HubSpot-Signature': 'test-signature',
        },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toBe('Bad Request');
      expect(JSON.parse(result.body).message).toContain('Malformed JSON');
    });

    it('should return 400 for missing company ID', async () => {
      const event = createMockEvent({
        body: JSON.stringify({
          eventId: 'test-event-123',
          eventType: 'deal.propertyChange',
          // Missing companyId, associatedCompanyId, and portalId
        }),
        headers: {
          'X-HubSpot-Signature': 'test-signature',
        },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('companyId');
    });

    it('should return 400 for missing signature header', async () => {
      const event = createMockEvent({
        body: JSON.stringify({
          eventId: 'test-event-123',
          eventType: 'deal.propertyChange',
          portalId: 12345,
        }),
        headers: {}, // No signature header
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('X-HubSpot-Signature');
    });

    it('should return 400 for missing eventId', async () => {
      const event = createMockEvent({
        body: JSON.stringify({
          // Missing eventId
          eventType: 'deal.propertyChange',
          portalId: 12345,
        }),
        headers: {
          'X-HubSpot-Signature': 'test-signature',
        },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('eventId');
    });

    it('should return 400 for missing eventType', async () => {
      const event = createMockEvent({
        body: JSON.stringify({
          eventId: 'test-event-123',
          // Missing eventType
          portalId: 12345,
        }),
        headers: {
          'X-HubSpot-Signature': 'test-signature',
        },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('eventType');
    });
  });

  describe('Signature Verification', () => {
    it('should return 401 for invalid signature', async () => {
      const event = createValidMockEvent();

      vi.mocked(webhookSecurity.verifyWebhookSignature).mockReturnValue({
        isValid: false,
        error: 'Signature verification failed',
        errorType: 'invalid_signature',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).error).toBe('Unauthorized');
      expect(webhookSecurity.logSecurityFailure).toHaveBeenCalled();
    });

    it('should return 401 for expired timestamp', async () => {
      const event = createValidMockEvent();

      vi.mocked(webhookSecurity.verifyWebhookSignature).mockReturnValue({
        isValid: false,
        error: 'Webhook timestamp too old',
        errorType: 'expired_timestamp',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(webhookSecurity.logSecurityFailure).toHaveBeenCalled();
    });
  });

  describe('Idempotent Processing', () => {
    it('should return 200 for duplicate event without processing', async () => {
      const event = createValidMockEvent();

      vi.mocked(eventStore.eventExists).mockResolvedValue(true);

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).message).toContain('already processed');
      expect(eventStore.putEvent).not.toHaveBeenCalled();
    });
  });

  describe('Event Processing', () => {
    it('should process valid deal progression event successfully', async () => {
      const event = createValidMockEvent();

      const mockSignal = {
        eventId: 'test-event-123',
        eventType: 'deal_progression' as const,
        companyId: '12345',
        dealId: '67890',
        timestamp: 1234567890,
        processedAt: 1234567890,
        details: {
          oldStage: 'Qualified',
          newStage: 'Proposal',
          isRegression: false,
          dealValue: 50000,
          currency: 'USD',
          dealName: 'Test Deal',
        },
      };

      vi.mocked(signalExtractor.extractRelationshipSignal).mockReturnValue(mockSignal);

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(eventStore.putEvent).toHaveBeenCalledWith(mockSignal);
    });

    it('should return 200 for non-relationship events without storing', async () => {
      const event = createValidMockEvent();

      vi.mocked(signalExtractor.extractRelationshipSignal).mockReturnValue(null);

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).message).toContain('ignored');
      expect(eventStore.putEvent).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should return 500 for DynamoDB unavailable', async () => {
      const event = createValidMockEvent();

      const mockSignal = {
        eventId: 'test-event-123',
        eventType: 'deal_progression' as const,
        companyId: '12345',
        timestamp: 1234567890,
        processedAt: 1234567890,
        details: {} as any,
      };

      vi.mocked(signalExtractor.extractRelationshipSignal).mockReturnValue(mockSignal);
      vi.mocked(eventStore.putEvent).mockRejectedValue(
        new Error('DynamoDB service unavailable')
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toBe('Internal Server Error');
    });

    it('should return 500 for DynamoDB throttling', async () => {
      const event = createValidMockEvent();

      const mockSignal = {
        eventId: 'test-event-123',
        eventType: 'deal_progression' as const,
        companyId: '12345',
        timestamp: 1234567890,
        processedAt: 1234567890,
        details: {} as any,
      };

      vi.mocked(signalExtractor.extractRelationshipSignal).mockReturnValue(mockSignal);
      vi.mocked(eventStore.putEvent).mockRejectedValue(
        new Error('Failed to store event after 3 attempts: ProvisionedThroughputExceededException')
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
    });

    it('should return 500 for unhandled exception', async () => {
      const event = createValidMockEvent();

      vi.mocked(signalExtractor.extractRelationshipSignal).mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toBe('Internal Server Error');
    });

    it('should log timeout warning at 8 seconds', async () => {
      vi.useFakeTimers();
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const event = createValidMockEvent();

      const mockSignal = {
        eventId: 'test-event-123',
        eventType: 'deal_progression' as const,
        companyId: '12345',
        timestamp: 1234567890,
        processedAt: 1234567890,
        details: {} as any,
      };

      vi.mocked(signalExtractor.extractRelationshipSignal).mockReturnValue(mockSignal);
      
      // Make putEvent take longer than 8 seconds
      vi.mocked(eventStore.putEvent).mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 9000));
      });

      const handlerPromise = handler(event);

      // Fast-forward time to trigger timeout warning
      await vi.advanceTimersByTimeAsync(8000);

      expect(consoleWarnSpy).toHaveBeenCalled();
      const logCall = consoleWarnSpy.mock.calls[0][0];
      expect(logCall).toContain('Processing time exceeded 8 seconds');

      // Complete the handler
      await vi.advanceTimersByTimeAsync(2000);
      await handlerPromise;

      vi.useRealTimers();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('Environment Validation', () => {
    it('should throw error for missing HUBSPOT_WEBHOOK_SECRET', async () => {
      delete process.env.HUBSPOT_WEBHOOK_SECRET;

      const event = createValidMockEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toContain('HUBSPOT_WEBHOOK_SECRET');
    });

    it('should throw error for missing DYNAMODB_TABLE_NAME', async () => {
      delete process.env.DYNAMODB_TABLE_NAME;

      const event = createValidMockEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toContain('DYNAMODB_TABLE_NAME');
    });
  });

  describe('Response Format', () => {
    it('should return proper success response format', async () => {
      const event = createValidMockEvent();

      const mockSignal = {
        eventId: 'test-event-123',
        eventType: 'deal_progression' as const,
        companyId: '12345',
        timestamp: 1234567890,
        processedAt: 1234567890,
        details: {} as any,
      };

      vi.mocked(signalExtractor.extractRelationshipSignal).mockReturnValue(mockSignal);

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('message');
      expect(body).toHaveProperty('eventId', 'test-event-123');
    });

    it('should return proper error response format', async () => {
      const event = createMockEvent({
        body: null,
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('message');
    });
  });
});

/**
 * Helper function to create a mock API Gateway event
 */
function createMockEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/hubspot-webhook',
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
        sourceIp: '192.168.1.1',
        user: null,
        userAgent: 'HubSpot-Webhook',
        userArn: null,
      },
      path: '/hubspot-webhook',
      stage: 'prod',
      requestId: 'test-request-id',
      requestTime: '01/Jan/2024:00:00:00 +0000',
      requestTimeEpoch: 1704067200000,
      resourceId: 'test-resource',
      resourcePath: '/hubspot-webhook',
    },
    resource: '/hubspot-webhook',
    ...overrides,
  } as APIGatewayProxyEvent;
}

/**
 * Helper function to create a valid mock event with all required fields
 */
function createValidMockEvent(): APIGatewayProxyEvent {
  return createMockEvent({
    body: JSON.stringify({
      eventId: 'test-event-123',
      eventType: 'deal.propertyChange',
      portalId: 12345,
      occurredAt: 1234567890000,
      subscriptionId: 1,
      attemptNumber: 0,
      objectId: 67890,
      propertyName: 'dealstage',
      propertyValue: 'Proposal',
    }),
    headers: {
      'X-HubSpot-Signature': 'test-signature',
      'X-HubSpot-Request-Timestamp': String(Date.now()),
    },
  });
}
