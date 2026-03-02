import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log, logInfo, logWarn, logError, logDebug } from '../logging';

describe('Logging Utility', () => {
  let consoleLogSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('log()', () => {
    it('should output structured JSON log', () => {
      log('INFO', 'Test message', { user_id: 'user123', action: 'test' });

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);

      expect(logOutput).toMatchObject({
        level: 'INFO',
        message: 'Test message',
        user_id: 'user123',
        action: 'test'
      });
      expect(logOutput.timestamp).toBeDefined();
    });

    it('should sanitize sensitive fields from context', () => {
      log('INFO', 'Credential stored', {
        user_id: 'user123',
        service_name: 'stripe',
        api_key: 'sk_test_secret123',
        refresh_token: 'refresh_secret',
        access_token: 'access_secret',
        password: 'password123',
        secret: 'secret123'
      });

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);

      expect(logOutput.user_id).toBe('user123');
      expect(logOutput.service_name).toBe('stripe');
      expect(logOutput.api_key).toBeUndefined();
      expect(logOutput.refresh_token).toBeUndefined();
      expect(logOutput.access_token).toBeUndefined();
      expect(logOutput.password).toBeUndefined();
      expect(logOutput.secret).toBeUndefined();
    });

    it('should handle empty context', () => {
      log('INFO', 'Test message');

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);

      expect(logOutput).toMatchObject({
        level: 'INFO',
        message: 'Test message',
        timestamp: expect.any(String)
      });
    });

    it('should preserve non-sensitive fields', () => {
      log('INFO', 'Test message', {
        user_id: 'user123',
        service_name: 'stripe',
        action: 'validate',
        status: 'success',
        duration_ms: 150
      });

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);

      expect(logOutput.user_id).toBe('user123');
      expect(logOutput.service_name).toBe('stripe');
      expect(logOutput.action).toBe('validate');
      expect(logOutput.status).toBe('success');
      expect(logOutput.duration_ms).toBe(150);
    });
  });

  describe('logInfo()', () => {
    it('should log with INFO level', () => {
      logInfo('Info message', { user_id: 'user123' });

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.level).toBe('INFO');
      expect(logOutput.message).toBe('Info message');
    });
  });

  describe('logWarn()', () => {
    it('should log with WARN level', () => {
      logWarn('Warning message', { user_id: 'user123' });

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.level).toBe('WARN');
      expect(logOutput.message).toBe('Warning message');
    });
  });

  describe('logError()', () => {
    it('should log with ERROR level', () => {
      logError('Error message', { user_id: 'user123', error: 'Something failed' });

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.level).toBe('ERROR');
      expect(logOutput.message).toBe('Error message');
      expect(logOutput.error).toBe('Something failed');
    });
  });

  describe('logDebug()', () => {
    it('should log with DEBUG level', () => {
      logDebug('Debug message', { user_id: 'user123' });

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.level).toBe('DEBUG');
      expect(logOutput.message).toBe('Debug message');
    });
  });

  describe('Sensitive data sanitization', () => {
    it('should remove encrypted_data field', () => {
      log('INFO', 'Test', { encrypted_data: 'base64encodeddata' });

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.encrypted_data).toBeUndefined();
    });

    it('should remove plaintext field', () => {
      log('INFO', 'Test', { plaintext: 'sensitive plaintext' });

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.plaintext).toBeUndefined();
    });

    it('should remove credential field', () => {
      log('INFO', 'Test', { credential: { api_key: 'secret' } });

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.credential).toBeUndefined();
    });
  });
});
