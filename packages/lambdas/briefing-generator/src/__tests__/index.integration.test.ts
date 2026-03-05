/**
 * Integration tests for Daily Briefing Generator Lambda Handler
 * 
 * Tests the complete flow from EventBridge trigger to DynamoDB storage,
 * including error scenarios and edge cases.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, QueryCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { marshall } from '@aws-sdk/util-dynamodb';
import { handler } from '../index.js';
import type { EventBridgeEvent, Universal_Signal } from '../types.js';

const dynamoMock = mockClient(DynamoDBClient);
const bedrockMock = mockClient(BedrockRuntimeClient);

describe('Lambda Handler Integration Tests', () => {
  beforeEach(() => {
    dynamoMock.reset();
    bedrockMock.reset();
    vi.clearAllMocks();
    
    // Set environment variables
    process.env.UNIVERSAL_SIGNALS_TABLE = 'UniversalSignals';
    process.env.BRIEFING_STORE_TABLE = 'Briefings';
    process.env.BEDROCK_MODEL_ID = 'amazon.nova-lite-v1:0';
    process.env.AWS_REGION = 'us-east-1';
    process.env.MAX_INSIGHTS = '10';
    process.env.NARRATIVE_MAX_WORDS = '150';
  });

  describe('Complete flow from trigger to storage', () => {
    it('should successfully generate and store briefing with signals', async () => {
      const event = createMockEventBridgeEvent();
      
      // Mock signal retrieval - return signals from all three categories
      const revenueSignal = createMockSignal('revenue', 'revenue.expansion');
      const relationshipSignal = createMockSignal('relationship', 'relationship.engagement_gap');
      const behavioralSignal = createMockSignal('behavioral', 'behavioral.power_user');
      
      dynamoMock.on(QueryCommand)
        .resolvesOnce({ Items: [marshall(revenueSignal)] })
        .resolvesOnce({ Items: [marshall(relationshipSignal)] })
        .resolvesOnce({ Items: [marshall(behavioralSignal)] });
      
      // Mock narrative generation
      bedrockMock.on(InvokeModelCommand).resolves(
        createBedrockResponse('Generated narrative for the signal.')
      );
      
      // Mock briefing storage
      dynamoMock.on(PutItemCommand).resolves({});
      
      // Execute handler
      await handler(event);
      
      // Verify signal retrieval (3 queries for 3 categories)
      const queryCommands = dynamoMock.commandCalls(QueryCommand);
      expect(queryCommands).toHaveLength(3);
      
      // Verify narrative generation (3 signals)
      const invokeCommands = bedrockMock.commandCalls(InvokeModelCommand);
      expect(invokeCommands).toHaveLength(3);
      
      // Verify briefing storage
      const putCommands = dynamoMock.commandCalls(PutItemCommand);
      expect(putCommands).toHaveLength(1);
      
      const storedItem = putCommands[0].args[0].input.Item;
      expect(storedItem).toBeDefined();
      if (storedItem) {
        expect(storedItem.PK?.S).toBe('briefing#default');
        expect(storedItem.SK?.S).toMatch(/^date#\d{4}-\d{2}-\d{2}$/);
      }
    });

    it('should handle multiple signals and prioritize correctly', async () => {
      const event = createMockEventBridgeEvent();
      
      // Create signals with different severities
      const criticalSignal = createMockSignal('revenue', 'revenue.churn', 'critical');
      const highSignal = createMockSignal('revenue', 'revenue.contraction', 'high');
      const mediumSignal = createMockSignal('relationship', 'relationship.engagement_gap', 'medium');
      const lowSignal = createMockSignal('behavioral', 'behavioral.power_user', 'low');
      
      dynamoMock.on(QueryCommand)
        .resolvesOnce({ Items: [marshall(criticalSignal), marshall(highSignal)] })
        .resolvesOnce({ Items: [marshall(mediumSignal)] })
        .resolvesOnce({ Items: [marshall(lowSignal)] });
      
      bedrockMock.on(InvokeModelCommand).resolves(
        createBedrockResponse('Generated narrative.')
      );
      
      dynamoMock.on(PutItemCommand).resolves({});
      
      await handler(event);
      
      // Verify all signals were processed
      const invokeCommands = bedrockMock.commandCalls(InvokeModelCommand);
      expect(invokeCommands).toHaveLength(4);
      
      // Verify briefing was stored
      const putCommands = dynamoMock.commandCalls(PutItemCommand);
      expect(putCommands).toHaveLength(1);
    });

    it('should complete within reasonable time', async () => {
      const event = createMockEventBridgeEvent();
      const signal = createMockSignal('revenue', 'revenue.expansion');
      
      dynamoMock.on(QueryCommand)
        .resolvesOnce({ Items: [marshall(signal)] })
        .resolvesOnce({ Items: [] })
        .resolvesOnce({ Items: [] });
      
      bedrockMock.on(InvokeModelCommand).resolves(
        createBedrockResponse('Quick narrative.')
      );
      
      dynamoMock.on(PutItemCommand).resolves({});
      
      const startTime = Date.now();
      await handler(event);
      const duration = Date.now() - startTime;
      
      // Should complete well under 30 seconds (requirement 1.4)
      expect(duration).toBeLessThan(5000); // 5 seconds for test
    });
  });

  describe('Empty signal list handling', () => {
    it('should generate empty briefing when no signals found', async () => {
      const event = createMockEventBridgeEvent();
      
      // Mock empty signal retrieval
      dynamoMock.on(QueryCommand).resolves({ Items: [] });
      
      // Mock briefing storage
      dynamoMock.on(PutItemCommand).resolves({});
      
      await handler(event);
      
      // Verify no narrative generation was attempted
      expect(bedrockMock.commandCalls(InvokeModelCommand)).toHaveLength(0);
      
      // Verify empty briefing was stored
      const putCommands = dynamoMock.commandCalls(PutItemCommand);
      expect(putCommands).toHaveLength(1);
      
      const storedItem = putCommands[0].args[0].input.Item;
      expect(storedItem).toBeDefined();
      if (storedItem) {
        expect(storedItem.PK?.S).toBe('briefing#default');
        expect(storedItem.signalCount?.N).toBe('0');
      }
    });

    it('should log appropriate message for empty signals', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const event = createMockEventBridgeEvent();
      
      dynamoMock.on(QueryCommand).resolves({ Items: [] });
      dynamoMock.on(PutItemCommand).resolves({});
      
      await handler(event);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Signals retrieved',
        expect.objectContaining({ count: 0 })
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        'No signals found, generating empty briefing'
      );
    });
  });

  describe('DynamoDB failure scenarios', () => {
    it('should throw error when signal retrieval fails', async () => {
      const event = createMockEventBridgeEvent();
      
      // Mock DynamoDB failure
      dynamoMock.on(QueryCommand).rejects(new Error('DynamoDB connection timeout'));
      
      await expect(handler(event)).rejects.toThrow();
    });

    it('should throw error when briefing storage fails', async () => {
      const event = createMockEventBridgeEvent();
      const signal = createMockSignal('revenue', 'revenue.expansion');
      
      // Mock successful signal retrieval
      dynamoMock.on(QueryCommand)
        .resolvesOnce({ Items: [marshall(signal)] })
        .resolvesOnce({ Items: [] })
        .resolvesOnce({ Items: [] });
      
      // Mock successful narrative generation
      bedrockMock.on(InvokeModelCommand).resolves(
        createBedrockResponse('Narrative text.')
      );
      
      // Mock storage failure
      dynamoMock.on(PutItemCommand).rejects(new Error('DynamoDB write failed'));
      
      await expect(handler(event)).rejects.toThrow('Failed to store briefing');
    });

    it('should log error details when DynamoDB fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error');
      const event = createMockEventBridgeEvent();
      
      dynamoMock.on(QueryCommand).rejects(new Error('Network error'));
      
      await expect(handler(event)).rejects.toThrow();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Briefing generation failed',
        expect.objectContaining({ error: expect.any(Error) })
      );
    });
  });

  describe('Bedrock failure scenarios', () => {
    it('should fall back to template narrative when Bedrock fails', async () => {
      const event = createMockEventBridgeEvent();
      const signal = createMockSignal('revenue', 'revenue.expansion');
      
      dynamoMock.on(QueryCommand)
        .resolvesOnce({ Items: [marshall(signal)] })
        .resolvesOnce({ Items: [] })
        .resolvesOnce({ Items: [] });
      
      // Mock Bedrock failure
      bedrockMock.on(InvokeModelCommand).rejects(new Error('Bedrock unavailable'));
      
      // Mock successful storage
      dynamoMock.on(PutItemCommand).resolves({});
      
      // Should not throw - should fall back to template
      await handler(event);
      
      // Verify briefing was still stored
      const putCommands = dynamoMock.commandCalls(PutItemCommand);
      expect(putCommands).toHaveLength(1);
    });

    it('should continue processing other signals when one narrative fails', async () => {
      const event = createMockEventBridgeEvent();
      const signal1 = createMockSignal('revenue', 'revenue.expansion');
      const signal2 = createMockSignal('revenue', 'revenue.churn');
      
      dynamoMock.on(QueryCommand)
        .resolvesOnce({ Items: [marshall(signal1), marshall(signal2)] })
        .resolvesOnce({ Items: [] })
        .resolvesOnce({ Items: [] });
      
      // First narrative succeeds, second fails
      bedrockMock.on(InvokeModelCommand)
        .resolvesOnce(createBedrockResponse('First narrative.'))
        .rejectsOnce(new Error('Bedrock error'));
      
      dynamoMock.on(PutItemCommand).resolves({});
      
      await handler(event);
      
      // Should still store briefing with at least one insight
      const putCommands = dynamoMock.commandCalls(PutItemCommand);
      expect(putCommands).toHaveLength(1);
    });

    it('should log error when narrative generation fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error');
      const event = createMockEventBridgeEvent();
      const signal = createMockSignal('revenue', 'revenue.expansion');
      
      dynamoMock.on(QueryCommand)
        .resolvesOnce({ Items: [marshall(signal)] })
        .resolvesOnce({ Items: [] })
        .resolvesOnce({ Items: [] });
      
      bedrockMock.on(InvokeModelCommand).rejects(new Error('Model timeout'));
      
      dynamoMock.on(PutItemCommand).resolves({});
      
      await handler(event);
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to generate insight for signal',
        expect.objectContaining({
          signalId: signal.signalId,
          error: expect.any(Error)
        })
      );
    });
  });

  describe('Retry logic', () => {
    it('should retry Bedrock call after failure', async () => {
      const event = createMockEventBridgeEvent();
      const signal = createMockSignal('revenue', 'revenue.expansion');
      
      dynamoMock.on(QueryCommand)
        .resolvesOnce({ Items: [marshall(signal)] })
        .resolvesOnce({ Items: [] })
        .resolvesOnce({ Items: [] });
      
      // First call fails, retry succeeds
      bedrockMock.on(InvokeModelCommand)
        .rejectsOnce(new Error('Temporary failure'))
        .resolvesOnce(createBedrockResponse('Success after retry.'));
      
      dynamoMock.on(PutItemCommand).resolves({});
      
      await handler(event);
      
      // Verify retry occurred
      expect(bedrockMock.commandCalls(InvokeModelCommand).length).toBeGreaterThan(1);
      
      // Verify briefing was stored
      const putCommands = dynamoMock.commandCalls(PutItemCommand);
      expect(putCommands).toHaveLength(1);
    });
  });

  describe('Logging and metrics', () => {
    it('should log execution metrics on success', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const event = createMockEventBridgeEvent();
      const signal = createMockSignal('revenue', 'revenue.expansion');
      
      dynamoMock.on(QueryCommand)
        .resolvesOnce({ Items: [marshall(signal)] })
        .resolvesOnce({ Items: [] })
        .resolvesOnce({ Items: [] });
      
      bedrockMock.on(InvokeModelCommand).resolves(
        createBedrockResponse('Narrative.')
      );
      
      dynamoMock.on(PutItemCommand).resolves({});
      
      await handler(event);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Briefing generation started',
        expect.objectContaining({
          eventId: event.id,
          time: event.time
        })
      );
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Briefing generation completed',
        expect.objectContaining({
          duration: expect.any(Number),
          signalCount: 1,
          insightCount: 1,
          durationSeconds: expect.any(String)
        })
      );
    });

    it('should log signal count and insight count', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const event = createMockEventBridgeEvent();
      
      const signal1 = createMockSignal('revenue', 'revenue.expansion');
      const signal2 = createMockSignal('revenue', 'revenue.churn');
      const signal3 = createMockSignal('relationship', 'relationship.engagement_gap');
      
      dynamoMock.on(QueryCommand)
        .resolvesOnce({ Items: [marshall(signal1), marshall(signal2)] })
        .resolvesOnce({ Items: [marshall(signal3)] })
        .resolvesOnce({ Items: [] });
      
      bedrockMock.on(InvokeModelCommand).resolves(
        createBedrockResponse('Narrative.')
      );
      
      dynamoMock.on(PutItemCommand).resolves({});
      
      await handler(event);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Signals retrieved',
        expect.objectContaining({ count: 3 })
      );
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Narratives generated',
        expect.objectContaining({ insightCount: 3 })
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle signals with missing metrics', async () => {
      const event = createMockEventBridgeEvent();
      const signal = createMockSignal('revenue', 'revenue.expansion');
      signal.impact.metrics = {}; // Empty metrics
      
      dynamoMock.on(QueryCommand)
        .resolvesOnce({ Items: [marshall(signal)] })
        .resolvesOnce({ Items: [] })
        .resolvesOnce({ Items: [] });
      
      bedrockMock.on(InvokeModelCommand).resolves(
        createBedrockResponse('Narrative without metrics.')
      );
      
      dynamoMock.on(PutItemCommand).resolves({});
      
      // Should not throw
      await handler(event);
      
      const putCommands = dynamoMock.commandCalls(PutItemCommand);
      expect(putCommands).toHaveLength(1);
    });

    it('should handle signals with all severity levels', async () => {
      const event = createMockEventBridgeEvent();
      
      const signal1 = createMockSignal('revenue', 'revenue.churn', 'critical');
      const signal2 = createMockSignal('revenue', 'revenue.contraction', 'high');
      const signal3 = createMockSignal('relationship', 'relationship.engagement_gap', 'medium');
      const signal4 = createMockSignal('behavioral', 'behavioral.power_user', 'low');
      
      dynamoMock.on(QueryCommand)
        .resolvesOnce({ Items: [marshall(signal1), marshall(signal2)] })
        .resolvesOnce({ Items: [marshall(signal3)] })
        .resolvesOnce({ Items: [marshall(signal4)] });
      
      bedrockMock.on(InvokeModelCommand).resolves(
        createBedrockResponse('Narrative.')
      );
      
      dynamoMock.on(PutItemCommand).resolves({});
      
      await handler(event);
      
      const putCommands = dynamoMock.commandCalls(PutItemCommand);
      expect(putCommands).toHaveLength(1);
      
      const storedItem = putCommands[0].args[0].input.Item;
      expect(storedItem).toBeDefined();
      if (storedItem) {
        expect(storedItem.priorityLevel?.S).toBe('high'); // Should be 'high' due to critical signal
      }
    });

    it('should handle very old signals (near 24-hour boundary)', async () => {
      const event = createMockEventBridgeEvent();
      const signal = createMockSignal('revenue', 'revenue.expansion');
      signal.occurredAt = Date.now() - (23.5 * 60 * 60 * 1000); // 23.5 hours ago
      
      dynamoMock.on(QueryCommand)
        .resolvesOnce({ Items: [marshall(signal)] })
        .resolvesOnce({ Items: [] })
        .resolvesOnce({ Items: [] });
      
      bedrockMock.on(InvokeModelCommand).resolves(
        createBedrockResponse('Old signal narrative.')
      );
      
      dynamoMock.on(PutItemCommand).resolves({});
      
      await handler(event);
      
      const putCommands = dynamoMock.commandCalls(PutItemCommand);
      expect(putCommands).toHaveLength(1);
    });
  });
});

/**
 * Helper: Create mock EventBridge event
 */
