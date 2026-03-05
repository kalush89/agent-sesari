/**
 * Unit tests for briefing storage
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { storeBriefing, retrieveBriefing, calculateTTL } from '../briefing-storage.js';
import type { Briefing } from '../types.js';

const dynamoMock = mockClient(DynamoDBClient);

describe('Briefing Storage', () => {
  beforeEach(() => {
    dynamoMock.reset();
    process.env.BRIEFING_STORE_TABLE = 'Briefings';
    process.env.AWS_REGION = 'us-east-1';
  });

  describe('storeBriefing', () => {
    it('should store briefing successfully', async () => {
      const briefing: Briefing = {
        date: '2024-01-15',
        generatedAt: 1705305600000,
        insights: [
          {
            id: 'insight_1',
            narrative: 'Test narrative',
            severity: 'high',
            category: 'revenue',
            thoughtTrace: {
              signals: [
                {
                  source: 'stripe',
                  eventType: 'revenue.expansion',
                  timestamp: 1705305600000,
                  severity: 'high'
                }
              ]
            },
            growthPlay: {
              label: 'View Customer',
              action: 'navigate',
              target: '/customers/cus_123'
            }
          }
        ],
        metadata: {
          signalCount: 5,
          priorityLevel: 'high',
          categories: {
            revenue: 3,
            relationship: 1,
            behavioral: 1
          }
        }
      };

      dynamoMock.on(PutItemCommand).resolves({});

      await storeBriefing('user_123', briefing);

      expect(dynamoMock.calls()).toHaveLength(1);
      const call = dynamoMock.call(0);
      expect(call.args[0].input.TableName).toBe('Briefings');
    });

    it('should throw error when table name not set', async () => {
      delete process.env.BRIEFING_STORE_TABLE;

      const briefing: Briefing = {
        date: '2024-01-15',
        generatedAt: Date.now(),
        insights: [],
        metadata: {
          signalCount: 0,
          priorityLevel: 'low',
          categories: { revenue: 0, relationship: 0, behavioral: 0 }
        }
      };

      await expect(storeBriefing('user_123', briefing)).rejects.toThrow(
        'BRIEFING_STORE_TABLE environment variable is not set'
      );
    });

    it('should handle DynamoDB write failure', async () => {
      const briefing: Briefing = {
        date: '2024-01-15',
        generatedAt: Date.now(),
        insights: [],
        metadata: {
          signalCount: 0,
          priorityLevel: 'low',
          categories: { revenue: 0, relationship: 0, behavioral: 0 }
        }
      };

      dynamoMock.on(PutItemCommand).rejects(new Error('DynamoDB error'));

      await expect(storeBriefing('user_123', briefing)).rejects.toThrow(
        'Failed to store briefing'
      );
    });

    it('should compress content before storage', async () => {
      const briefing: Briefing = {
        date: '2024-01-15',
        generatedAt: Date.now(),
        insights: [
          {
            id: 'insight_1',
            narrative: 'Long narrative text that should be compressed',
            severity: 'medium',
            category: 'relationship',
            thoughtTrace: { signals: [] },
            growthPlay: {
              label: 'Open HubSpot',
              action: 'external',
              target: 'https://app.hubspot.com'
            }
          }
        ],
        metadata: {
          signalCount: 1,
          priorityLevel: 'medium',
          categories: { revenue: 0, relationship: 1, behavioral: 0 }
        }
      };

      dynamoMock.on(PutItemCommand).resolves({});

      await storeBriefing('user_123', briefing);

      const call = dynamoMock.call(0);
      const item = call.args[0].input.Item;
      
      // Content should be a buffer (compressed)
      expect(item.content).toBeDefined();
      expect(Buffer.isBuffer(item.content.B)).toBe(true);
    });

    it('should set TTL to 90 days from generation', async () => {
      const generatedAt = 1705305600000; // 2024-01-15
      const briefing: Briefing = {
        date: '2024-01-15',
        generatedAt,
        insights: [],
        metadata: {
          signalCount: 0,
          priorityLevel: 'low',
          categories: { revenue: 0, relationship: 0, behavioral: 0 }
        }
      };

      dynamoMock.on(PutItemCommand).resolves({});

      await storeBriefing('user_123', briefing);

      const call = dynamoMock.call(0);
      const item = call.args[0].input.Item;
      
      const expectedTTL = calculateTTL(generatedAt);
      expect(item.ttl.N).toBe(String(expectedTTL));
    });
  });

  describe('retrieveBriefing', () => {
    it('should retrieve and decompress briefing', async () => {
      const insights = [
        {
          id: 'insight_1',
          narrative: 'Test narrative',
          severity: 'high' as const,
          category: 'revenue' as const,
          thoughtTrace: { signals: [] },
          growthPlay: {
            label: 'View Customer',
            action: 'navigate' as const,
            target: '/customers/cus_123'
          }
        }
      ];

      const compressed = Buffer.from(JSON.stringify(insights), 'utf-8');

      dynamoMock.on(GetItemCommand).resolves({
        Item: {
          PK: { S: 'briefing#user_123' },
          SK: { S: 'date#2024-01-15' },
          generatedAt: { N: '1705305600000' },
          signalCount: { N: '5' },
          insightCount: { N: '1' },
          priorityLevel: { S: 'high' },
          content: { B: compressed }
        }
      });

      const briefing = await retrieveBriefing('user_123', '2024-01-15');

      expect(briefing).not.toBeNull();
      expect(briefing?.date).toBe('2024-01-15');
      expect(briefing?.insights).toHaveLength(1);
      expect(briefing?.insights[0].narrative).toBe('Test narrative');
      expect(briefing?.metadata.signalCount).toBe(5);
      expect(briefing?.metadata.priorityLevel).toBe('high');
    });

    it('should return null when briefing not found', async () => {
      dynamoMock.on(GetItemCommand).resolves({});

      const briefing = await retrieveBriefing('user_123', '2024-01-15');

      expect(briefing).toBeNull();
    });

    it('should throw error when table name not set', async () => {
      delete process.env.BRIEFING_STORE_TABLE;

      await expect(retrieveBriefing('user_123', '2024-01-15')).rejects.toThrow(
        'BRIEFING_STORE_TABLE environment variable is not set'
      );
    });

    it('should handle DynamoDB read failure', async () => {
      dynamoMock.on(GetItemCommand).rejects(new Error('DynamoDB error'));

      await expect(retrieveBriefing('user_123', '2024-01-15')).rejects.toThrow(
        'Failed to retrieve briefing'
      );
    });
  });

  describe('calculateTTL', () => {
    it('should calculate TTL 90 days from generation', () => {
      const generatedAt = 1705305600000; // 2024-01-15 00:00:00 UTC
      const ttl = calculateTTL(generatedAt);
      
      // 90 days = 90 * 24 * 60 * 60 * 1000 ms
      const expectedTTL = Math.floor((generatedAt + 90 * 24 * 60 * 60 * 1000) / 1000);
      
      expect(ttl).toBe(expectedTTL);
    });

    it('should return TTL in seconds (DynamoDB format)', () => {
      const generatedAt = Date.now();
      const ttl = calculateTTL(generatedAt);
      
      // TTL should be in seconds, not milliseconds
      expect(ttl).toBeLessThan(Date.now()); // Should be smaller than current time in ms
      expect(ttl).toBeGreaterThan(Date.now() / 1000); // Should be larger than current time in seconds
    });

    it('should handle edge case timestamps', () => {
      // Test with timestamp at epoch
      const epochTTL = calculateTTL(0);
      expect(epochTTL).toBe(Math.floor(90 * 24 * 60 * 60));
      
      // Test with future timestamp
      const futureTimestamp = Date.now() + 1000000;
      const futureTTL = calculateTTL(futureTimestamp);
      expect(futureTTL).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });
  });
});
