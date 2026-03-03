/**
 * Unit tests for structured logging utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log, logInfo, logWarn, logError, generateCorrelationId } from '../logging.js';

describe('Structured Logging', () => {
  let consoleLogSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('log', () => {
    it('should output structured JSON log', () => {
      const context = {
        correlation_id: 'test-123',
        phase: 'data-fetching',
      };

      log('INFO', 'Test message', context);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);

      expect(logOutput).toMatchObject({
        level: 'INFO',
        message: 'Test message',
        correlation_id: 'test-123',
        phase: 'data-fetching',
      });
      expect(logOutput.timestamp).toBeDefined();
    });

    it('should include all log levels', () => {
      const context = { correlation_id: 'test-123' };

      log('INFO', 'Info message', context);
      log('WARN', 'Warn message', context);
      log('ERROR', 'Error message', context);

      expect(consoleLogSpy).toHaveBeenCalledTimes(3);

      const logs = consoleLogSpy.mock.calls.map((call: any) => JSON.parse(call[0]));
      expect(logs[0].level).toBe('INFO');
      expect(logs[1].level).toBe('WARN');
      expect(logs[2].level).toBe('ERROR');
    });
  });

  describe('PII sanitization', () => {
    it('should remove email addresses from logs', () => {
      const context = {
        correlation_id: 'test-123',
        email: 'user@example.com',
        phase: 'data-fetching',
      };

      log('INFO', 'Test message', context);

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.email).toBeUndefined();
      expect(logOutput.correlation_id).toBe('test-123');
      expect(logOutput.phase).toBe('data-fetching');
    });

    it('should remove company names from logs', () => {
      const context = {
        correlation_id: 'test-123',
        company_name: 'Acme Corp',
      };

      log('INFO', 'Test message', context);

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.company_name).toBeUndefined();
    });

    it('should remove personal names from logs', () => {
      const context = {
        correlation_id: 'test-123',
        name: 'John Doe',
      };

      log('INFO', 'Test message', context);

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.name).toBeUndefined();
    });

    it('should remove API keys and tokens from logs', () => {
      const context = {
        correlation_id: 'test-123',
        api_key: 'sk_test_123',
        access_token: 'token_abc',
        refresh_token: 'refresh_xyz',
        secret: 'secret_value',
      };

      log('INFO', 'Test message', context);

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.api_key).toBeUndefined();
      expect(logOutput.access_token).toBeUndefined();
      expect(logOutput.refresh_token).toBeUndefined();
      expect(logOutput.secret).toBeUndefined();
    });

    it('should remove phone numbers from logs', () => {
      const context = {
        correlation_id: 'test-123',
        phone: '+1-555-1234',
      };

      log('INFO', 'Test message', context);

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.phone).toBeUndefined();
    });

    it('should keep non-PII fields in logs', () => {
      const context = {
        correlation_id: 'test-123',
        phase: 'scoring',
        customer_count: 100,
        duration_ms: 5000,
        email: 'user@example.com', // Should be removed
      };

      log('INFO', 'Test message', context);

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.correlation_id).toBe('test-123');
      expect(logOutput.phase).toBe('scoring');
      expect(logOutput.customer_count).toBe(100);
      expect(logOutput.duration_ms).toBe(5000);
      expect(logOutput.email).toBeUndefined();
    });
  });

  describe('logInfo', () => {
    it('should log INFO level messages', () => {
      const context = {
        correlation_id: 'test-123',
        phase: 'data-fetching',
      };

      logInfo('Info message', context);

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.level).toBe('INFO');
      expect(logOutput.message).toBe('Info message');
    });
  });

  describe('logWarn', () => {
    it('should log WARN level messages', () => {
      const context = {
        correlation_id: 'test-123',
        phase: 'data-fetching',
      };

      logWarn('Warning message', context);

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.level).toBe('WARN');
      expect(logOutput.message).toBe('Warning message');
    });
  });

  describe('logError', () => {
    it('should log ERROR level messages', () => {
      const context = {
        correlation_id: 'test-123',
        phase: 'data-fetching',
      };

      logError('Error message', context);

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.level).toBe('ERROR');
      expect(logOutput.message).toBe('Error message');
    });
  });

  describe('generateCorrelationId', () => {
    it('should generate unique correlation IDs', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^icp-\d+-[a-z0-9]+$/);
      expect(id2).toMatch(/^icp-\d+-[a-z0-9]+$/);
    });

    it('should generate IDs with correct format', () => {
      const id = generateCorrelationId();

      expect(id).toMatch(/^icp-\d+-[a-z0-9]+$/);
      expect(id.startsWith('icp-')).toBe(true);
    });
  });

  describe('execution phase tracking', () => {
    it('should include phase in log context', () => {
      const phases = [
        'environment-validation',
        'data-fetching',
        'data-correlation',
        'customer-scoring',
        'sample-validation',
        'top-selection',
        'pii-masking',
        'trait-analysis',
        'kb-update',
        'history-storage',
        'metrics-publishing',
      ];

      phases.forEach((phase) => {
        logInfo('Phase started', {
          correlation_id: 'test-123',
          phase,
        });
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(phases.length);

      const logs = consoleLogSpy.mock.calls.map((call: any) => JSON.parse(call[0]));
      logs.forEach((log, index) => {
        expect(log.phase).toBe(phases[index]);
      });
    });
  });
});
