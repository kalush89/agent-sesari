/**
 * Sentiment Analysis Module
 * 
 * Provides keyword-based sentiment analysis for customer communications.
 * Analyzes text content from notes, emails, and calls to detect positive,
 * neutral, or negative sentiment indicators.
 */

/**
 * Positive sentiment keywords indicating customer satisfaction,
 * excitement, or expansion opportunities
 */
const POSITIVE_KEYWORDS = [
  'excited',
  'love',
  'great',
  'excellent',
  'amazing',
  'fantastic',
  'wonderful',
  'happy',
  'pleased',
  'satisfied',
  'expand',
  'growth',
  'increase',
  'upgrade',
  'recommend',
  'impressed',
  'perfect',
  'awesome',
  'brilliant',
  'outstanding'
];

/**
 * Negative sentiment keywords indicating customer dissatisfaction,
 * frustration, or churn risk
 */
const NEGATIVE_KEYWORDS = [
  'frustrated',
  'disappointed',
  'cancel',
  'unhappy',
  'angry',
  'upset',
  'problem',
  'issue',
  'broken',
  'bug',
  'fail',
  'error',
  'terrible',
  'awful',
  'horrible',
  'worst',
  'hate',
  'regret',
  'refund',
  'churn'
];

/**
 * Result of sentiment analysis
 */
export interface SentimentAnalysis {
  /** Sentiment score from -1.0 (negative) to 1.0 (positive) */
  score: number;
  /** Categorized sentiment: positive, neutral, or negative */
  category: 'positive' | 'neutral' | 'negative';
  /** First 200 characters of the analyzed text */
  excerpt: string;
  /** Keywords detected in the text */
  keywords: string[];
}

/**
 * Analyzes text content for sentiment indicators using keyword-based scoring.
 * 
 * The function:
 * 1. Converts text to lowercase for case-insensitive matching
 * 2. Counts positive and negative keyword occurrences
 * 3. Calculates a normalized sentiment score (-1.0 to 1.0)
 * 4. Categorizes sentiment based on score thresholds
 * 5. Extracts the first 200 characters as an excerpt
 * 6. Returns detected keywords for transparency
 * 
 * @param text - The text content to analyze (from notes, emails, or calls)
 * @returns SentimentAnalysis object with score, category, excerpt, and keywords
 * 
 * @example
 * const result = analyzeSentiment("We're excited to expand our usage!");
 * // Returns: { score: 1.0, category: 'positive', excerpt: "We're excited...", keywords: ['excited', 'expand'] }
 */
export function analyzeSentiment(text: string): SentimentAnalysis {
  if (!text || text.trim().length === 0) {
    return {
      score: 0,
      category: 'neutral',
      excerpt: '',
      keywords: []
    };
  }

  const lowerText = text.toLowerCase();
  const detectedKeywords: string[] = [];
  let positiveCount = 0;
  let negativeCount = 0;

  // Count positive keyword occurrences
  for (const keyword of POSITIVE_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      positiveCount++;
      detectedKeywords.push(keyword);
    }
  }

  // Count negative keyword occurrences
  for (const keyword of NEGATIVE_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      negativeCount++;
      detectedKeywords.push(keyword);
    }
  }

  // Calculate sentiment score
  const totalKeywords = positiveCount + negativeCount;
  let score = 0;

  if (totalKeywords > 0) {
    // Normalize to -1.0 to 1.0 range
    score = (positiveCount - negativeCount) / totalKeywords;
  }

  // Categorize sentiment based on thresholds
  let category: 'positive' | 'neutral' | 'negative';
  if (score > 0.3) {
    category = 'positive';
  } else if (score < -0.3) {
    category = 'negative';
  } else {
    category = 'neutral';
  }

  // Extract first 200 characters as excerpt
  const excerpt = text.substring(0, 200);

  return {
    score,
    category,
    excerpt,
    keywords: detectedKeywords
  };
}
