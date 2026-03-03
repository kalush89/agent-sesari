/**
 * Memory Store Module
 * 
 * Handles storage of memory documents to S3 and triggers Bedrock KB synchronization.
 * Implements retry logic with exponential backoff for resilient operations.
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { BedrockAgentClient, StartIngestionJobCommand } from '@aws-sdk/client-bedrock-agent';
import type { MemoryDocument, MemoryStore, StrategyDocument, PerformanceSummary, ActionHistory, TechnicalMap } from './types';
import { serializeDocument, parseDocument } from './document-serializer';
import { generateStrategyKey, generatePerformanceKey, generateActionKey, generateTechnicalKey } from './s3-keys';
import { loadMemoryConfig } from './config';

/**
 * Creates a memory store instance with AWS SDK clients
 * @returns MemoryStore implementation
 */
export function createMemoryStore(): MemoryStore {
  const config = loadMemoryConfig();
  const s3Client = new S3Client({ region: config.awsRegion });
  const bedrockClient = new BedrockAgentClient({ region: config.awsRegion });

  return {
    storeDocument: async (document: MemoryDocument): Promise<string> => {
      return storeDocumentWithRetry(s3Client, config.s3BucketName, document);
    },

    getDocument: async (documentId: string, documentType: MemoryDocument['type']): Promise<MemoryDocument | null> => {
      return retrieveFromS3(s3Client, config.s3BucketName, documentId, documentType);
    },

    updateDocument: async (documentId: string, document: MemoryDocument): Promise<void> => {
      await storeDocumentWithRetry(s3Client, config.s3BucketName, document);
    },

    syncKnowledgeBase: async (): Promise<void> => {
      await triggerKBSync(bedrockClient, config.bedrockKnowledgeBaseId, config.bedrockDataSourceId);
    },
  };
}

/**
 * Stores a document to S3 with retry logic
 * @param s3Client - S3 client instance
 * @param bucketName - S3 bucket name
 * @param document - Memory document to store
 * @returns S3 object key
 */
async function storeDocumentWithRetry(
  s3Client: S3Client,
  bucketName: string,
  document: MemoryDocument
): Promise<string> {
  const maxAttempts = 3;
  const baseDelay = 1000; // 1 second
  
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await uploadToS3(s3Client, bucketName, document);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`S3 upload attempt ${attempt}/${maxAttempts} failed:`, lastError.message);

      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
    }
  }

  throw new Error(`Failed to store document after ${maxAttempts} attempts: ${lastError?.message}`);
}

/**
 * Uploads a document to S3
 * @param s3Client - S3 client instance
 * @param bucketName - S3 bucket name
 * @param document - Memory document to upload
 * @returns S3 object key
 */
async function uploadToS3(
  s3Client: S3Client,
  bucketName: string,
  document: MemoryDocument
): Promise<string> {
  const key = generateS3Key(document);
  const body = serializeDocument(document);

  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: body,
        ContentType: 'application/json',
      })
    );

    console.log(`Document stored successfully: ${key}`);
    return key;
  } catch (error) {
    console.error(`S3 upload failed for key ${key}:`, error);
    throw new Error(`S3 upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generates the appropriate S3 key for a document based on its type
 * @param document - Memory document
 * @returns S3 object key
 */
function generateS3Key(document: MemoryDocument): string {
  switch (document.type) {
    case 'strategy': {
      const strategyDoc = document as StrategyDocument;
      return generateStrategyKey(strategyDoc.category, strategyDoc.version);
    }
    case 'performance': {
      const perfDoc = document as PerformanceSummary;
      return generatePerformanceKey(perfDoc.weekStart);
    }
    case 'action': {
      const actionDoc = document as ActionHistory;
      return generateActionKey(actionDoc.id, actionDoc.timestamp);
    }
    case 'technical': {
      const techDoc = document as TechnicalMap;
      return generateTechnicalKey(techDoc.serviceName, techDoc.category, techDoc.version);
    }
    default:
      throw new Error(`Unknown document type: ${(document as MemoryDocument).type}`);
  }
}

/**
 * Triggers Bedrock Knowledge Base synchronization
 * @param bedrockClient - Bedrock Agent client instance
 * @param knowledgeBaseId - Bedrock KB ID
 * @param dataSourceId - Bedrock data source ID
 */
async function triggerKBSync(
  bedrockClient: BedrockAgentClient,
  knowledgeBaseId: string,
  dataSourceId: string
): Promise<void> {
  try {
    const response = await bedrockClient.send(
      new StartIngestionJobCommand({
        knowledgeBaseId,
        dataSourceId,
      })
    );

    console.log(`KB sync triggered successfully. Ingestion job ID: ${response.ingestionJob?.ingestionJobId}`);
  } catch (error) {
    console.error('Failed to trigger KB sync:', error);
    throw new Error(`KB sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Sleep utility for retry delays
 * @param ms - Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retrieves a document from S3
 * @param s3Client - S3 client instance
 * @param bucketName - S3 bucket name
 * @param documentId - Document ID to retrieve
 * @param documentType - Type of document
 * @returns Memory document or null if not found
 */
async function retrieveFromS3(
  s3Client: S3Client,
  bucketName: string,
  documentId: string,
  documentType: MemoryDocument['type']
): Promise<MemoryDocument | null> {
  try {
    // For action documents, we need to search by prefix since keys include timestamps
    // This is a simplified implementation - production would use an index or metadata
    const key = `${documentType}s/${documentId}.json`;
    
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    );

    if (!response.Body) {
      return null;
    }

    const bodyString = await response.Body.transformToString();
    return parseDocument(bodyString);
  } catch (error) {
    if ((error as any).name === 'NoSuchKey') {
      console.log(`Document not found: ${documentId}`);
      return null;
    }
    
    console.error(`S3 retrieval failed for document ${documentId}:`, error);
    throw new Error(`S3 retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generates S3 key for action documents (simplified for retrieval)
 * @param actionId - Action ID
 * @returns S3 key
 */
function generateActionKeyForRetrieval(actionId: string): string {
  return `actions/${actionId}.json`;
}
