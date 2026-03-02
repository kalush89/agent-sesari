import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import {
  recordMetric,
  recordCredentialStored,
  recordValidationSuccess,
  recordValidationFailure,
  recordTokenRefresh
} from '../metrics';

vi.mock('@aws-sdk/client-cloudwatch');

describe('Metrics Utility', () => {
  let mockSend: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    mockSend = vi.fn().mockResolvedValue({});
    vi.mocked(CloudWatchClient).mockImplementation(
      () =>
        ({
          send: mockSend
        }) as any
    );
    consoleErrorSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('recordMetric()', () => {
    it('should send metric to CloudWatch', async () => {
      await recordMetric('CredentialStored', 1, { ServiceName: 'stripe' });

      expect(mockSend).toHaveBeenCalledOnce();
    });

    it('should send metric with default value of 1', async () => {
      await recordMetric('ValidationSuccess');

      expect(mockSend).toHaveBeenCalledOnce();
    });

    it('should not throw on CloudWatch errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('CloudWatch error'));

      await expect(recordMetric('CredentialStored', 1)).resolves.not.toThrow();
      
      // Should log error
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('recordCredentialStored()', () => {
    it('should record CredentialStored metric', async () => {
      await recordCredentialStored('stripe', 'api_key');

      expect(mockSend).toHaveBeenCalledOnce();
    });
  });

  describe('recordValidationSuccess()', () => {
    it('should record ValidationSuccess metric', async () => {
      await recordValidationSuccess('mixpanel');

      expect(mockSend).toHaveBeenCalledOnce();
    });
  });

  describe('recordValidationFailure()', () => {
    it('should record ValidationFailure metric', async () => {
      await recordValidationFailure('stripe');

      expect(mockSend).toHaveBeenCalledOnce();
    });
  });

  describe('recordTokenRefresh()', () => {
    it('should record TokenRefresh metric', async () => {
      await recordTokenRefresh('hubspot');

      expect(mockSend).toHaveBeenCalledOnce();
    });
  });
});
