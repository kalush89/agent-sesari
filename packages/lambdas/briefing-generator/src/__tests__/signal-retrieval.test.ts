/**
 * Unit tests for signal retrieval
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { retrieveSignals } from '../signal-retrieval.js';
import type { Universal_Signal } from '../types.js';

const ddbMock = mockClient(DynamoDBClient);

describe('retrieveSignals', () => {
  beforeEach(() => {
    ddbMock.reset();
    
    // Set environment variables
    process.env.UNIVERSAL_SIGNALS_TABLE = 'UniversalSignals';
    process.env.AWS_REGION = 'us-east-1';
  });
  
  it('should retrieve signals from all three categories', async () => {
    // Mock responses for each category
    const revenueSignal = createMockSignal('revenue', 'revenue.expansion');
    const relationshipSignal = createMockSignal('relationship', 'relationship.engagement_gap');
    const behavioralSignal = createMockSignal('behavioral', 'behavioral.power_user');
    
    ddbMock.on(QueryCommand)
      .resolvesOnce({ Items: [marshall(revenueSignal)] })
      .resolvesOnce({ Items: [marshall(relationshipSignal)] })
      .resolvesOnce({ Items: [marshall(behavioralSignal)] });
    
    const signals = await retrieveSignals();
    
    expect(signals).toHaveLength(3);
    expect(signals[0].category).toBe('revenue');
    expect(signals[1].category).toBe('relationship');
    expect(signals[2].category).toBe('behavioral');
    
    // Verify three queries were made
    expect(ddbMock.commandCalls(QueryCommand).length).toBe(3);
  });
  
  it('should query with correct time range parameters', async () => {
    const startTime = Date.now() - (24 * 60 * 60 * 1000);
    const endTime = Date.now();
    
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    
    await retrieveSignals(startTime, endTime);
    
    // Check first query (revenue category)
    const calls = ddbMock.commandCalls(QueryCommand);
    const firstCall = calls[0].args[0].input;
    
    expect(firstCall.KeyConditionExpression).toBe('GSI2PK = :category AND GSI2SK BETWEEN :start AND :end');
    expect(firstCall.ExpressionAttributeValues[':category'].S).toBe('category#revenue');
    expect(firstCall.ExpressionAttributeValues[':start'].S).toBe(`${startTime}#`);
    expect(firstCall.ExpressionAttributeValues[':end'].S).toBe(`${endTime}#zzz`);
  });
  
  it('should use CategoryIndex GSI', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    
    await retrieveSignals();
    
    const calls = ddbMock.commandCalls(QueryCommand);
    const firstCall = calls[0].args[0].input;
    
    expect(firstCall.IndexName).toBe('CategoryIndex');
  });
  
  it('should handle empty results gracefully', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    
    const signals = await retrieveSignals();
    
    expect(signals).toEqual([]);
  });
  
  it('should handle missing Items in response', async () => {
    ddbMock.on(QueryCommand).resolves({});
    
    const signals = await retrieveSignals();
    
    expect(signals).toEqual([]);
  });
  
  it('should continue querying other categories if one fails', async () => {
    const revenueSignal = createMockSignal('revenue', 'revenue.expansion');
    const behavioralSignal = createMockSignal('behavioral', 'behavioral.power_user');
    
    ddbMock.on(QueryCommand)
      .resolvesOnce({ Items: [marshall(revenueSignal)] })
      .rejectsOnce(new Error('DynamoDB query failed'))
      .resolvesOnce({ Items: [marshall(behavioralSignal)] });
    
    const signals = await retrieveSignals();
    
    // Should have 2 signals (revenue and behavioral, relationship failed)
    expect(signals).toHaveLength(2);
    expect(signals[0].category).toBe('revenue');
    expect(signals[1].category).toBe('behavioral');
  });
  
  it('should use default time range when not provided', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    
    const beforeCall = Date.now();
    await retrieveSignals();
    const afterCall = Date.now();
    
    const calls = ddbMock.commandCalls(QueryCommand);
    const firstCall = calls[0].args[0].input;
    
    const startValue = parseInt(firstCall.ExpressionAttributeValues[':start'].S);
    const endValue = parseInt(firstCall.ExpressionAttributeValues[':end'].S.replace('#zzz', ''));
    
    // Start should be approximately 24 hours ago
    expect(startValue).toBeGreaterThan(beforeCall - (25 * 60 * 60 * 1000));
    expect(startValue).toBeLessThan(beforeCall - (23 * 60 * 60 * 1000));
    
    // End should be approximately now (allow for equal values due to timing)
    expect(endValue).toBeGreaterThanOrEqual(beforeCall);
    expect(endValue).toBeLessThan(afterCall + 1000);
  });
  
  it('should throw error when UNIVERSAL_SIGNALS_TABLE is not set', async () => {
    delete process.env.UNIVERSAL_SIGNALS_TABLE;
    
    await expect(retrieveSignals()).rejects.toThrow('UNIVERSAL_SIGNALS_TABLE environment variable is not set');
  });
  
  it('should unmarshall DynamoDB items correctly', async () => {
    const mockSignal = createMockSignal('revenue', 'revenue.expansion');
    ddbMock.on(QueryCommand).resolves({ Items: [marshall(mockSignal)] });
    
    const signals = await retrieveSignals();
    
    expect(signals[0]).toMatchObject({
      signalId: mockSignal.signalId,
      category: mockSignal.category,
      eventType: mockSignal.eventType,
      entity: mockSignal.entity,
      occurredAt: mockSignal.occurredAt,
      processedAt: mockSignal.processedAt,
      source: mockSignal.source,
      impact: mockSignal.impact,
      platformDetails: mockSignal.platformDetails,
      ttl: mockSignal.ttl
    });
  });
});

/**
 * Helper function to create mock Universal_Signal
 */
function createMockSignal(
  category: 'revenue' | 'relationship' | 'behavioral',
  eventType: string
): Universal_Signal {
  const now = Date.now();
  
  return {
    signalId: `signal-${Math.random().toString(36).substr(2, 9)}`,
    category,
    eventType: eventType as any,
    entity: {
      primaryKey: 'test@example.com',
      alternateKeys: ['cus_123'],
      platformIds: {
        stripe: 'cus_123'
      }
    },
    occurredAt: now - (12 * 60 * 60 * 1000), // 12 hours ago
    processedAt: now,
    source: {
      platform: 'stripe',
      originalEventType: 'customer.subscription.updated',
      originalEventId: 'evt_123'
    },
    impact: {
      severity: 'high',
      metrics: {
        revenue: {
          amount: 1000,
          currency: 'USD',
          mrr: 100,
          mrrChange: 50
        }
      }
    },
    platformDetails: {
      subscriptionId: 'sub_123'
    },
    ttl: now + (90 * 24 * 60 * 60 * 1000)
  };
}
