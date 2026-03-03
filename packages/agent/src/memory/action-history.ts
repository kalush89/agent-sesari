/**
 * Action History Module
 * 
 * Records Growth Play actions and their outcomes for learning and failure detection.
 * Enables the agent to track what strategies have been tried and their results.
 */

import type { ActionHistory } from './types';
import { createMemoryStore } from './memory-store';

/**
 * Input parameters for creating a new action history record
 */
export interface CreateActionHistoryInput {
  growthPlay: {
    description: string;
    category: string;
    targetSegment?: string;
  };
  businessContext: {
    weeklyRevenue?: number;
    activeUsers?: number;
    relevantSignals: string[];
  };
}

/**
 * Input parameters for updating an action outcome
 */
export interface UpdateOutcomeInput {
  status: 'success' | 'failure';
  notes?: string;
}

/**
 * Creates a new action history record for a Growth Play
 * @param input - Growth Play details and business context
 * @returns Created ActionHistory document
 */
export async function createActionHistory(
  input: CreateActionHistoryInput
): Promise<ActionHistory> {
  const timestamp = new Date().toISOString();
  const actionId = generateActionId(input.growthPlay.description, timestamp);

  const actionHistory: ActionHistory = {
    id: actionId,
    type: 'action',
    timestamp,
    version: 1,
    growthPlay: input.growthPlay,
    businessContext: input.businessContext,
  };

  const memoryStore = createMemoryStore();
  await memoryStore.storeDocument(actionHistory);

  console.log(`Action history created: ${actionId}`);
  return actionHistory;
}

/**
 * Updates an existing action history record with outcome information
 * @param actionId - ID of the action to update
 * @param outcome - Success or failure status with optional notes
 * @returns Updated ActionHistory document
 */
export async function updateActionOutcome(
  actionId: string,
  outcome: UpdateOutcomeInput
): Promise<ActionHistory> {
  const memoryStore = createMemoryStore();
  
  // Retrieve existing action history
  const existingDoc = await memoryStore.getDocument(actionId, 'action');
  
  if (!existingDoc) {
    throw new Error(`Action history not found: ${actionId}`);
  }

  const actionHistory = existingDoc as ActionHistory;

  // Update with outcome information
  const updatedAction: ActionHistory = {
    ...actionHistory,
    outcome: {
      status: outcome.status,
      determinedAt: new Date().toISOString(),
      notes: outcome.notes,
    },
  };

  await memoryStore.updateDocument(actionId, updatedAction);

  console.log(`Action outcome updated: ${actionId} - ${outcome.status}`);
  return updatedAction;
}

/**
 * Generates a unique action ID from the growth play description and timestamp
 * @param description - Growth Play description
 * @param timestamp - ISO 8601 timestamp
 * @returns Unique action ID
 */
function generateActionId(description: string, timestamp: string): string {
  const hash = simpleHash(description);
  const dateStr = timestamp.split('T')[0].replace(/-/g, '');
  return `action-${dateStr}-${hash}`;
}

/**
 * Simple hash function for generating action IDs
 * @param str - String to hash
 * @returns Hash string
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36).substring(0, 8);
}
