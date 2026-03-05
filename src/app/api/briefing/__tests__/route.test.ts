/**
 * Unit tests for briefing API route
 * 
 * Tests cover:
 * - Successful briefing fetch
 * - Invalid date format validation
 * - Missing briefing handling
 * - DynamoDB error handling
 * - Default to today's date when no date parameter provided
 * 
 * Requirements: 9.3, 11.6
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '../route';
import { NextRequest } from 'next/server';
import * as briefingFetch from '@/lib/briefing-fetch';
import type { Briefing } from '@/lib/briefing-fetch';

// Mock the briefing-fetch module
vi.mock('@/lib/briefing-fetch', () => ({
  fetchBriefing: vi.fn()
}));

describe('GET /api/briefing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Successful briefing fetch', () => {
    it('should return briefing when valid date is provided', async () => {
      // Arrange
      const mockBriefing: Briefing = {
        date: '2024-01-15',
        generatedAt: 1705305600000,
        insights: [
          {
            id: 'insight-1',
            narrative: 'Customer ABC Corp upgraded to Enterprise plan',
            severity: 'high',
            category: 'revenue',
            thoughtTrace: {
              signals: [
                {
                  source: 'Stripe',
                  eventType: 'subscription.upgraded',
                  timestamp: 1705305600000,
                  severity: 'high'
                }
              ]
            },
            growthPlay: {
              label: 'View Customer',
              action: 'navigate',
              target: '/customers/abc-corp'
            }
          }
        ],
        metadata: {
          signalCount: 5,
          priorityLevel: 'high',
          categories: {
            revenue: 2,
            relationship: 2,
            behavioral: 1
          }
        }
      };

      vi.mocked(briefingFetch.fetchBriefing).mockResolvedValue(mockBriefing);

      const request = new NextRequest('http://localhost:3000/api/briefing?date=2024-01-15');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data).toEqual(mockBriefing);
      expect(briefingFetch.fetchBriefing).toHaveBeenCalledWith('2024-01-15');
      expect(briefingFetch.fetchBriefing).toHaveBeenCalledTimes(1);
    });

    it('should default to today\'s date when no date parameter provided', async () => {
      // Arrange
      const today = new Date().toISOString().split('T')[0];
      const mockBriefing: Briefing = {
        date: today,
        generatedAt: Date.now(),
        insights: [],
        metadata: {
          signalCount: 0,
          priorityLevel: 'normal',
          categories: {
            revenue: 0,
            relationship: 0,
            behavioral: 0
          }
        }
      };

      vi.mocked(briefingFetch.fetchBriefing).mockResolvedValue(mockBriefing);

      const request = new NextRequest('http://localhost:3000/api/briefing');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data).toEqual(mockBriefing);
      expect(briefingFetch.fetchBriefing).toHaveBeenCalledWith(today);
    });
  });

  describe('Invalid date format validation', () => {
    it('should return 400 for invalid date format (missing dashes)', async () => {
      // Arrange
      const request = new NextRequest('http://localhost:3000/api/briefing?date=20240115');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Invalid date format. Use YYYY-MM-DD' });
      expect(briefingFetch.fetchBriefing).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid date format (wrong separator)', async () => {
      // Arrange
      const request = new NextRequest('http://localhost:3000/api/briefing?date=2024/01/15');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Invalid date format. Use YYYY-MM-DD' });
      expect(briefingFetch.fetchBriefing).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid date format (incomplete date)', async () => {
      // Arrange
      const request = new NextRequest('http://localhost:3000/api/briefing?date=2024-01');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Invalid date format. Use YYYY-MM-DD' });
      expect(briefingFetch.fetchBriefing).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid date format (text)', async () => {
      // Arrange
      const request = new NextRequest('http://localhost:3000/api/briefing?date=invalid-date');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Invalid date format. Use YYYY-MM-DD' });
      expect(briefingFetch.fetchBriefing).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid date format (extra characters)', async () => {
      // Arrange
      const request = new NextRequest('http://localhost:3000/api/briefing?date=2024-01-15T00:00:00');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Invalid date format. Use YYYY-MM-DD' });
      expect(briefingFetch.fetchBriefing).not.toHaveBeenCalled();
    });
  });

  describe('Missing briefing handling', () => {
    it('should return 404 when briefing does not exist for date', async () => {
      // Arrange
      vi.mocked(briefingFetch.fetchBriefing).mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/briefing?date=2024-01-15');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'No briefing available for this date' });
      expect(briefingFetch.fetchBriefing).toHaveBeenCalledWith('2024-01-15');
    });

    it('should return 404 for future dates with no briefing', async () => {
      // Arrange
      vi.mocked(briefingFetch.fetchBriefing).mockResolvedValue(null);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const futureDateStr = futureDate.toISOString().split('T')[0];

      const request = new NextRequest(`http://localhost:3000/api/briefing?date=${futureDateStr}`);

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'No briefing available for this date' });
    });
  });

  describe('DynamoDB error handling', () => {
    it('should return 500 when DynamoDB query fails', async () => {
      // Arrange
      const dbError = new Error('DynamoDB connection timeout');
      vi.mocked(briefingFetch.fetchBriefing).mockRejectedValue(dbError);

      const request = new NextRequest('http://localhost:3000/api/briefing?date=2024-01-15');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to fetch briefing' });
      expect(briefingFetch.fetchBriefing).toHaveBeenCalledWith('2024-01-15');
    });

    it('should return 500 when environment variable is missing', async () => {
      // Arrange
      const configError = new Error('BRIEFING_STORE_TABLE environment variable is not set');
      vi.mocked(briefingFetch.fetchBriefing).mockRejectedValue(configError);

      const request = new NextRequest('http://localhost:3000/api/briefing?date=2024-01-15');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to fetch briefing' });
    });

    it('should return 500 when decompression fails', async () => {
      // Arrange
      const decompressionError = new Error('Unable to decompress or read briefing content');
      vi.mocked(briefingFetch.fetchBriefing).mockRejectedValue(decompressionError);

      const request = new NextRequest('http://localhost:3000/api/briefing?date=2024-01-15');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to fetch briefing' });
    });

    it('should return 500 when JSON parsing fails', async () => {
      // Arrange
      const parseError = new Error('Unexpected token in JSON');
      vi.mocked(briefingFetch.fetchBriefing).mockRejectedValue(parseError);

      const request = new NextRequest('http://localhost:3000/api/briefing?date=2024-01-15');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to fetch briefing' });
    });
  });

  describe('Edge cases', () => {
    it('should handle briefing with empty insights array', async () => {
      // Arrange
      const mockBriefing: Briefing = {
        date: '2024-01-15',
        generatedAt: 1705305600000,
        insights: [],
        metadata: {
          signalCount: 0,
          priorityLevel: 'normal',
          categories: {
            revenue: 0,
            relationship: 0,
            behavioral: 0
          }
        }
      };

      vi.mocked(briefingFetch.fetchBriefing).mockResolvedValue(mockBriefing);

      const request = new NextRequest('http://localhost:3000/api/briefing?date=2024-01-15');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data).toEqual(mockBriefing);
      expect(data.insights).toHaveLength(0);
    });

    it('should handle briefing with maximum insights', async () => {
      // Arrange
      const insights = Array.from({ length: 10 }, (_, i) => ({
        id: `insight-${i + 1}`,
        narrative: `Insight ${i + 1}`,
        severity: 'medium',
        category: 'revenue',
        thoughtTrace: {
          signals: [
            {
              source: 'Stripe',
              eventType: 'test.event',
              timestamp: Date.now(),
              severity: 'medium'
            }
          ]
        },
        growthPlay: {
          label: 'View Details',
          action: 'navigate',
          target: '/details'
        }
      }));

      const mockBriefing: Briefing = {
        date: '2024-01-15',
        generatedAt: 1705305600000,
        insights,
        metadata: {
          signalCount: 10,
          priorityLevel: 'normal',
          categories: {
            revenue: 10,
            relationship: 0,
            behavioral: 0
          }
        }
      };

      vi.mocked(briefingFetch.fetchBriefing).mockResolvedValue(mockBriefing);

      const request = new NextRequest('http://localhost:3000/api/briefing?date=2024-01-15');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.insights).toHaveLength(10);
    });

    it('should handle valid date at year boundary', async () => {
      // Arrange
      const mockBriefing: Briefing = {
        date: '2023-12-31',
        generatedAt: 1704067200000,
        insights: [],
        metadata: {
          signalCount: 0,
          priorityLevel: 'normal',
          categories: {
            revenue: 0,
            relationship: 0,
            behavioral: 0
          }
        }
      };

      vi.mocked(briefingFetch.fetchBriefing).mockResolvedValue(mockBriefing);

      const request = new NextRequest('http://localhost:3000/api/briefing?date=2023-12-31');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data).toEqual(mockBriefing);
    });
  });
});
