/**
 * Unit tests for memory-retrieval error handling
 * Tests Bedrock KB query failures, timeout handling, and empty result handling
 * Requirements: 5.1, 5.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create mock send function that will be shared
const mockBedrockSend = vi.fn();

// Mock AWS SDK clients before imports
vi.mock('@aws-sdk/client-bedrock-agent-runtime', () => {
  return {
    BedrockAgentRuntimeClient: class {
      send = mockBedrockSend;
    },
    RetrieveCommand: class {
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

// Mock document serializer
vi.mock('../document-serializer', () => ({
  parseDocument: vi.fn((content: string) => {
    const doc = JSON.parse(content);
    return doc;
  }),
}));

// Import after mocks are set up
import { search } from '../memory-retrieval';

describe('Memory Retrieval - Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Bedrock KB Query Failures', () => {
    it('should return empty array on Bedrock API errors', async () => {
      const apiError = new Error('ResourceNotFoundException: Knowledge base not found');
      mockBedrockSend.mockRejectedValue(apiError);

      const results = await search('test query');

      expect(results).toEqual([]);
      expect(mockBedrockSend).toHaveBeenCalledTimes(1);
    });

    it('should handle throttling errors gracefully', async () => {
      const throttlingError = new Error('ThrottlingException: Rate exceeded');
      mockBedrockSend.mockRejectedValue(throttlingError);

      const results = await search('test query');

      expect(results).toEqual([]);
    });

    it('should handle access denied errors gracefully', async () => {
      const accessError = new Error('AccessDeniedException: User not authorized');
      mockBedrockSend.mockRejectedValue(accessError);

      const results = await search('test query');

      expect(results).toEqual([]);
    });

    it('should handle validation errors gracefully', async () => {
      const validationError = new Error('ValidationException: Invalid knowledge base ID');
      mockBedrockSend.mockRejectedValue(validationError);

      const results = await search('test query');

      expect(results).toEqual([]);
    });

    it('should handle service unavailable errors gracefully', async () => {
      const serviceError = new Error('ServiceUnavailableException: Service temporarily unavailable');
      mockBedrockSend.mockRejectedValue(serviceError);

      const results = await search('test query');

      expect(results).toEqual([]);
    });

    it('should handle internal server errors gracefully', async () => {
      const internalError = new Error('InternalServerException: Internal error occurred');
      mockBedrockSend.mockRejectedValue(internalError);

      const results = await search('test query');

      expect(results).toEqual([]);
    });

    it('should handle non-Error exceptions gracefully', async () => {
      mockBedrockSend.mockRejectedValue('String error message');

      const results = await search('test query');

      expect(results).toEqual([]);
    });

    it('should handle undefined error objects gracefully', async () => {
      mockBedrockSend.mockRejectedValue(undefined);

      const results = await search('test query');

      expect(results).toEqual([]);
    });

    it('should handle network errors gracefully', async () => {
      const networkError = new Error('ECONNREFUSED: Connection refused');
      networkError.name = 'NetworkError';
      mockBedrockSend.mockRejectedValue(networkError);

      const results = await search('test query');

      expect(results).toEqual([]);
    });
  });

  describe('Timeout Handling (2-second limit)', () => {
    it('should timeout after 2 seconds and return empty array', async () => {
      // Mock a slow response that never resolves
      mockBedrockSend.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 5000))
      );

      const searchPromise = search('test query');

      // Fast-forward past the 2-second timeout
      await vi.advanceTimersByTimeAsync(2000);

      const results = await searchPromise;

      expect(results).toEqual([]);
    });

    it('should succeed if response arrives before timeout', async () => {
      const mockResponse = {
        retrievalResults: [
          {
            score: 0.9,
            content: {
              text: JSON.stringify({
                id: 'doc-1',
                type: 'strategy',
                category: 'icp',
                version: 1,
                timestamp: '2024-01-01T00:00:00Z',
                content: 'Test content',
                metadata: { lastModified: '2024-01-01T00:00:00Z' },
              }),
            },
          },
        ],
      };

      // Mock a response that arrives in 1 second (before timeout)
      mockBedrockSend.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockResponse), 1000))
      );

      const searchPromise = search('test query');

      // Fast-forward 1 second (before timeout)
      await vi.advanceTimersByTimeAsync(1000);

      const results = await searchPromise;

      expect(results).toHaveLength(1);
      expect(results[0].document.id).toBe('doc-1');
    });

    it('should handle timeout with partial results gracefully', async () => {
      // Mock a slow response that times out
      mockBedrockSend.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 3000))
      );

      const searchPromise = search('test query', { topK: 10 });

      await vi.advanceTimersByTimeAsync(2000);

      const results = await searchPromise;

      expect(results).toEqual([]);
    });

    it('should respect 2-second timeout with custom topK', async () => {
      mockBedrockSend.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 5000))
      );

      const searchPromise = search('test query', { topK: 3 });

      await vi.advanceTimersByTimeAsync(2000);

      const results = await searchPromise;

      expect(results).toEqual([]);
    });

    it('should respect 2-second timeout with document type filter', async () => {
      mockBedrockSend.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 5000))
      );

      const searchPromise = search('test query', { documentType: 'strategy' });

      await vi.advanceTimersByTimeAsync(2000);

      const results = await searchPromise;

      expect(results).toEqual([]);
    });
  });

  describe('Empty Result Handling', () => {
    it('should return empty array when no results found', async () => {
      mockBedrockSend.mockResolvedValue({
        retrievalResults: [],
      });

      const results = await search('test query');

      expect(results).toEqual([]);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should return empty array when retrievalResults is undefined', async () => {
      mockBedrockSend.mockResolvedValue({});

      const results = await search('test query');

      expect(results).toEqual([]);
    });

    it('should return empty array when retrievalResults is null', async () => {
      mockBedrockSend.mockResolvedValue({
        retrievalResults: null,
      });

      const results = await search('test query');

      expect(results).toEqual([]);
    });

    it('should handle empty results with custom topK', async () => {
      mockBedrockSend.mockResolvedValue({
        retrievalResults: [],
      });

      const results = await search('test query', { topK: 10 });

      expect(results).toEqual([]);
    });

    it('should handle empty results with document type filter', async () => {
      mockBedrockSend.mockResolvedValue({
        retrievalResults: [],
      });

      const results = await search('test query', { documentType: 'performance' });

      expect(results).toEqual([]);
    });

    it('should handle empty results with minScore threshold', async () => {
      mockBedrockSend.mockResolvedValue({
        retrievalResults: [],
      });

      const results = await search('test query', { minScore: 0.8 });

      expect(results).toEqual([]);
    });

    it('should filter out results below minScore threshold', async () => {
      const mockResponse = {
        retrievalResults: [
          {
            score: 0.5,
            content: {
              text: JSON.stringify({
                id: 'doc-1',
                type: 'strategy',
                category: 'icp',
                version: 1,
                timestamp: '2024-01-01T00:00:00Z',
                content: 'Low score content',
                metadata: { lastModified: '2024-01-01T00:00:00Z' },
              }),
            },
          },
        ],
      };

      mockBedrockSend.mockResolvedValue(mockResponse);

      const results = await search('test query', { minScore: 0.8 });

      expect(results).toEqual([]);
    });

    it('should skip results with missing content', async () => {
      const mockResponse = {
        retrievalResults: [
          {
            score: 0.9,
            content: null,
          },
        ],
      };

      mockBedrockSend.mockResolvedValue(mockResponse);

      const results = await search('test query');

      expect(results).toEqual([]);
    });

    it('should skip results with missing content.text', async () => {
      const mockResponse = {
        retrievalResults: [
          {
            score: 0.9,
            content: {},
          },
        ],
      };

      mockBedrockSend.mockResolvedValue(mockResponse);

      const results = await search('test query');

      expect(results).toEqual([]);
    });
  });

  describe('Document Parsing Errors', () => {
    it('should skip documents that fail to parse', async () => {
      const mockResponse = {
        retrievalResults: [
          {
            score: 0.9,
            content: {
              text: 'invalid json content',
            },
          },
        ],
      };

      mockBedrockSend.mockResolvedValue(mockResponse);

      const results = await search('test query');

      expect(results).toEqual([]);
    });

    it('should return valid documents and skip invalid ones', async () => {
      const mockResponse = {
        retrievalResults: [
          {
            score: 0.9,
            content: {
              text: 'invalid json',
            },
          },
          {
            score: 0.8,
            content: {
              text: JSON.stringify({
                id: 'doc-2',
                type: 'action',
                version: 1,
                timestamp: '2024-01-01T00:00:00Z',
                growthPlay: {
                  description: 'Test play',
                  category: 'retention',
                },
                businessContext: {
                  relevantSignals: [],
                },
              }),
            },
          },
        ],
      };

      mockBedrockSend.mockResolvedValue(mockResponse);

      const results = await search('test query');

      expect(results).toHaveLength(1);
      expect(results[0].document.id).toBe('doc-2');
    });
  });

  describe('Edge Cases', () => {
    it('should handle results with undefined scores', async () => {
      const mockResponse = {
        retrievalResults: [
          {
            score: undefined,
            content: {
              text: JSON.stringify({
                id: 'doc-1',
                type: 'strategy',
                category: 'icp',
                version: 1,
                timestamp: '2024-01-01T00:00:00Z',
                content: 'Test content',
                metadata: { lastModified: '2024-01-01T00:00:00Z' },
              }),
            },
          },
        ],
      };

      mockBedrockSend.mockResolvedValue(mockResponse);

      const results = await search('test query');

      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(0);
    });

    it('should handle empty query string', async () => {
      mockBedrockSend.mockResolvedValue({
        retrievalResults: [],
      });

      const results = await search('');

      expect(results).toEqual([]);
    });

    it('should handle very long query strings', async () => {
      const longQuery = 'a'.repeat(10000);
      mockBedrockSend.mockResolvedValue({
        retrievalResults: [],
      });

      const results = await search(longQuery);

      expect(results).toEqual([]);
    });

    it('should handle special characters in query', async () => {
      mockBedrockSend.mockResolvedValue({
        retrievalResults: [],
      });

      const results = await search('test @#$% query with special chars');

      expect(results).toEqual([]);
    });

    it('should handle concurrent search requests', async () => {
      mockBedrockSend.mockResolvedValue({
        retrievalResults: [],
      });

      const results = await Promise.all([
        search('query 1'),
        search('query 2'),
        search('query 3'),
      ]);

      expect(results).toHaveLength(3);
      results.forEach((result) => expect(result).toEqual([]));
    });
  });
});
