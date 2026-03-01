/**
 * Unit tests for input validation
 */

import { describe, it, expect } from 'vitest';
import { validateGoalInput, validateDecompositionResponse } from './validation';
import { ValidationError } from './types';

describe('validateGoalInput', () => {
  it('should accept valid non-empty goal strings', () => {
    expect(() => validateGoalInput('Increase MRR by 20%')).not.toThrow();
    expect(() => validateGoalInput('a')).not.toThrow();
  });

  it('should reject empty goal strings', () => {
    expect(() => validateGoalInput('')).toThrow(ValidationError);
    expect(() => validateGoalInput('')).toThrow('Goal is required');
  });

  it('should reject whitespace-only goal strings', () => {
    expect(() => validateGoalInput('   ')).toThrow(ValidationError);
    expect(() => validateGoalInput('\t\n  ')).toThrow(ValidationError);
    expect(() => validateGoalInput('   ')).toThrow('Goal is required');
  });

  it('should accept goals with special characters', () => {
    expect(() => validateGoalInput('Increase revenue by $10k!')).not.toThrow();
    expect(() => validateGoalInput('Goal with émojis 🚀')).not.toThrow();
  });

  it('should accept very long goal strings', () => {
    const longGoal = 'a'.repeat(2000);
    expect(() => validateGoalInput(longGoal)).not.toThrow();
  });
});


describe('validateDecompositionResponse', () => {
  const validObjective = {
    title: 'Increase MRR',
    description: 'Grow monthly recurring revenue',
    successThreshold: 'Reach $10k MRR',
    requiredSignals: ['stripe.mrr'],
    strategicWhy: 'Revenue growth is critical',
  };

  it('should accept valid response with exactly 3 objectives', () => {
    const validResponse = {
      objectives: [validObjective, validObjective, validObjective],
    };
    
    const result = validateDecompositionResponse(JSON.stringify(validResponse));
    expect(result.objectives).toHaveLength(3);
  });

  it('should reject invalid JSON', () => {
    expect(() => validateDecompositionResponse('not json')).toThrow('Invalid JSON response from Nova');
  });

  it('should reject response with fewer than 3 objectives', () => {
    const response = {
      objectives: [validObjective, validObjective],
    };
    
    expect(() => validateDecompositionResponse(JSON.stringify(response)))
      .toThrow('Response validation failed');
  });

  it('should reject response with more than 3 objectives', () => {
    const response = {
      objectives: [validObjective, validObjective, validObjective, validObjective],
    };
    
    expect(() => validateDecompositionResponse(JSON.stringify(response)))
      .toThrow('Response validation failed');
  });

  it('should reject objective with missing title', () => {
    const invalidObjective = { ...validObjective };
    delete (invalidObjective as any).title;
    const response = {
      objectives: [invalidObjective, validObjective, validObjective],
    };
    
    expect(() => validateDecompositionResponse(JSON.stringify(response)))
      .toThrow('Response validation failed');
  });

  it('should reject objective with empty requiredSignals array', () => {
    const invalidObjective = { ...validObjective, requiredSignals: [] };
    const response = {
      objectives: [invalidObjective, validObjective, validObjective],
    };
    
    expect(() => validateDecompositionResponse(JSON.stringify(response)))
      .toThrow('Response validation failed');
  });

  it('should reject objective with empty string fields', () => {
    const invalidObjective = { ...validObjective, title: '' };
    const response = {
      objectives: [invalidObjective, validObjective, validObjective],
    };
    
    expect(() => validateDecompositionResponse(JSON.stringify(response)))
      .toThrow('Response validation failed');
  });
});
