/**
 * Unit tests for error handling utilities
 */

import { describe, it, expect } from 'vitest';
import { sanitizeErrorMessage, getErrorMessageForStatus } from '../errors';

describe('sanitizeErrorMessage', () => {
  it('should remove Stripe test API keys', () => {
    const error = new Error('Failed with key sk_test_51ABC123xyz');
    const sanitized = sanitizeErrorMessage(error);
    expect(sanitized).toBe('Failed with key=[REDACTED]');
    expect(sanitized).not.toContain('sk_test_');
  });

  it('should remove Stripe live API keys', () => {
    const error = new Error('Invalid key: sk_live_XYZ789abc456');
    const sanitized = sanitizeErrorMessage(error);
    expect(sanitized).toBe('Invalid key=[REDACTED]');
    expect(sanitized).not.toContain('sk_live_');
  });

  it('should remove long tokens', () => {
    const error = new Error('Token abc123def456ghi789jkl012mno345 is invalid');
    const sanitized = sanitizeErrorMessage(error);
    expect(sanitized).toBe('Token=[REDACTED] is invalid');
  });

  it('should remove email addresses', () => {
    const error = new Error('User test@example.com not found');
    const sanitized = sanitizeErrorMessage(error);
    expect(sanitized).toBe('User [REDACTED] not found');
  });

  it('should remove passwords in key-value patterns', () => {
    const error = new Error('Authentication failed: password=mySecretPass123');
    const sanitized = sanitizeErrorMessage(error);
    expect(sanitized).toContain('password=[REDACTED]');
    expect(sanitized).not.toContain('mySecretPass123');
  });

  it('should remove secrets in key-value patterns', () => {
    const error = new Error('Invalid secret: myApiSecret456');
    const sanitized = sanitizeErrorMessage(error);
    expect(sanitized).toContain('secret=[REDACTED]');
  });

  it('should remove tokens in key-value patterns', () => {
    const error = new Error('token=abc123xyz789');
    const sanitized = sanitizeErrorMessage(error);
    expect(sanitized).toContain('token=[REDACTED]');
  });

  it('should handle multiple sensitive patterns in one message', () => {
    const error = new Error(
      'Failed for user@test.com with key sk_test_123 and token abc123def456ghi789jkl012'
    );
    const sanitized = sanitizeErrorMessage(error);
    expect(sanitized).not.toContain('user@test.com');
    expect(sanitized).not.toContain('sk_test_123');
    expect(sanitized).not.toContain('abc123def456ghi789jkl012');
    expect(sanitized).toContain('[REDACTED]');
  });

  it('should preserve non-sensitive error messages', () => {
    const error = new Error('Connection timeout after 5 seconds');
    const sanitized = sanitizeErrorMessage(error);
    expect(sanitized).toBe('Connection timeout after 5 seconds');
  });

  it('should handle empty error messages', () => {
    const error = new Error('');
    const sanitized = sanitizeErrorMessage(error);
    expect(sanitized).toBe('');
  });
});

describe('getErrorMessageForStatus', () => {
  it('should return message for 400 Bad Request', () => {
    const message = getErrorMessageForStatus(400);
    expect(message).toBe('Invalid request. Please check your credentials and try again.');
  });

  it('should return message for 401 Unauthorized', () => {
    const message = getErrorMessageForStatus(401);
    expect(message).toBe('Invalid credentials. Please check your API key or credentials.');
  });

  it('should return message for 403 Forbidden', () => {
    const message = getErrorMessageForStatus(403);
    expect(message).toBe('Credentials lack required permissions.');
  });

  it('should return message for 404 Not Found', () => {
    const message = getErrorMessageForStatus(404);
    expect(message).toBe('Service endpoint not found. Please contact support.');
  });

  it('should return message for 429 Rate Limit', () => {
    const message = getErrorMessageForStatus(429);
    expect(message).toBe('Rate limit exceeded. Please try again in a few minutes.');
  });

  it('should return message for 500 Internal Server Error', () => {
    const message = getErrorMessageForStatus(500);
    expect(message).toBe('Service temporarily unavailable. Please try again later.');
  });

  it('should return message for 502 Bad Gateway', () => {
    const message = getErrorMessageForStatus(502);
    expect(message).toBe('Service temporarily unavailable. Please try again later.');
  });

  it('should return message for 503 Service Unavailable', () => {
    const message = getErrorMessageForStatus(503);
    expect(message).toBe('Service temporarily unavailable. Please try again later.');
  });

  it('should return message for 504 Gateway Timeout', () => {
    const message = getErrorMessageForStatus(504);
    expect(message).toBe('Service temporarily unavailable. Please try again later.');
  });

  it('should return generic message for other 4xx errors', () => {
    const message = getErrorMessageForStatus(418);
    expect(message).toBe('Invalid credentials or request. Please check your input.');
  });

  it('should return generic message for other 5xx errors', () => {
    const message = getErrorMessageForStatus(599);
    expect(message).toBe('External service error. Please try again later.');
  });

  it('should return generic message for unexpected status codes', () => {
    const message = getErrorMessageForStatus(200);
    expect(message).toBe('An unexpected error occurred. Please try again.');
  });

  it('should return generic message for 3xx redirects', () => {
    const message = getErrorMessageForStatus(301);
    expect(message).toBe('An unexpected error occurred. Please try again.');
  });
});
