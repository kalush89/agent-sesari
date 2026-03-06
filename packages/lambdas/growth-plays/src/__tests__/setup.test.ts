/**
 * Setup verification tests
 * 
 * Ensures the testing framework and basic imports are working correctly.
 */

import { describe, it, expect } from 'vitest';
import type { GrowthPlay, RiskProfile, UnifiedCustomerProfile } from '../types.js';
import { validateEnvironment, validateNonEmptyString, validateNumberInRange } from '../utils/validation.js';
import { logStructured, sleep } from '../utils/error-handling.js';

describe('Package Setup', () => {
  it('should import types correctly', () => {
    // Type assertions to verify types are defined
    const growthPlay: Partial<GrowthPlay> = {
      id: 'test-id',
      customerId: 'customer-1',
      riskScore: 85
    };
    
    expect(growthPlay.id).toBe('test-id');
    expect(growthPlay.riskScore).toBe(85);
  });

  it('should import validation utilities correctly', () => {
    expect(typeof validateEnvironment).toBe('function');
    expect(typeof validateNonEmptyString).toBe('function');
    expect(typeof validateNumberInRange).toBe('function');
  });

  it('should import error handling utilities correctly', () => {
    expect(typeof logStructured).toBe('function');
    expect(typeof sleep).toBe('function');
  });
});

describe('Validation Utilities', () => {
  describe('validateNonEmptyString', () => {
    it('should return null for valid non-empty strings', () => {
      const result = validateNonEmptyString('test', 'testField');
      expect(result).toBeNull();
    });

    it('should return error for non-string values', () => {
      const result = validateNonEmptyString(123, 'testField');
      expect(result).not.toBeNull();
      expect(result?.field).toBe('testField');
      expect(result?.message).toBe('Must be a string');
    });

    it('should return error for empty strings', () => {
      const result = validateNonEmptyString('', 'testField');
      expect(result).not.toBeNull();
      expect(result?.field).toBe('testField');
      expect(result?.message).toBe('Must not be empty');
    });

    it('should return error for whitespace-only strings', () => {
      const result = validateNonEmptyString('   ', 'testField');
      expect(result).not.toBeNull();
      expect(result?.message).toBe('Must not be empty');
    });
  });

  describe('validateNumberInRange', () => {
    it('should return null for valid numbers in range', () => {
      const result = validateNumberInRange(50, 'score', 0, 100);
      expect(result).toBeNull();
    });

    it('should return null for boundary values', () => {
      expect(validateNumberInRange(0, 'score', 0, 100)).toBeNull();
      expect(validateNumberInRange(100, 'score', 0, 100)).toBeNull();
    });

    it('should return error for non-number values', () => {
      const result = validateNumberInRange('50', 'score', 0, 100);
      expect(result).not.toBeNull();
      expect(result?.message).toBe('Must be a number');
    });

    it('should return error for values below minimum', () => {
      const result = validateNumberInRange(-1, 'score', 0, 100);
      expect(result).not.toBeNull();
      expect(result?.message).toBe('Must be between 0 and 100');
    });

    it('should return error for values above maximum', () => {
      const result = validateNumberInRange(101, 'score', 0, 100);
      expect(result).not.toBeNull();
      expect(result?.message).toBe('Must be between 0 and 100');
    });

    it('should return error for NaN', () => {
      const result = validateNumberInRange(NaN, 'score', 0, 100);
      expect(result).not.toBeNull();
      expect(result?.message).toBe('Must not be NaN');
    });
  });
});

describe('Error Handling Utilities', () => {
  describe('sleep', () => {
    it('should delay execution for specified duration', async () => {
      const start = Date.now();
      await sleep(100);
      const duration = Date.now() - start;
      
      // Allow 50ms tolerance for timing
      expect(duration).toBeGreaterThanOrEqual(100);
      expect(duration).toBeLessThan(150);
    });
  });
});
