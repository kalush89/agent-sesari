/**
 * Lambda handler for Universal Signal Translation
 * 
 * Processes DynamoDB Stream events from connector tables and translates
 * platform-specific signals into Universal_Signal format
 */

import { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { AttributeValue } from '@aws-sdk/client-dynamodb';
import { StripeSignalTranslator } from './translators/stripe-translator';
import { HubSpotSignalTranslator } from './translators/hubspot-translator';
import { MixpanelSignalTranslator } from './translators/mixpanel-translator';
import { DynamoDBEntityResolver } from './entity-resolver';
import { DynamoDBSignalStore } from './signal-store';
import { Signal_Translator } from './interfaces';
import { Platform } from './types';

/**
 * Translation metrics for logging
 */
interface TranslationMetrics {
  total: number;
  successful: number;
  failed: number;
  platform: Platform;
}

/**
 * Lambda handler for DynamoDB Stream events
 */
export async function handler(event: DynamoDBStreamEvent): Promise<void> {
  const entityResolver = new DynamoDBEntityResolver();
  const signalStore = new DynamoDBSignalStore();
  
  const metrics: TranslationMetrics = {
    total: 0,
    successful: 0,
    failed: 0,
    platform: determinePlatform(event),
  };

  console.log(`Processing ${event.Records.length} records from ${metrics.platform}`);

  for (const record of event.Records) {
    metrics.total++;
    
    try {
      await processRecord(record, metrics.platform, entityResolver, signalStore);
      metrics.successful++;
    } catch (error) {
      metrics.failed++;
      console.error('Failed to process record:', {
        error: (error as Error).message,
        recordId: record.eventID,
        platform: metrics.platform,
      });
    }
  }

  console.log('Translation complete:', metrics);
}

/**
 * Process a single DynamoDB Stream record
 */
async function processRecord(
  record: DynamoDBRecord,
  platform: Platform,
  entityResolver: DynamoDBEntityResolver,
  signalStore: DynamoDBSignalStore
): Promise<void> {
  if (record.eventName !== 'INSERT' && record.eventName !== 'MODIFY') {
    return;
  }

  if (!record.dynamodb?.NewImage) {
    return;
  }

  const signal = unmarshall(
    record.dynamodb.NewImage as Record<string, AttributeValue>
  );

  const translator = getTranslator(platform);
  
  if (!translator.validate(signal)) {
    console.warn('Invalid signal, skipping:', {
      platform,
      eventId: signal.eventId,
    });
    return;
  }

  const correlationKeys = await translator.extractCorrelationKeys(signal);
  const platformId = getPlatformId(signal, platform);
  
  const entityMapping = await entityResolver.resolve(
    correlationKeys,
    platform,
    platformId
  );

  const universalSignal = await translator.translate(signal, entityMapping);
  
  if (!universalSignal) {
    throw new Error('Translation failed');
  }

  await signalStore.store(universalSignal);
  
  console.log('Signal translated successfully:', {
    signalId: universalSignal.signalId,
    platform,
    eventType: universalSignal.eventType,
    entity: universalSignal.entity.primaryKey,
  });
}

/**
 * Determine platform from event source ARN
 */
function determinePlatform(event: DynamoDBStreamEvent): Platform {
  if (event.Records.length === 0) {
    throw new Error('No records in event');
  }

  const sourceArn = event.Records[0].eventSourceARN || '';
  
  if (sourceArn.includes('stripe') || sourceArn.includes('revenue')) {
    return 'stripe';
  }
  
  if (sourceArn.includes('hubspot') || sourceArn.includes('relationship')) {
    return 'hubspot';
  }
  
  if (sourceArn.includes('mixpanel') || sourceArn.includes('behavioral')) {
    return 'mixpanel';
  }

  throw new Error(`Unable to determine platform from ARN: ${sourceArn}`);
}

/**
 * Get appropriate translator for platform
 */
function getTranslator(platform: Platform): Signal_Translator<any> {
  switch (platform) {
    case 'stripe':
      return new StripeSignalTranslator();
    case 'hubspot':
      return new HubSpotSignalTranslator();
    case 'mixpanel':
      return new MixpanelSignalTranslator();
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

/**
 * Extract platform-specific ID from signal
 */
function getPlatformId(signal: any, platform: Platform): string {
  switch (platform) {
    case 'stripe':
      return signal.customerId;
    case 'hubspot':
      return signal.companyId;
    case 'mixpanel':
      return signal.userId;
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}
