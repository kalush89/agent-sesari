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

describe('Lambda Handler Integration', () => {
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

  describe('Complete flow', () => {
    it('should generate and store briefing with signals', async () => {
      const event: EventBridgeEvent = {
        version: '0',
        id: 'event-123',
        'detail-type': 'Scheduled Event',
 