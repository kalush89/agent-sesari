/**
 * Unit tests for credential masking utilities
 */

import { describe, it, expect } from 'vitest';
import { maskCredential, generateMaskedDisplay } from '../masking.js';
import {
  OAuthCredential,
  APIKeyCredential,
  ServiceAccountCredential
} from '../../types/index.js';

describe('maskCredential', () => {
  it('should mask all but last 4 characters by default', () => {
    // DUMMY VALUE
    const result = maskCredential('sk_test_dummy_key_1234567890');
    expect(result).toBe('*********************7890');
  });

  it('should mask all but last N characters when specified', () => {
    // DUMMY VALUE
    const result = maskCredential('sk_test_dummy_key_1234567890', 6);
    expect(result).toBe('*******************567890');
  });

  it('should mask entire string if length <= visibleChars', () => {
    const result = maskCredential('abc', 4);
    expect(result).toBe('***');
  });

  it('should mask entire string if length equals visibleChars', () => {
    const result = maskCredential('abcd', 4);
    expect(result).toBe('****');
  });

  it('should handle single character strings', () => {
    const result = maskCredential('a', 4);
    expect(result).toBe('*');
  });

  it('should handle empty strings', () => {
    const result = maskCredential('');
    expect(result).toBe('');
  });

  it('should preserve exactly 4 characters for typical API keys', () => {
    // DUMMY VALUE
    const apiKey = 'sk_live_dummy_long_key_for_testing_purposes_only';
    const result = maskCredential(apiKey);
    expect(result.slice(-4)).toBe('only');
    expect(result.length).toBe(apiKey.length);
  });

  it('should mask secrets with special characters', () => {
    // DUMMY VALUE
    const secret = 'my$ecr3t!@#$%^&*()_+password';
    const result = maskCredential(secret);
    expect(result.slice(-4)).toBe('word');
    expect(result.length).toBe(secret.length);
  });
});

describe('generateMaskedDisplay', () => {
  describe('OAuth credentials', () => {
    it('should return "Connected" for OAuth credentials', () => {
      const credential: OAuthCredential = {
        refresh_token: 'dummy_refresh_token_12345',
        access_token: 'dummy_access_token_67890',
        token_expiry: '2026-12-31T23:59:59Z',
        scope: 'crm.objects.companies.read'
      };

      const result = generateMaskedDisplay('oauth', credential);
      expect(result).toBe('Connected');
    });

    it('should return "Connected" even without optional fields', () => {
      const credential: OAuthCredential = {
        refresh_token: 'dummy_refresh_token_12345'
      };

      const result = generateMaskedDisplay('oauth', credential);
      expect(result).toBe('Connected');
    });
  });

  describe('API Key credentials', () => {
    it('should mask Stripe test key showing last 4 characters', () => {
      const credential: APIKeyCredential = {
        // DUMMY VALUE
        api_key: 'sk_test_dummy_key_for_testing'
      };

      const result = generateMaskedDisplay('api_key', credential);
      // 'sk_test_dummy_key_for_testing' is 29 chars, 25 asterisks + 'sting'
      expect(result).toBe('*************************ting');
    });

    it('should mask Stripe live key showing last 4 characters', () => {
      const credential: APIKeyCredential = {
        // DUMMY VALUE
        api_key: 'sk_live_dummy_long_stripe_key'
      };

      const result = generateMaskedDisplay('api_key', credential);
      // 'sk_live_dummy_long_stripe_key' is 29 chars, so 25 asterisks + 'ekey'
      expect(result).toBe('*************************ekey');
    });

    it('should handle short API keys', () => {
      const credential: APIKeyCredential = {
        api_key: 'abc'
      };

      const result = generateMaskedDisplay('api_key', credential);
      expect(result).toBe('***');
    });
  });

  describe('Service Account credentials', () => {
    it('should show username plaintext and mask secret', () => {
      const credential: ServiceAccountCredential = {
        username: 'service_account_123',
        secret: 'dummy_secret_password_value'
      };

      const result = generateMaskedDisplay('service_account', credential);
      // 'dummy_secret_password_value' is 27 chars, so 23 asterisks + 'alue'
      expect(result).toBe('service_account_123 / ***********************alue');
    });

    it('should handle short secrets', () => {
      const credential: ServiceAccountCredential = {
        username: 'user',
        secret: 'pwd'
      };

      const result = generateMaskedDisplay('service_account', credential);
      expect(result).toBe('user / ***');
    });

    it('should handle usernames with special characters', () => {
      const credential: ServiceAccountCredential = {
        username: 'user@example.com',
        secret: 'dummy_long_secret_value_12345'
      };

      const result = generateMaskedDisplay('service_account', credential);
      // 'dummy_long_secret_value_12345' is 29 chars, so 25 asterisks + '2345'
      expect(result).toBe('user@example.com / *************************2345');
    });

    it('should not mask username (non-sensitive field)', () => {
      const credential: ServiceAccountCredential = {
        username: 'my_username_is_visible',
        secret: 'dummy_secret_value'
      };

      const result = generateMaskedDisplay('service_account', credential);
      expect(result).toContain('my_username_is_visible');
      expect(result).not.toContain('dummy_secret_value');
      expect(result).toContain('alue'); // last 4 chars of secret
    });
  });

  describe('Edge cases', () => {
    it('should handle unknown credential types gracefully', () => {
      const credential: OAuthCredential = {
        refresh_token: 'token'
      };

      // @ts-expect-error Testing invalid credential type
      const result = generateMaskedDisplay('unknown_type', credential);
      expect(result).toBe('Connected');
    });
  });
});

