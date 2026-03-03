/**
 * Unit tests for failure-detector logic
 * Tests similarity threshold calculation, 90-day window filtering, and empty action history handling
 * Requirements: 7.1, 7.2, 7.4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SearchResult, ActionHistory } from '../types';

// Mock the memory-retrieval module
vi.mock('../memory-retrieval', () => ({
  search: vi.fn(),
}));

// Import after mocks are set up
import { checkForRepeatedFailure } from '../failure-detector';
import { search } from '../memory-retrieval';

const mockSearch = vi.mocked(search);

describe('Failure Detector - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Similarity Threshold Calculation', () => {
    it('should flag failures with similarity >= 0.85', async () => {
      const now = new Date();
      const recentFailure = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

      const mockResults: SearchResult[] = [
        {
          document: {
            id: 'action-1',
            type: 'action',
            version: 1,
            timestamp: recentFailure.toISOString(),
            growthPlay: {
              description: 'Send discount email to churned users',
              category: 'retention',
            },
            outcome: {
              status: 'failure',
              determinedAt: recentFailure.toISOString(),
              notes: 'Low engagement',
            },
            businessContext: {
              relevantSignals: ['churn_signal'],
            },
          } as ActionHistory,
          score: 0.85,
          excerpt: 'Send discount email',
        },
      ];

      mockSearch.mockResolvedValue(mockResults);

      const result = await checkForRepeatedFailure('Send discount email to churned customers');

      expect(result.hasRecentFailure).toBe(true);
      expect(result.similarActions).toHaveLength(1);
      expect(result.similarActions[0].similarity).toBe(0.85);
    });

    it('should flag failures with similarity > 0.85', async () => {
      const now = new Date();
      const recentFailure = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago

      const mockResults: SearchResult[] = [
        {
          document: {
            id: 'action-2',
            type: 'action',
            version: 1,
            timestamp: recentFailure.toISOString(),
            growthPlay: {
              description: 'Launch referral program',
              category: 'acquisition',
            },
            outcome: {
              status: 'failure',
              determinedAt: recentFailure.toISOString(),
            },
            businessContext: {
              relevantSignals: [],
            },
          } as ActionHistory,
          score: 0.92,
          excerpt: 'Launch referral',
        },
      ];

      mockSearch.mockResolvedValue(mockResults);

      const result = await checkForRepeatedFailure('Launch referral program for users');

      expect(result.hasRecentFailure).toBe(true);
      expect(result.similarActions[0].similarity).toBe(0.92);
    });

    it('should not flag actions below similarity threshold', async () => {
      // Since search is called with minScore: 0.85, results below threshold won't be returned
      mockSearch.mockResolvedValue([]);

      const result = await checkForRepeatedFailure('Some growth play');

      // Should not be flagged because search returns no results (filtered by minScore)
      expect(result.hasRecentFailure).toBe(false);
      expect(result.similarActions).toHaveLength(0);
    });

    it('should handle multiple results with varying similarity scores', async () => {
      const now = new Date();
      const recentDate = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);

      // Note: search is called with minScore: 0.85, so only results >= 0.85 are returned
      const mockResults: SearchResult[] = [
        {
          document: {
            id: 'action-4',
            type: 'action',
            version: 1,
            timestamp: recentDate.toISOString(),
            growthPlay: {
              description: 'Action A',
              category: 'retention',
            },
            outcome: {
              status: 'failure',
              determinedAt: recentDate.toISOString(),
            },
            businessContext: {
              relevantSignals: [],
            },
          } as ActionHistory,
          score: 0.95,
          excerpt: 'Action A',
        },
        {
          document: {
            id: 'action-5',
            type: 'action',
            version: 1,
            timestamp: recentDate.toISOString(),
            growthPlay: {
              description: 'Action B',
              category: 'retention',
            },
            outcome: {
              status: 'failure',
              determinedAt: recentDate.toISOString(),
            },
            businessContext: {
              relevantSignals: [],
            },
          } as ActionHistory,
          score: 0.87, // Above threshold
          excerpt: 'Action B',
        },
      ];

      mockSearch.mockResolvedValue(mockResults);

      const result = await checkForRepeatedFailure('Test action');

      expect(result.hasRecentFailure).toBe(true);
      expect(result.similarActions).toHaveLength(2);
      expect(result.similarActions[0].similarity).toBe(0.95);
      expect(result.similarActions[1].similarity).toBe(0.87);
    });

    it('should pass similarity threshold to search function', async () => {
      mockSearch.mockResolvedValue([]);

      await checkForRepeatedFailure('Test query');

      expect(mockSearch).toHaveBeenCalledWith('Test query', {
        topK: 10,
        documentType: 'action',
        minScore: 0.85,
      });
    });
  });

  describe('90-Day Window Filtering', () => {
    it('should flag failures within 90-day window', async () => {
      const now = new Date();
      const day89Ago = new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000);

      const mockResults: SearchResult[] = [
        {
          document: {
            id: 'action-6',
            type: 'action',
            version: 1,
            timestamp: day89Ago.toISOString(),
            growthPlay: {
              description: 'Test action',
              category: 'retention',
            },
            outcome: {
              status: 'failure',
              determinedAt: day89Ago.toISOString(),
            },
            businessContext: {
              relevantSignals: [],
            },
          } as ActionHistory,
          score: 0.90,
          excerpt: 'Test action',
        },
      ];

      mockSearch.mockResolvedValue(mockResults);

      const result = await checkForRepeatedFailure('Test action');

      expect(result.hasRecentFailure).toBe(true);
      expect(result.similarActions).toHaveLength(1);
      expect(result.similarActions[0].daysSinceFailure).toBe(89);
    });

    it('should flag failures exactly at 90-day boundary', async () => {
      const now = new Date();
      const day90Ago = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      const mockResults: SearchResult[] = [
        {
          document: {
            id: 'action-7',
            type: 'action',
            version: 1,
            timestamp: day90Ago.toISOString(),
            growthPlay: {
              description: 'Boundary test',
              category: 'retention',
            },
            outcome: {
              status: 'failure',
              determinedAt: day90Ago.toISOString(),
            },
            businessContext: {
              relevantSignals: [],
            },
          } as ActionHistory,
          score: 0.88,
          excerpt: 'Boundary test',
        },
      ];

      mockSearch.mockResolvedValue(mockResults);

      const result = await checkForRepeatedFailure('Boundary test');

      expect(result.hasRecentFailure).toBe(true);
      expect(result.similarActions[0].daysSinceFailure).toBe(90);
    });

    it('should not flag failures beyond 90-day window', async () => {
      const now = new Date();
      const day91Ago = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000);

      const mockResults: SearchResult[] = [
        {
          document: {
            id: 'action-8',
            type: 'action',
            version: 1,
            timestamp: day91Ago.toISOString(),
            growthPlay: {
              description: 'Old failure',
              category: 'retention',
            },
            outcome: {
              status: 'failure',
              determinedAt: day91Ago.toISOString(),
            },
            businessContext: {
              relevantSignals: [],
            },
          } as ActionHistory,
          score: 0.90,
          excerpt: 'Old failure',
        },
      ];

      mockSearch.mockResolvedValue(mockResults);

      const result = await checkForRepeatedFailure('Old failure');

      expect(result.hasRecentFailure).toBe(false);
      expect(result.similarActions).toHaveLength(0);
    });

    it('should filter mixed results within and beyond window', async () => {
      const now = new Date();
      const day30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const day100Ago = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000);

      const mockResults: SearchResult[] = [
        {
          document: {
            id: 'action-9',
            type: 'action',
            version: 1,
            timestamp: day30Ago.toISOString(),
            growthPlay: {
              description: 'Recent failure',
              category: 'retention',
            },
            outcome: {
              status: 'failure',
              determinedAt: day30Ago.toISOString(),
            },
            businessContext: {
              relevantSignals: [],
            },
          } as ActionHistory,
          score: 0.90,
          excerpt: 'Recent failure',
        },
        {
          document: {
            id: 'action-10',
            type: 'action',
            version: 1,
            timestamp: day100Ago.toISOString(),
            growthPlay: {
              description: 'Old failure',
              category: 'retention',
            },
            outcome: {
              status: 'failure',
              determinedAt: day100Ago.toISOString(),
            },
            businessContext: {
              relevantSignals: [],
            },
          } as ActionHistory,
          score: 0.92,
          excerpt: 'Old failure',
        },
      ];

      mockSearch.mockResolvedValue(mockResults);

      const result = await checkForRepeatedFailure('Test action');

      expect(result.hasRecentFailure).toBe(true);
      expect(result.similarActions).toHaveLength(1);
      expect(result.similarActions[0].action.id).toBe('action-9');
      expect(result.similarActions[0].daysSinceFailure).toBe(30);
    });

    it('should calculate daysSinceFailure correctly', async () => {
      const now = new Date();
      const day45Ago = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);

      const mockResults: SearchResult[] = [
        {
          document: {
            id: 'action-11',
            type: 'action',
            version: 1,
            timestamp: day45Ago.toISOString(),
            growthPlay: {
              description: 'Test',
              category: 'retention',
            },
            outcome: {
              status: 'failure',
              determinedAt: day45Ago.toISOString(),
            },
            businessContext: {
              relevantSignals: [],
            },
          } as ActionHistory,
          score: 0.87,
          excerpt: 'Test',
        },
      ];

      mockSearch.mockResolvedValue(mockResults);

      const result = await checkForRepeatedFailure('Test');

      expect(result.similarActions[0].daysSinceFailure).toBe(45);
    });

    it('should handle failures from today (0 days ago)', async () => {
      const now = new Date();

      const mockResults: SearchResult[] = [
        {
          document: {
            id: 'action-12',
            type: 'action',
            version: 1,
            timestamp: now.toISOString(),
            growthPlay: {
              description: 'Today failure',
              category: 'retention',
            },
            outcome: {
              status: 'failure',
              determinedAt: now.toISOString(),
            },
            businessContext: {
              relevantSignals: [],
            },
          } as ActionHistory,
          score: 0.95,
          excerpt: 'Today failure',
        },
      ];

      mockSearch.mockResolvedValue(mockResults);

      const result = await checkForRepeatedFailure('Today failure');

      expect(result.hasRecentFailure).toBe(true);
      expect(result.similarActions[0].daysSinceFailure).toBe(0);
    });
  });

  describe('Empty Action History Handling', () => {
    it('should return no failures when search returns empty array', async () => {
      mockSearch.mockResolvedValue([]);

      const result = await checkForRepeatedFailure('Test action');

      expect(result.hasRecentFailure).toBe(false);
      expect(result.similarActions).toHaveLength(0);
    });

    it('should handle search returning null gracefully', async () => {
      mockSearch.mockResolvedValue(null as any);

      const result = await checkForRepeatedFailure('Test action');

      expect(result.hasRecentFailure).toBe(false);
      expect(result.similarActions).toHaveLength(0);
    });

    it('should handle search returning undefined gracefully', async () => {
      mockSearch.mockResolvedValue(undefined as any);

      const result = await checkForRepeatedFailure('Test action');

      expect(result.hasRecentFailure).toBe(false);
      expect(result.similarActions).toHaveLength(0);
    });

    it('should filter out actions without outcomes', async () => {
      const now = new Date();
      const recentDate = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);

      const mockResults: SearchResult[] = [
        {
          document: {
            id: 'action-13',
            type: 'action',
            version: 1,
            timestamp: recentDate.toISOString(),
            growthPlay: {
              description: 'No outcome action',
              category: 'retention',
            },
            // No outcome field
            businessContext: {
              relevantSignals: [],
            },
          } as ActionHistory,
          score: 0.90,
          excerpt: 'No outcome',
        },
      ];

      mockSearch.mockResolvedValue(mockResults);

      const result = await checkForRepeatedFailure('Test action');

      expect(result.hasRecentFailure).toBe(false);
      expect(result.similarActions).toHaveLength(0);
    });

    it('should filter out successful actions', async () => {
      const now = new Date();
      const recentDate = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);

      const mockResults: SearchResult[] = [
        {
          document: {
            id: 'action-14',
            type: 'action',
            version: 1,
            timestamp: recentDate.toISOString(),
            growthPlay: {
              description: 'Successful action',
              category: 'retention',
            },
            outcome: {
              status: 'success',
              determinedAt: recentDate.toISOString(),
            },
            businessContext: {
              relevantSignals: [],
            },
          } as ActionHistory,
          score: 0.90,
          excerpt: 'Successful action',
        },
      ];

      mockSearch.mockResolvedValue(mockResults);

      const result = await checkForRepeatedFailure('Test action');

      expect(result.hasRecentFailure).toBe(false);
      expect(result.similarActions).toHaveLength(0);
    });

    it('should handle mixed success and failure results', async () => {
      const now = new Date();
      const recentDate = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);

      const mockResults: SearchResult[] = [
        {
          document: {
            id: 'action-15',
            type: 'action',
            version: 1,
            timestamp: recentDate.toISOString(),
            growthPlay: {
              description: 'Success',
              category: 'retention',
            },
            outcome: {
              status: 'success',
              determinedAt: recentDate.toISOString(),
            },
            businessContext: {
              relevantSignals: [],
            },
          } as ActionHistory,
          score: 0.92,
          excerpt: 'Success',
        },
        {
          document: {
            id: 'action-16',
            type: 'action',
            version: 1,
            timestamp: recentDate.toISOString(),
            growthPlay: {
              description: 'Failure',
              category: 'retention',
            },
            outcome: {
              status: 'failure',
              determinedAt: recentDate.toISOString(),
            },
            businessContext: {
              relevantSignals: [],
            },
          } as ActionHistory,
          score: 0.88,
          excerpt: 'Failure',
        },
      ];

      mockSearch.mockResolvedValue(mockResults);

      const result = await checkForRepeatedFailure('Test action');

      expect(result.hasRecentFailure).toBe(true);
      expect(result.similarActions).toHaveLength(1);
      expect(result.similarActions[0].action.id).toBe('action-16');
    });

    it('should handle empty query string', async () => {
      mockSearch.mockResolvedValue([]);

      const result = await checkForRepeatedFailure('');

      expect(result.hasRecentFailure).toBe(false);
      expect(result.similarActions).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should return safe default on search error', async () => {
      mockSearch.mockRejectedValue(new Error('Search failed'));

      const result = await checkForRepeatedFailure('Test action');

      expect(result.hasRecentFailure).toBe(false);
      expect(result.similarActions).toHaveLength(0);
    });

    it('should handle network errors gracefully', async () => {
      const networkError = new Error('ECONNREFUSED');
      mockSearch.mockRejectedValue(networkError);

      const result = await checkForRepeatedFailure('Test action');

      expect(result.hasRecentFailure).toBe(false);
      expect(result.similarActions).toHaveLength(0);
    });

    it('should handle timeout errors gracefully', async () => {
      mockSearch.mockRejectedValue(new Error('Request timeout'));

      const result = await checkForRepeatedFailure('Test action');

      expect(result.hasRecentFailure).toBe(false);
      expect(result.similarActions).toHaveLength(0);
    });

    it('should handle malformed action documents gracefully', async () => {
      const now = new Date();
      const recentDate = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);

      const mockResults: SearchResult[] = [
        {
          document: {
            id: 'action-17',
            type: 'action',
            version: 1,
            timestamp: recentDate.toISOString(),
            growthPlay: {
              description: 'Test',
              category: 'retention',
            },
            outcome: {
              status: 'failure',
              determinedAt: 'invalid-date', // Invalid date format
            },
            businessContext: {
              relevantSignals: [],
            },
          } as ActionHistory,
          score: 0.90,
          excerpt: 'Test',
        },
      ];

      mockSearch.mockResolvedValue(mockResults);

      // Should not throw, should handle gracefully
      const result = await checkForRepeatedFailure('Test action');

      // Invalid date will result in NaN for date calculations, which should be filtered out
      expect(result).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long growth play descriptions', async () => {
      const longDescription = 'a'.repeat(10000);
      mockSearch.mockResolvedValue([]);

      const result = await checkForRepeatedFailure(longDescription);

      expect(result.hasRecentFailure).toBe(false);
      expect(mockSearch).toHaveBeenCalledWith(longDescription, expect.any(Object));
    });

    it('should handle special characters in growth play description', async () => {
      mockSearch.mockResolvedValue([]);

      const result = await checkForRepeatedFailure('Test @#$% action with special chars');

      expect(result.hasRecentFailure).toBe(false);
    });

    it('should handle multiple failures for same action', async () => {
      const now = new Date();
      const day10Ago = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
      const day20Ago = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);

      const mockResults: SearchResult[] = [
        {
          document: {
            id: 'action-18',
            type: 'action',
            version: 1,
            timestamp: day10Ago.toISOString(),
            growthPlay: {
              description: 'Same action',
              category: 'retention',
            },
            outcome: {
              status: 'failure',
              determinedAt: day10Ago.toISOString(),
            },
            businessContext: {
              relevantSignals: [],
            },
          } as ActionHistory,
          score: 0.95,
          excerpt: 'Same action',
        },
        {
          document: {
            id: 'action-19',
            type: 'action',
            version: 1,
            timestamp: day20Ago.toISOString(),
            growthPlay: {
              description: 'Same action',
              category: 'retention',
            },
            outcome: {
              status: 'failure',
              determinedAt: day20Ago.toISOString(),
            },
            businessContext: {
              relevantSignals: [],
            },
          } as ActionHistory,
          score: 0.93,
          excerpt: 'Same action',
        },
      ];

      mockSearch.mockResolvedValue(mockResults);

      const result = await checkForRepeatedFailure('Same action');

      expect(result.hasRecentFailure).toBe(true);
      expect(result.similarActions).toHaveLength(2);
      expect(result.similarActions[0].daysSinceFailure).toBe(10);
      expect(result.similarActions[1].daysSinceFailure).toBe(20);
    });

    it('should preserve all failure metadata', async () => {
      const now = new Date();
      const recentDate = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);

      const mockResults: SearchResult[] = [
        {
          document: {
            id: 'action-20',
            type: 'action',
            version: 1,
            timestamp: recentDate.toISOString(),
            growthPlay: {
              description: 'Test action',
              category: 'retention',
              targetSegment: 'enterprise',
            },
            outcome: {
              status: 'failure',
              determinedAt: recentDate.toISOString(),
              notes: 'Low engagement rate',
            },
            businessContext: {
              weeklyRevenue: 50000,
              activeUsers: 1200,
              relevantSignals: ['churn_risk', 'low_engagement'],
            },
          } as ActionHistory,
          score: 0.91,
          excerpt: 'Test action',
        },
      ];

      mockSearch.mockResolvedValue(mockResults);

      const result = await checkForRepeatedFailure('Test action');

      expect(result.hasRecentFailure).toBe(true);
      expect(result.similarActions[0].action.growthPlay.targetSegment).toBe('enterprise');
      expect(result.similarActions[0].action.outcome?.notes).toBe('Low engagement rate');
      expect(result.similarActions[0].action.businessContext.weeklyRevenue).toBe(50000);
    });
  });
});
