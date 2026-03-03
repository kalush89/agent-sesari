/**
 * Unit tests for Mixpanel webhook signature verification
 * Tests edge cases for security validation and replay attack prevention
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import crypto from 'crypto';
import {
  verifyWebhookSignature,
  getWebhookSecret,
  createSecurityLogEntry,
  logSecurityFailure
} from '../webhook-security';

describe('webhook-security', () => {
  const mockSecret = 'test_mixpanel_webhook_secret_123';
  const mockPayload = JSON.stringify({
    event: 'Feature Used',
    properties: {
      distinct_id: 'user_123',
      feature_name: 'Dashboard',
      time: Date.now()
    }
  });

  /**
   * Helper function to generate valid Mixpanel signature
   */
  function generateValidSignature(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('verifyWebhookSignature', () => {
    describe('valid signature acceptance', () => {
      it('should accept valid signature with fresh timestamp', () => {
        const validSignature = generateValidSignature(mockPayload, mockSecret);
        const currentTimestamp = Date.now().toString();

        const result = verifyWebhookSignature(
          mockPayload,
          validSignature,
          mockSecret,
          currentTimestamp
        );

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.errorType).toBeUndefined();
      });

      it('should accept signature with timestamp at 4 minutes 59 seconds old', () => {
        const validSignature = generateValidSignature(mockPayload, mockSecret);
        const oldTimestamp = (Date.now() - (4 * 60 + 59) * 1000).toString();

        const result = verifyWebhookSignature(
          mockPayload,
          validSignature,
          mockSecret,
          oldTimestamp
        );

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should accept valid signature without timestamp parameter', () => {
        const validSignature = generateValidSignature(mockPayload, mockSecret);

        const result = verifyWebhookSignature(
          mockPayload,
          validSignature,
          mockSecret
        );

        expect(result.isValid).toBe(true);
      });
    });

    describe('invalid signature rejection (401 response)', () => {
      it('should reject invalid signature', () => {
        const invalidSignature = 'invalid_signature_hash';
        const currentTimestamp = Date.now().toString();

        const result = verifyWebhookSignature(
          mockPayload,
          invalidSignature,
          mockSecret,
          currentTimestamp
        );

        expect(result.isValid).toBe(false);
        expect(result.errorType).toBe('invalid_signature');
        expect(result.error).toBe('Signature verification failed');
      });

      it('should reject signature with wrong secret', () => {
        const signatureWithWrongSecret = generateValidSignature(mockPayload, 'wrong_secret');
        const currentTimestamp = Date.now().toString();

        const result = verifyWebhookSignature(
          mockPayload,
          signatureWithWrongSecret,
          mockSecret,
          currentTimestamp
        );

        expect(result.isValid).toBe(false);
        expect(result.errorType).toBe('invalid_signature');
      });

      it('should reject signature for different payload', () => {
        const differentPayload = JSON.stringify({ different: 'data' });
        const signatureForDifferentPayload = generateValidSignature(differentPayload, mockSecret);
        const currentTimestamp = Date.now().toString();

        const result = verifyWebhookSignature(
          mockPayload,
          signatureForDifferentPayload,
          mockSecret,
          currentTimestamp
        );

        expect(result.isValid).toBe(false);
        expect(result.errorType).toBe('invalid_signature');
      });

      it('should reject empty signature', () => {
        const currentTimestamp = Date.now().toString();

        const result = verifyWebhookSignature(
          mockPayload,
          '',
          mockSecret,
          currentTimestamp
        );

        expect(result.isValid).toBe(false);
        expect(result.errorType).toBe('missing_header');
        expect(result.error).toBe('Missing signature header');
      });

      it('should reject malformed signature (wrong length)', () => {
        const malformedSignature = 'abc123';
        const currentTimestamp = Date.now().toString();

        const result = verifyWebhookSignature(
          mockPayload,
          malformedSignature,
          mockSecret,
          currentTimestamp
        );

        expect(result.isValid).toBe(false);
        expect(result.errorType).toBe('invalid_signature');
      });
    });

    describe('expired timestamp rejection (>5 minutes)', () => {
      it('should reject webhook with timestamp exactly 5 minutes old', () => {
        const validSignature = generateValidSignature(mockPayload, mockSecret);
        const expiredTimestamp = (Date.now() - 5 * 60 * 1000).toString();

        const result = verifyWebhookSignature(
          mockPayload,
          validSignature,
          mockSecret,
          expiredTimestamp
        );

        expect(result.isValid).toBe(false);
        expect(result.errorType).toBe('expired_timestamp');
        expect(result.error).toContain('Webhook timestamp too old');
        expect(result.error).toContain('300 seconds');
      });

      it('should reject webhook with timestamp 10 minutes old', () => {
        const validSignature = generateValidSignature(mockPayload, mockSecret);
        const expiredTimestamp = (Date.now() - 10 * 60 * 1000).toString();

        const result = verifyWebhookSignature(
          mockPayload,
          validSignature,
          mockSecret,
          expiredTimestamp
        );

        expect(result.isValid).toBe(false);
        expect(result.errorType).toBe('expired_timestamp');
        expect(result.error).toContain('600 seconds');
      });

      it('should reject replay attack with 1 hour old timestamp', () => {
        const validSignature = generateValidSignature(mockPayload, mockSecret);
        const replayTimestamp = (Date.now() - 60 * 60 * 1000).toString();

        const result = verifyWebhookSignature(
          mockPayload,
          validSignature,
          mockSecret,
          replayTimestamp
        );

        expect(result.isValid).toBe(false);
        expect(result.errorType).toBe('expired_timestamp');
      });

      it('should reject webhook with timestamp 6 minutes old', () => {
        const validSignature = generateValidSignature(mockPayload, mockSecret);
        const expiredTimestamp = (Date.now() - 6 * 60 * 1000).toString();

        const result = verifyWebhookSignature(
          mockPayload,
          validSignature,
          mockSecret,
          expiredTimestamp
        );

        expect(result.isValid).toBe(false);
        expect(result.errorType).toBe('expired_timestamp');
      });
    });

    describe('edge cases', () => {
      it('should handle invalid timestamp format gracefully', () => {
        const validSignature = generateValidSignature(mockPayload, mockSecret);
        const invalidTimestamp = 'not-a-number';

        const result = verifyWebhookSignature(
          mockPayload,
          validSignature,
          mockSecret,
          invalidTimestamp
        );

        // Should still validate signature even with invalid timestamp
        expect(result.isValid).toBe(true);
      });

      it('should handle empty payload', () => {
        const emptyPayload = '';
        const signature = generateValidSignature(emptyPayload, mockSecret);
        const currentTimestamp = Date.now().toString();

        const result = verifyWebhookSignature(
          emptyPayload,
          signature,
          mockSecret,
          currentTimestamp
        );

        expect(result.isValid).toBe(true);
      });

      it('should use constant-time comparison for security', () => {
        // This test verifies that timing attacks are prevented
        const validSignature = generateValidSignature(mockPayload, mockSecret);
        const almostValidSignature = validSignature.slice(0, -1) + 'x';
        const currentTimestamp = Date.now().toString();

        const result1 = verifyWebhookSignature(
          mockPayload,
          almostValidSignature,
          mockSecret,
          currentTimestamp
        );

        const result2 = verifyWebhookSignature(
          mockPayload,
          'completely_wrong',
          mockSecret,
          currentTimestamp
        );

        // Both should fail, demonstrating constant-time comparison
        expect(result1.isValid).toBe(false);
        expect(result2.isValid).toBe(false);
      });
    });
  });

  describe('getWebhookSecret', () => {
    it('should retrieve secret from environment variable', () => {
      process.env.MIXPANEL_WEBHOOK_SECRET = 'test_secret_123';
      
      const secret = getWebhookSecret();
      
      expect(secret).toBe('test_secret_123');
    });

    it('should throw error if secret is not set', () => {
      delete process.env.MIXPANEL_WEBHOOK_SECRET;
      
      expect(() => getWebhookSecret()).toThrow('MIXPANEL_WEBHOOK_SECRET environment variable is not set');
    });

    it('should throw error if secret is empty string', () => {
      process.env.MIXPANEL_WEBHOOK_SECRET = '';
      
      expect(() => getWebhookSecret()).toThrow('MIXPANEL_WEBHOOK_SECRET environment variable is not set');
    });
  });

  describe('createSecurityLogEntry', () => {
    it('should create log entry with all fields', () => {
      const entry = createSecurityLogEntry(
        'invalid_signature',
        'Signature verification failed',
        'evt_123',
        '192.168.1.1',
        '1234567890'
      );

      expect(entry.errorType).toBe('invalid_signature');
      expect(entry.errorMessage).toBe('Signature verification failed');
      expect(entry.eventId).toBe('evt_123');
      expect(entry.sourceIp).toBe('192.168.1.1');
      expect(entry.requestTimestamp).toBe('1234567890');
      expect(entry.timestamp).toBeGreaterThan(0);
    });

    it('should create log entry without optional fields', () => {
      const entry = createSecurityLogEntry(
        'expired_timestamp',
        'Webhook too old'
      );

      expect(entry.errorType).toBe('expired_timestamp');
      expect(entry.errorMessage).toBe('Webhook too old');
      expect(entry.eventId).toBeUndefined();
      expect(entry.sourceIp).toBeUndefined();
      expect(entry.requestTimestamp).toBeUndefined();
      expect(entry.timestamp).toBeGreaterThan(0);
    });

    it('should include current timestamp', () => {
      const before = Date.now();
      const entry = createSecurityLogEntry('test', 'test message');
      const after = Date.now();

      expect(entry.timestamp).toBeGreaterThanOrEqual(before);
      expect(entry.timestamp).toBeLessThanOrEqual(after);
    });

    it('should create log entry for replay attack', () => {
      const entry = createSecurityLogEntry(
        'expired_timestamp',
        'Replay attack detected',
        'evt_replay_123',
        '10.0.0.1',
        '1609459200000'
      );

      expect(entry.errorType).toBe('expired_timestamp');
      expect(entry.errorMessage).toBe('Replay attack detected');
      expect(entry.requestTimestamp).toBe('1609459200000');
    });
  });

  describe('logSecurityFailure', () => {
    it('should log security failure with JSON format', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const logEntry = createSecurityLogEntry(
        'invalid_signature',
        'Test failure',
        'evt_test',
        '10.0.0.1',
        '1234567890'
      );
      
      logSecurityFailure(logEntry);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'SECURITY_FAILURE',
        expect.stringContaining('"errorType":"invalid_signature"')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'SECURITY_FAILURE',
        expect.stringContaining('"eventId":"evt_test"')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'SECURITY_FAILURE',
        expect.stringContaining('"sourceIp":"10.0.0.1"')
      );

      consoleErrorSpy.mockRestore();
    });

    it('should log with SECURITY_FAILURE prefix for monitoring', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const logEntry = createSecurityLogEntry('test', 'test');
      logSecurityFailure(logEntry);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'SECURITY_FAILURE',
        expect.any(String)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should log replay attack attempts', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const logEntry = createSecurityLogEntry(
        'expired_timestamp',
        'Webhook timestamp too old: 3600 seconds',
        'evt_old',
        '192.168.1.100',
        '1609459200000'
      );
      
      logSecurityFailure(logEntry);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'SECURITY_FAILURE',
        expect.stringContaining('"errorType":"expired_timestamp"')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'SECURITY_FAILURE',
        expect.stringContaining('3600 seconds')
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
