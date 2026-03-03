/**
 * Unit tests for memory-store error handling
 * Tests S3 upload retry logic, sync trigger failures, and timeout handling
 * Requirements: 1.1, 8.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create mock send functions that will be shared
const mockS3Send = vi.fn();
const mockBedrockSend = vi.fn();

// Mock AWS SDK clients before imports
vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: class {
      send = mockS3Send;
    },
    PutObjectCommand: class {
      constructor(public params: any) {}
    },
  };
});

vi.mock('@aws-sdk/client-bedrock-agent', () => {
  return {
    BedrockAgentClient: class {
      send = mockBedrockSend;
    },
    StartIngestionJobCommand: class {
      constructor(public params: any) {}
    },
  };
});

vi.mock('../config', () => ({
  loadMemoryConfig: () => ({
    s3BucketName: 'test-bucket',
    bedrockKnowledgeBaseId: 'test-kb-id',
    bedrockDataSourceId: 'test-ds-id',
    awsRegion: 'us-east-1',
    embeddingModel: 'amazon.nova-lite-v1:0',
  }),
}));

// Import after mocks are set up
import { createMemoryStore } from '../memory-store';
import type { StrategyDocument } from '../types';

describe('Memory Store - Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createTestDocument = (): StrategyDocument => ({
    id: 'test-strategy-1',
    type: 'strategy',
    category: 'icp',
    version: 1,
    timestamp: '2024-01-01T00:00:00Z',
    content: 'Test ICP content',
    metadata: {
      lastModified: '2024-01-01T00:00:00Z',
    },
  });

  describe('S3 Upload Retry Logic', () => {
    it('should succeed on first attempt when upload works', async () => {
      mockS3Send.mockResolvedValueOnce({});

      const store = createMemoryStore();
      const document = createTestDocument();

      const key = await store.storeDocument(document);

      expect(key).toBe('strategy/icp-v1.json');
      expect(mockS3Send).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient S3 errors and succeed on second attempt', async () => {
      const transientError = new Error('ServiceUnavailable');
      mockS3Send
        .mockRejectedValueOnce(transientError)
        .mockResolvedValueOnce({});

      const store = createMemoryStore();
      const document = createTestDocument();

      const promise = store.storeDocument(document);

      // Fast-forward through the exponential backoff delay (1 second)
      await vi.advanceTimersByTimeAsync(1000);

      const key = await promise;

      expect(key).toBe('strategy/icp-v1.json');
      expect(mockS3Send).toHaveBeenCalledTimes(2);
    });

    it('should retry with exponential backoff on multiple failures', async () => {
      const transientError = new Error('ThrottlingException');
      mockS3Send
        .mockRejectedValueOnce(transientError)
        .mockRejectedValueOnce(transientError)
        .mockResolvedValueOnce({});

      const store = createMemoryStore();
      const document = createTestDocument();

      const promise = store.storeDocument(document);

      // First retry: 1 second delay
      await vi.advanceTimersByTimeAsync(1000);
      
      // Second retry: 2 second delay (exponential backoff)
      await vi.advanceTimersByTimeAsync(2000);

      const key = await promise;

      expect(key).toBe('strategy/icp-v1.json');
      expect(mockS3Send).toHaveBeenCalledTimes(3);
    });

    it('should fail after 3 retry attempts with descriptive error', async () => {
      const persistentError = new Error('AccessDenied');
      mockS3Send.mockRejectedValue(persistentError);

      const store = createMemoryStore();
      const document = createTestDocument();

      const promise = store.storeDocument(document);

      // Fast-forward through all retry delays
      await vi.advanceTimersByTimeAsync(1000); // First retry
      await vi.advanceTimersByTimeAsync(2000); // Second retry

      await expect(promise).rejects.toThrow('Failed to store document after 3 attempts');
      expect(mockS3Send).toHaveBeenCalledTimes(3);
    });

    it('should include original error message in final error', async () => {
      const originalError = new Error('BucketNotFound: The specified bucket does not exist');
      mockS3Send.mockRejectedValue(originalError);

      const store = createMemoryStore();
      const document = createTestDocument();

      const promise = store.storeDocument(document);

      // Fast-forward through all retry delays
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);

      await expect(promise).rejects.toThrow(/BucketNotFound/);
      await expect(promise).rejects.toThrow(/specified bucket does not exist/);
    });

    it('should handle non-Error exceptions gracefully', async () => {
      mockS3Send.mockRejectedValue('String error message');

      const store = createMemoryStore();
      const document = createTestDocument();

      const promise = store.storeDocument(document);

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);

      await expect(promise).rejects.toThrow('Failed to store document after 3 attempts');
    });
  });

  describe('Sync Trigger Failures', () => {
    it('should successfully trigger KB sync when Bedrock API works', async () => {
      mockBedrockSend.mockResolvedValueOnce({
        ingestionJob: {
          ingestionJobId: 'job-123',
        },
      });

      const store = createMemoryStore();

      await expect(store.syncKnowledgeBase()).resolves.toBeUndefined();
      expect(mockBedrockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw descriptive error when KB sync fails', async () => {
      const syncError = new Error('ResourceNotFoundException: Knowledge base not found');
      mockBedrockSend.mockRejectedValue(syncError);

      const store = createMemoryStore();

      await expect(store.syncKnowledgeBase()).rejects.toThrow(/KB sync failed.*Knowledge base not found/);
    });

    it('should handle throttling errors from Bedrock', async () => {
      const throttlingError = new Error('ThrottlingException: Rate exceeded');
      mockBedrockSend.mockRejectedValue(throttlingError);

      const store = createMemoryStore();

      await expect(store.syncKnowledgeBase()).rejects.toThrow(/KB sync failed.*Rate exceeded/);
    });

    it('should handle access denied errors from Bedrock', async () => {
      const accessError = new Error('AccessDeniedException: User not authorized');
      mockBedrockSend.mockRejectedValue(accessError);

      const store = createMemoryStore();

      await expect(store.syncKnowledgeBase()).rejects.toThrow(/KB sync failed.*not authorized/);
    });

    it('should handle non-Error exceptions in sync trigger', async () => {
      mockBedrockSend.mockRejectedValue('Unknown sync error');

      const store = createMemoryStore();

      await expect(store.syncKnowledgeBase()).rejects.toThrow('KB sync failed: Unknown error');
    });
  });

  describe('Timeout Handling', () => {
    it('should handle S3 timeout errors during upload', async () => {
      const timeoutError = new Error('TimeoutError: Request timed out');
      timeoutError.name = 'TimeoutError';
      mockS3Send
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce({});

      const store = createMemoryStore();
      const document = createTestDocument();

      const promise = store.storeDocument(document);

      await vi.advanceTimersByTimeAsync(1000);

      const key = await promise;
      expect(key).toBe('strategy/icp-v1.json');
      expect(mockS3Send).toHaveBeenCalledTimes(2);
    });

    it('should fail after multiple timeout errors', async () => {
      const timeoutError = new Error('TimeoutError: Request timed out');
      timeoutError.name = 'TimeoutError';
      mockS3Send.mockRejectedValue(timeoutError);

      const store = createMemoryStore();
      const document = createTestDocument();

      const promise = store.storeDocument(document);

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);

      await expect(promise).rejects.toThrow('Failed to store document after 3 attempts');
      await expect(promise).rejects.toThrow(/timed out/);
    });

    it('should handle Bedrock sync timeout errors', async () => {
      const timeoutError = new Error('TimeoutError: Bedrock request timed out');
      timeoutError.name = 'TimeoutError';
      mockBedrockSend.mockRejectedValue(timeoutError);

      const store = createMemoryStore();

      await expect(store.syncKnowledgeBase()).rejects.toThrow(/KB sync failed.*timed out/);
    });
  });

  describe('Document Update Error Handling', () => {
    it('should retry on update failures', async () => {
      const transientError = new Error('ServiceUnavailable');
      mockS3Send
        .mockRejectedValueOnce(transientError)
        .mockResolvedValueOnce({});

      const store = createMemoryStore();
      const document = createTestDocument();

      const promise = store.updateDocument('test-strategy-1', document);

      await vi.advanceTimersByTimeAsync(1000);

      await expect(promise).resolves.toBeUndefined();
      expect(mockS3Send).toHaveBeenCalledTimes(2);
    });

    it('should fail update after max retries', async () => {
      const persistentError = new Error('InternalError');
      mockS3Send.mockRejectedValue(persistentError);

      const store = createMemoryStore();
      const document = createTestDocument();

      const promise = store.updateDocument('test-strategy-1', document);

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);

      await expect(promise).rejects.toThrow('Failed to store document after 3 attempts');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty error messages gracefully', async () => {
      const emptyError = new Error('');
      mockS3Send.mockRejectedValue(emptyError);

      const store = createMemoryStore();
      const document = createTestDocument();

      const promise = store.storeDocument(document);

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);

      await expect(promise).rejects.toThrow('Failed to store document after 3 attempts');
    });

    it('should handle undefined error objects', async () => {
      mockS3Send.mockRejectedValue(undefined);

      const store = createMemoryStore();
      const document = createTestDocument();

      const promise = store.storeDocument(document);

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);

      await expect(promise).rejects.toThrow('Failed to store document after 3 attempts');
    });

    it('should handle network errors during upload', async () => {
      const networkError = new Error('ECONNREFUSED: Connection refused');
      networkError.name = 'NetworkError';
      mockS3Send
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({});

      const store = createMemoryStore();
      const document = createTestDocument();

      const promise = store.storeDocument(document);

      await vi.advanceTimersByTimeAsync(1000);

      const key = await promise;
      expect(key).toBe('strategy/icp-v1.json');
      expect(mockS3Send).toHaveBeenCalledTimes(2);
    });
  });
});