function createMockEventBridgeEvent(): EventBridgeEvent {
  return {
    version: '0',
    id: 'event-123',
    'detail-type': 'Scheduled Event',
    source: 'aws.events',
    account: '123456789012',
    time: new Date().toISOString(),
    region: 'us-east-1',
    resources: ['arn:aws:events:us-east-1:123456789012:rule/briefing-generator'],
    detail: {}
  };
}

/**
 * Helper: Create mock Universal_Signal
 */
function createMockSignal(
  category: 'revenue' | 'relationship' | 'behavioral',
  eventType: string,
  severity: 'critical' | 'high' | 'medium' | 'low' = 'high'
): Universal_Signal {
  const now = Date.now();
  
  return {
    signalId: `signal-${Math.random().toString(36).substr(2, 9)}`,
    category,
    eventType: eventType as any,
    entity: {
      primaryKey: `test-entity-${category}`,
      alternateKeys: ['alt_123'],
      platformIds: {
        stripe: category === 'revenue' ? 'cus_123' : undefined,
        hubspot: category === 'relationship' ? 'contact_123' : undefined,
        mixpanel: category === 'behavioral' ? 'user_123' : undefined
      }
    },
    occurredAt: now - (12 * 60 * 60 * 1000), // 12 hours ago
    processedAt: now,
    source: {
      platform: category === 'revenue' ? 'stripe' : category === 'relationship' ? 'hubspot' : 'mixpanel',
      originalEventType: 'test.event',
      originalEventId: 'evt_123'
    },
    impact: {
      severity,
      metrics: {
        revenue: category === 'revenue' ? {
          amount: 1000,
          currency: 'USD',
          mrr: 1000,
          mrrChange: 500
        } : undefined,
        relationship: category === 'relationship' ? {
          daysSinceContact: 45,
          sentimentScore: -0.3
        } : undefined,
        behavioral: category === 'behavioral' ? {
          engagementScore: 95,
          usageFrequency: 50
        } : undefined
      }
    },
    platformDetails: {},
    ttl: now + (90 * 24 * 60 * 60 * 1000)
  };
}

/**
 * Helper: Create Bedrock response
 */
function createBedrockResponse(text: string): any {
  const mockResponse = {
    content: [{ text }]
  };
  return {
    body: new TextEncoder().encode(JSON.stringify(mockResponse)),
    $metadata: {}
  };
}
