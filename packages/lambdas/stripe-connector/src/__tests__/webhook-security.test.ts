/**
 * Unit tests for webhook signature verification
 * Tests edge cases for security validation and replay attack prevention
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type Stripe from 'stripe';
import {
  verifyWebhookSignature,
  getWebhookSecret,
  createSecurityLogEntry,
  logSecurityFailure
} from '../webhook-security';

// Mock Stripe module
vi.mock('stripe', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      webhooks: {
        constructEvent: vi.fn()
      }
    }))
  };
});

describe('webhook-security', () => {
  const mockSecret = 'whsec_test_secret';
  const mockPayload = JSON.stringify({
    id: 'evt_test_123',
    type: 'customer.subscription.updated',
    created: Math.floor(Date.now() / 1000)
  });

  let mockStripeInstance: any;
  let StripeConstructor: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Get the mocked Stripe constructor
    const StripeModule = await import('stripe');
    StripeConstructor = StripeModule.default;
    
    // Create a mock instance
    mockStripeInstance = {
      webhooks: {
        constructEvent: vi.fn()
      }
    };
    
    // Make the constructor return our mock instance
    vi.mocked(StripeConstructor).mockReturnValue(mockStripeInstance);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('verifyWebhookSignature', () => {
    describe('valid signature acceptance', () => {
      it('should accept valid signature with fresh timestamp', () => {
        const currentTime = Math.floor(Date.now() / 1000);
        const mockEvent: Stripe.Event = {
          id: 'evt_test_123',
          object: 'event',
          api_version: '2024-12-18.acacia',
          created: currentTime,
          data: { object: {} as any },
          livemode: false,
          pending_webhooks: 0,
          request: null,
          type: 'customer.subscription.updated'
        };

        mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);

        const result = verifyWebhookSignature(mockPayload, 'valid_signature', mockSecret);

        expect(result.isValid).toBe(true);
        expect(result.event).toBeDefined();
        expect(result.event?.id).toBe('evt_test_123');
        expect(result.error).toBeUndefined();
      });

      it('should accept signature with timestamp at 4 minutes 59 seconds old', () => {
        const oldTime = Math.floor(Date.now() / 1000) - (4 * 60 + 59);
        const mockEvent: Stripe.Event = {
          id: 'evt_test_old',
          object: 'event',
          api_version: '2024-12-18.acacia',
          created: oldTime,
          data: { object: {} as any },
          livemode: false,
          pending_webhooks: 0,
          request: null,
          type: 'customer.subscription.updated'
        };

        mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);

        const result = verifyWebhookSignature(mockPayload, 'valid_signature', mockSecret);

        expect(result.isValid).toBe(true);
        expect(result.event).toBeDefined();
      });
    });

    describe('invalid signature rejection', () => {
      it('should reject invalid signature with 401-appropriate error', () => {
        mockStripeInstance.webhooks.constructEvent.mockImplementation(() => {
          throw new Error('Invalid signature');
        });

        const result = verifyWebhookSignature(mockPayload, 'invalid_signature', mockSecret);

        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Invalid signature');
        expect(result.errorType).toBe('invalid_signature');
        expect(result.event).toBeUndefined();
      });

      it('should reject malformed signature', () => {
        mockStripeInstance.webhooks.constructEvent.mockImplementation(() => {
          throw new Error('Unable to extract timestamp and signatures from header');
        });

        const result = verifyWebhookSignature(mockPayload, 'malformed', mockSecret);

        expect(result.isValid).toBe(false);
        expect(result.errorType).toBe('invalid_signature');
      });

      it('should reject signature with wrong secret', () => {
        mockStripeInstance.webhooks.constructEvent.mockImplementation(() => {
          throw new Error('No signatures found matching the expected signature for payload');
        });

        const result = verifyWebhookSignature(mockPayload, 'sig_with_wrong_secret', 'wrong_secret');

        expect(result.isValid).toBe(false);
        expect(result.errorType).toBe('invalid_signature');
      });
    });

    describe('expired timestamp rejection (>5 minutes)', () => {
      it('should reject webhook with timestamp exactly 5 minutes old', () => {
        const oldTime = Math.floor(Date.now() / 1000) - (5 * 60);
        const mockEvent: Stripe.Event = {
          id: 'evt_test_expired',
          object: 'event',
          api_version: '2024-12-18.acacia',
          created: oldTime,
          data: { object: {} as any },
          livemode: false,
          pending_webhooks: 0,
          request: null,
          type: 'customer.subscription.updated'
        };

        mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);

        const result = verifyWebhookSignature(mockPayload, 'valid_signature', mockSecret);

        expect(result.isValid).toBe(false);
        expect(result.errorType).toBe('expired_timestamp');
        expect(result.error).toContain('Webhook timestamp too old');
        expect(result.error).toContain('300 seconds');
      });

      it('should reject webhook with timestamp 10 minutes old', () => {
        const oldTime = Math.floor(Date.now() / 1000) - (10 * 60);
        const mockEvent: Stripe.Event = {
          id: 'evt_test_very_old',
          object: 'event',
          api_version: '2024-12-18.acacia',
          created: oldTime,
          data: { object: {} as any },
          livemode: false,
          pending_webhooks: 0,
          request: null,
          type: 'customer.subscription.updated'
        };

        mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);

        const result = verifyWebhookSignature(mockPayload, 'valid_signature', mockSecret);

        expect(result.isValid).toBe(false);
        expect(result.errorType).toBe('expired_timestamp');
      });

      it('should reject replay attack with 1 hour old timestamp', () => {
        const oldTime = Math.floor(Date.now() / 1000) - (60 * 60);
        const mockEvent: Stripe.Event = {
          id: 'evt_test_replay',
          object: 'event',
          api_version: '2024-12-18.acacia',
          created: oldTime,
          data: { object: {} as any },
          livemode: false,
          pending_webhooks: 0,
          request: null,
          type: 'customer.subscription.updated'
        };

        mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);

        const result = verifyWebhookSignature(mockPayload, 'valid_signature', mockSecret);

        expect(result.isValid).toBe(false);
        expect(result.errorType).toBe('expired_timestamp');
      });
    });

    describe('parsing errors', () => {
      it('should handle unknown error types gracefully', () => {
        mockStripeInstance.webhooks.constructEvent.mockImplementation(() => {
          throw 'String error'; // Non-Error object
        });

        const result = verifyWebhookSignature(mockPayload, 'signature', mockSecret);

        expect(result.isValid).toBe(false);
        expect(result.errorType).toBe('parsing_error');
        expect(result.error).toBe('Unknown verification error');
      });
    });
  });

  describe('getWebhookSecret', () => {
    it('should retrieve secret from environment variable', () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_123';
      
      const secret = getWebhookSecret();
      
      expect(secret).toBe('whsec_test_123');
    });

    it('should throw error if secret is not set', () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;
      
      expect(() => getWebhookSecret()).toThrow('STRIPE_WEBHOOK_SECRET environment variable is not set');
    });

    it('should throw error if secret is empty string', () => {
      process.env.STRIPE_WEBHOOK_SECRET = '';
      
      expect(() => getWebhookSecret()).toThrow('STRIPE_WEBHOOK_SECRET environment variable is not set');
    });
  });

  describe('createSecurityLogEntry', () => {
    it('should create log entry with all fields', () => {
      const entry = createSecurityLogEntry(
        'invalid_signature',
        'Signature verification failed',
        'evt_123',
        '192.168.1.1'
      );

      expect(entry.errorType).toBe('invalid_signature');
      expect(entry.errorMessage).toBe('Signature verification failed');
      expect(entry.eventId).toBe('evt_123');
      expect(entry.sourceIp).toBe('192.168.1.1');
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
      expect(entry.timestamp).toBeGreaterThan(0);
    });

    it('should include current timestamp', () => {
      const before = Date.now();
      const entry = createSecurityLogEntry('test', 'test message');
      const after = Date.now();

      expect(entry.timestamp).toBeGreaterThanOrEqual(before);
      expect(entry.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('logSecurityFailure', () => {
    it('should log security failure with JSON format', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const logEntry = createSecurityLogEntry(
        'invalid_signature',
        'Test failure',
        'evt_test',
        '10.0.0.1'
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
  });
});
