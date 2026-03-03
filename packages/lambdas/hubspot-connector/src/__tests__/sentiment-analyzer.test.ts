/**
 * Unit tests for sentiment analysis module
 * 
 * Tests specific examples and edge cases for sentiment detection
 * including positive, negative, mixed, and neutral text scenarios.
 */

import { describe, it, expect } from 'vitest';
import { analyzeSentiment } from '../sentiment-analyzer';

describe('Sentiment Analyzer', () => {
  describe('Positive Sentiment Detection', () => {
    it('should detect positive sentiment from "excited" keyword', () => {
      const text = "We're excited to expand our usage of the platform!";
      const result = analyzeSentiment(text);

      expect(result.category).toBe('positive');
      expect(result.score).toBeGreaterThan(0.3);
      expect(result.keywords).toContain('excited');
      expect(result.keywords).toContain('expand');
      expect(result.excerpt).toBe(text);
    });

    it('should detect positive sentiment from "love" keyword', () => {
      const text = "We absolutely love the new features you've added!";
      const result = analyzeSentiment(text);

      expect(result.category).toBe('positive');
      expect(result.score).toBeGreaterThan(0.3);
      expect(result.keywords).toContain('love');
    });

    it('should detect positive sentiment from "great" keyword', () => {
      const text = "The product is working great for our team.";
      const result = analyzeSentiment(text);

      expect(result.category).toBe('positive');
      expect(result.score).toBeGreaterThan(0.3);
      expect(result.keywords).toContain('great');
    });

    it('should detect multiple positive keywords', () => {
      const text = "This is excellent work! We're very happy and impressed with the results.";
      const result = analyzeSentiment(text);

      expect(result.category).toBe('positive');
      expect(result.score).toBeGreaterThan(0.3);
      expect(result.keywords).toContain('excellent');
      expect(result.keywords).toContain('happy');
      expect(result.keywords).toContain('impressed');
    });
  });

  describe('Negative Sentiment Detection', () => {
    it('should detect negative sentiment from "frustrated" keyword', () => {
      const text = "Customer is frustrated with the product performance.";
      const result = analyzeSentiment(text);

      expect(result.category).toBe('negative');
      expect(result.score).toBeLessThan(-0.3);
      expect(result.keywords).toContain('frustrated');
    });

    it('should detect negative sentiment from "disappointed" keyword', () => {
      const text = "We're disappointed with the recent changes to the pricing.";
      const result = analyzeSentiment(text);

      expect(result.category).toBe('negative');
      expect(result.score).toBeLessThan(-0.3);
      expect(result.keywords).toContain('disappointed');
    });

    it('should detect negative sentiment from "cancel" keyword', () => {
      const text = "They mentioned they might cancel their subscription next month.";
      const result = analyzeSentiment(text);

      expect(result.category).toBe('negative');
      expect(result.score).toBeLessThan(-0.3);
      expect(result.keywords).toContain('cancel');
    });

    it('should detect multiple negative keywords', () => {
      const text = "This is terrible. We're unhappy with the bugs and errors in the system.";
      const result = analyzeSentiment(text);

      expect(result.category).toBe('negative');
      expect(result.score).toBeLessThan(-0.3);
      expect(result.keywords).toContain('terrible');
      expect(result.keywords).toContain('unhappy');
      expect(result.keywords).toContain('bug');
      expect(result.keywords).toContain('error');
    });
  });

  describe('Mixed Sentiment', () => {
    it('should handle text with both positive and negative keywords', () => {
      const text = "We love the features but are frustrated with the bugs.";
      const result = analyzeSentiment(text);

      // Mixed sentiment should result in neutral or slightly positive/negative
      expect(result.score).toBeGreaterThanOrEqual(-1.0);
      expect(result.score).toBeLessThanOrEqual(1.0);
      expect(result.keywords).toContain('love');
      expect(result.keywords).toContain('frustrated');
      expect(result.keywords).toContain('bug');
    });

    it('should calculate correct score for balanced mixed sentiment', () => {
      const text = "Great product but disappointed with support.";
      const result = analyzeSentiment(text);

      // Should be neutral when positive and negative are balanced
      expect(result.category).toBe('neutral');
      expect(result.score).toBeGreaterThanOrEqual(-0.3);
      expect(result.score).toBeLessThanOrEqual(0.3);
    });
  });

  describe('Neutral Sentiment', () => {
    it('should detect neutral sentiment when no keywords present', () => {
      const text = "We had a meeting today to discuss the project timeline.";
      const result = analyzeSentiment(text);

      expect(result.category).toBe('neutral');
      expect(result.score).toBe(0);
      expect(result.keywords).toHaveLength(0);
    });

    it('should handle empty text', () => {
      const text = "";
      const result = analyzeSentiment(text);

      expect(result.category).toBe('neutral');
      expect(result.score).toBe(0);
      expect(result.keywords).toHaveLength(0);
      expect(result.excerpt).toBe('');
    });

    it('should handle whitespace-only text', () => {
      const text = "   \n\t  ";
      const result = analyzeSentiment(text);

      expect(result.category).toBe('neutral');
      expect(result.score).toBe(0);
      expect(result.keywords).toHaveLength(0);
    });
  });

  describe('Text Excerpt Extraction', () => {
    it('should extract first 200 characters for short text', () => {
      const text = "This is a short message.";
      const result = analyzeSentiment(text);

      expect(result.excerpt).toBe(text);
      expect(result.excerpt.length).toBeLessThanOrEqual(200);
    });

    it('should truncate text longer than 200 characters', () => {
      const text = "A".repeat(300);
      const result = analyzeSentiment(text);

      expect(result.excerpt.length).toBe(200);
      expect(result.excerpt).toBe("A".repeat(200));
    });

    it('should preserve original text in excerpt for exactly 200 characters', () => {
      const text = "B".repeat(200);
      const result = analyzeSentiment(text);

      expect(result.excerpt.length).toBe(200);
      expect(result.excerpt).toBe(text);
    });
  });

  describe('Case Insensitivity', () => {
    it('should detect keywords regardless of case', () => {
      const text = "We are EXCITED and LOVE the GREAT features!";
      const result = analyzeSentiment(text);

      expect(result.category).toBe('positive');
      expect(result.keywords).toContain('excited');
      expect(result.keywords).toContain('love');
      expect(result.keywords).toContain('great');
    });

    it('should detect negative keywords in mixed case', () => {
      const text = "Customer is FRUSTRATED and wants to CANCEL.";
      const result = analyzeSentiment(text);

      expect(result.category).toBe('negative');
      expect(result.keywords).toContain('frustrated');
      expect(result.keywords).toContain('cancel');
    });
  });

  describe('Score Calculation', () => {
    it('should return score of 1.0 for purely positive text', () => {
      const text = "Excellent and amazing!";
      const result = analyzeSentiment(text);

      expect(result.score).toBe(1.0);
      expect(result.category).toBe('positive');
    });

    it('should return score of -1.0 for purely negative text', () => {
      const text = "Terrible and awful!";
      const result = analyzeSentiment(text);

      expect(result.score).toBe(-1.0);
      expect(result.category).toBe('negative');
    });

    it('should return score of 0 for balanced sentiment', () => {
      const text = "Great but terrible.";
      const result = analyzeSentiment(text);

      expect(result.score).toBe(0);
      expect(result.category).toBe('neutral');
    });
  });

  describe('Sentiment Category Thresholds', () => {
    it('should categorize as positive when score > 0.3', () => {
      // 2 positive, 1 negative = score of 0.33
      const text = "Great and excellent but problem.";
      const result = analyzeSentiment(text);

      expect(result.score).toBeGreaterThan(0.3);
      expect(result.category).toBe('positive');
    });

    it('should categorize as negative when score < -0.3', () => {
      // 1 positive, 2 negative = score of -0.33
      const text = "Great but terrible and awful.";
      const result = analyzeSentiment(text);

      expect(result.score).toBeLessThan(-0.3);
      expect(result.category).toBe('negative');
    });

    it('should categorize as neutral when score between -0.3 and 0.3', () => {
      // Equal positive and negative
      const text = "Great but terrible.";
      const result = analyzeSentiment(text);

      expect(result.score).toBeGreaterThanOrEqual(-0.3);
      expect(result.score).toBeLessThanOrEqual(0.3);
      expect(result.category).toBe('neutral');
    });
  });
});