describe('Masking consistency (Property 6)', () => {
  it('should always show exactly last 4 characters for values > 4 chars', () => {
    const testValues = [
      'sk_test_dummy_12345',
      'very_long_dummy_api_key_with_many_characters_1234567890',
      'short12345',
      'a'.repeat(100) + 'TEST'
    ];

    testValues.forEach(value => {
      const result = maskCredential(value);
      expect(result.slice(-4)).toBe(value.slice(-4));
      expect(result.length).toBe(value.length);
    });
  });

  it('should replace all non-visible characters with asterisks', () => {
    // DUMMY VALUE
    const value = 'sk_test_dummy_value_for_testing';
    const result = maskCredential(value);
    
    const maskedPortion = result.slice(0, -4);
    expect(maskedPortion).toBe('*'.repeat(value.length - 4));
  });
});

describe('Selective field masking (Property 7)', () => {
  it('should mask api_key field in API key credentials', () => {
    const credential: APIKeyCredential = {
      api_key: 'sk_test_dummy_sensitive_value'
    };

    const result = generateMaskedDisplay('api_key', credential);
    expect(result).not.toContain('sk_test_dummy_sensitive_value');
    expect(result).toContain('alue'); // last 4 chars
  });

  it('should mask secret field but NOT username in service account credentials', () => {
    const credential: ServiceAccountCredential = {
      username: 'public_username',
      secret: 'private_dummy_secret_value'
    };

    const result = generateMaskedDisplay('service_account', credential);
    
    // Username should be visible (non-sensitive)
    expect(result).toContain('public_username');
    
    // Secret should be masked (sensitive)
    expect(result).not.toContain('private_dummy_secret_value');
    expect(result).toContain('alue'); // last 4 chars of secret
  });

  it('should mask refresh_token by not displaying it in OAuth credentials', () => {
    const credential: OAuthCredential = {
      refresh_token: 'super_secret_dummy_refresh_token',
      access_token: 'super_secret_dummy_access_token'
    };

    const result = generateMaskedDisplay('oauth', credential);
    
    // Neither token should appear in the display
    expect(result).not.toContain('super_secret_dummy_refresh_token');
    expect(result).not.toContain('super_secret_dummy_access_token');
    expect(result).toBe('Connected');
  });
});