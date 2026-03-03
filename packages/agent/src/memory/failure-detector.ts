/**
 * Failure detector module for identifying repeated failure patterns
 */

import { search } from './memory-retrieval';
import type { ActionHistory, FailureCheck, SearchResult } from './types';

const FAILURE_WINDOW_DAYS = 90;
const SIMILARITY_THRESHOLD = 0.85;

/**
 * Check if a proposed Growth Play has failed recently
 * @param growthPlayDescription - Description of proposed action
 * @returns Failure check result with similar failed actions
 */
export async function checkForRepeatedFailure(
  growthPlayDescription: string
): Promise<FailureCheck> {
  try {
    // Search for similar past Growth Plays using semantic search
    const searchResults = await search(growthPlayDescription, {
      topK: 10, // Get more results to filter for failures
      documentType: 'action',
      minScore: SIMILARITY_THRESHOLD,
    });

    // Handle empty or null search results
    if (!searchResults || searchResults.length === 0) {
      return {
        hasRecentFailure: false,
        similarActions: [],
      };
    }

    // Filter for failed actions within 90-day window
    const now = new Date();
    const windowStart = new Date(now.getTime() - FAILURE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const similarFailures = searchResults
      .filter((result) => {
        const action = result.document as ActionHistory;
        
        // Must have a failure outcome
        if (!action.outcome || action.outcome.status !== 'failure') {
          return false;
        }

        // Must be within 90-day window
        const failureDate = new Date(action.outcome.determinedAt);
        return failureDate >= windowStart;
      })
      .map((result) => {
        const action = result.document as ActionHistory;
        const failureDate = new Date(action.outcome!.determinedAt);
        const daysSinceFailure = Math.floor(
          (now.getTime() - failureDate.getTime()) / (24 * 60 * 60 * 1000)
        );

        return {
          action,
          similarity: result.score,
          daysSinceFailure,
        };
      });

    return {
      hasRecentFailure: similarFailures.length > 0,
      similarActions: similarFailures,
    };
  } catch (error) {
    console.error('Failure detection failed:', error);
    
    // Return safe default on error
    return {
      hasRecentFailure: false,
      similarActions: [],
    };
  }
}
