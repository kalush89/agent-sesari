/**
 * Unit tests for Lambda handler
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handler } from '../index';
import { DynamoDBStreamEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('Lambda Handler', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.AWS_REGION = 'us-east-1';
    process.env.ENTITY_MAPPINGS_TABLE = 'TestEntityMappings';
    process.env.UNIVERSAL_SIGNALS_TABLE = 'TestUniversalSignals';
    process.env.SIGNAL_TTL_DAYS = '90';
  });

  const createStripeStreamEvent = (): DynamoDBStreamEvent => ({
    Records: [
      {
        eventID: '1',
        eventName: 'INSERT',
        eventVersion: '1.1',
        eventSource: 'aws:dynamodb',
        awsRegion: 'us-east-1',
        eventSourceARN: 'arn:aws:dynamodb:us-east-1:123456789:table/stripe-revenue-signals/stream',
        dynamodb: {
          Keys: { eventId: { S: 'evt_123' } },
          NewImage: {
            eventId: { S: 'evt_123' },
            eventType: { S: 'expansion' },
            customerId: { S: 'cus_123' },
            subscriptionId: { S: 'sub_123' },
            timestamp: { N: '1700000000000' },
            processedAt: { N: '1700000100000' },
            revenueImpact: {
              M: {
                oldMrr: { N: '100' },
                newMrr: { N: '200' },
                amount: { N: '100' },
                currency: { S: 'usd' },
              },
            },
            details: {
              M: {
                changeType: { S: 'plan_upgrade' },
                oldPlanId: { S: 'plan_old' },
                newPlanId: { S: 'plan_new' },
              },
            },
            stripeEventType: { S: 'customer.subscription.updated' },
          },
          SequenceNumber: '1',
          SizeBytes: 100,
          StreamViewType: 'NEW_AND_OLD_IMAGES',
        },
      },
    ],
  });

  const createHubSpotStreamEvent = (): DynamoDBStreamEvent => ({
    Records: [
      {
        eventID: '2',
        eventName: 'INSERT',
        eventVersion: '1.1',
        eventSource: 'aws:dynamodb',
        awsRegion: 'us-east-1',
        eventSourceARN: 'arn:aws:dynamodb:us-east-1:123456789:table/hubspot-relationship-signals/stream',
        dynamodb: {
          Keys: { eventId: { S: 'evt_456' } },
          NewImage: {
            eventId: { S: 'evt_456' },
            eventType: { S: 'deal_progression' },
            companyId: { S: 'comp_123' },
            contactId: { S: 'cont_123' },
            dealId: { S: 'deal_123' },
            timestamp: { N: '1700000000000' },
            processedAt: { N: '1700000100000' },
            details: {
              M: {
                oldStage: { S: 'qualification' },
                newStage: { S: 'proposal' },
                isRegression: { BOOL: false },
                dealValue: { N: '50000' },
                currency: { S: 'USD' },
                dealName: { S: 'Enterprise Deal' },
              },
            },
          },
          SequenceNumber: '2',
          SizeBytes: 100,
          StreamViewType: 'NEW_AND_OLD_IMAGES',
        },
      },
    ],
  });

  it('should process Stripe signal successfully', async () => {
    const event = createStripeStreamEvent();
    
    ddbMock.on(GetCommand).resolves({ Item: undefined });
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    ddbMock.on(PutCommand).resolves({});

    await handler(event);

    expect(ddbMock.commandCalls(PutCommand).length).toBeGreaterThan(0);
  });

  it('should process HubSpot signal successfully', async () => {
    const event = createHubSpotStreamEvent();
    
    ddbMock.on(GetCommand).resolves({ Item: undefined });
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    ddbMock.on(PutCommand).resolves({});

    await handler(event);

    expect(ddbMock.commandCalls(PutCommand).length).toBeGreaterThan(0);
  });

  it('should skip REMOVE events', async () => {
    const event = createStripeStreamEvent();
    event.Records[0].eventName = 'REMOVE';
    
    await handler(event);

    expect(ddbMock.commandCalls(PutCommand).length).toBe(0);
  });

  it('should skip records without NewImage', async () => {
    const event = createStripeStreamEvent();
    delete event.Records[0].dynamodb?.NewImage;
    
    await handler(event);

    expect(ddbMock.commandCalls(PutCommand).length).toBe(0);
  });

  it('should continue processing on individual failures', async () => {
    const event: DynamoDBStreamEvent = {
      Records: [
        createStripeStreamEvent().Records[0],
        {
          ...createStripeStreamEvent().Records[0],
          eventID: '2',
          dynamodb: {
            ...createStripeStreamEvent().Records[0].dynamodb!,
            NewImage: {
              eventId: { S: 'evt_invalid' },
              eventType: { S: 'expansion' },
              // Missing required fields
            },
          },
        },
      ],
    };
    
    ddbMock.on(GetCommand).resolves({ Item: undefined });
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    ddbMock.on(PutCommand).resolves({});

    await handler(event);

    // Should process the valid record despite the invalid one
    expect(ddbMock.commandCalls(PutCommand).length).toBeGreaterThan(0);
  });

  it('should use existing entity mapping when available', async () => {
    const event = createStripeStreamEvent();
    const existingMapping = {
      PK: 'entity#user@example.com',
      SK: 'mapping',
      primaryKey: 'user@example.com',
      alternateKeys: [],
      platformIds: { stripe: 'cus_123', hubspot: 'hs_123' },
      lastUpdated: Date.now(),
      confidence: 'high',
    };
    
    ddbMock.on(QueryCommand).resolves({ Items: [existingMapping] });
    ddbMock.on(PutCommand).resolves({});

    await handler(event);

    const signalPutCall = ddbMock.commandCalls(PutCommand).find(
      call => call.args[0].input.TableName === 'TestUniversalSignals'
    );
    
    expect(signalPutCall?.args[0].input.Item?.entity.primaryKey).toBe('user@example.com');
    expect(signalPutCall?.args[0].input.Item?.entity.platformIds.hubspot).toBe('hs_123');
  });

  it('should throw error for unknown platform', async () => {
    const event = createStripeStreamEvent();
    event.Records[0].eventSourceARN = 'arn:aws:dynamodb:us-east-1:123456789:table/unknown-table/stream';
    
    await expect(handler(event)).rejects.toThrow('Unable to determine platform');
  });

  it('should handle empty event', async () => {
    const event: DynamoDBStreamEvent = { Records: [] };
    
    await expect(handler(event)).rejects.toThrow('No records in event');
  });
});
