/**
 * Unit Tests for Formatting Utilities
 * 
 * Tests date and time formatting functions with various inputs and edge cases.
 * Validates Requirements 5.3 and 7.3.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatDateForDisplay, formatRelativeTime } from '../format';

describe('formatDateForDisplay', () => {
  it('should format a date string in YYYY-MM-DD format', () => {
    const result = formatDateForDisplay('2024-01-15');
    expect(result).toBe('Monday, January 15, 2024');
  });
  
  it('should format a Date object', () => {
    const date = new Date('2024-01-15T00:00:00Z');
    const result = formatDateForDisplay(date);
    expect(result).toContain('January 15, 2024');
  });
  
  it('should handle different months correctly', () => {
    expect(formatDateForDisplay('2024-02-14')).toBe('Wednesday, February 14, 2024');
    expect(formatDateForDisplay('2024-03-20')).toBe('Wednesday, March 20, 2024');
    expect(formatDateForDisplay('2024-12-25')).toBe('Wednesday, December 25, 2024');
  });
  
  it('should handle leap year dates', () => {
    const result = formatDateForDisplay('2024-02-29');
    expect(result).toBe('Thursday, February 29, 2024');
  });
  
  it('should handle year boundaries', () => {
    expect(formatDateForDisplay('2023-12-31')).toBe('Sunday, December 31, 2023');
    expect(formatDateForDisplay('2024-01-01')).toBe('Monday, January 1, 2024');
  });
  
  it('should handle midnight correctly', () => {
    const date = new Date('2024-01-15T00:00:00Z');
    const result = formatDateForDisplay(date);
    expect(result).toContain('January 15, 2024');
  });
  
  it('should throw error for invalid date string', () => {
    expect(() => formatDateForDisplay('invalid-date')).toThrow('Invalid date provided');
  });
  
  it('should throw error for invalid Date object', () => {
    const invalidDate = new Date('not a date');
    expect(() => formatDateForDisplay(invalidDate)).toThrow('Invalid date provided');
  });
});

describe('formatRelativeTime', () => {
  let mockNow: number;
  
  beforeEach(() => {
    // Mock Date.now() to return a fixed timestamp
    mockNow = new Date('2024-01-15T12:00:00Z').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(mockNow);
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  it('should return "Just now" for timestamps less than 1 minute ago', () => {
    const timestamp = mockNow - 30 * 1000; // 30 seconds ago
    expect(formatRelativeTime(timestamp)).toBe('Just now');
  });
  
  it('should return "Just now" for current timestamp', () => {
    expect(formatRelativeTime(mockNow)).toBe('Just now');
  });
  
  it('should return "Just now" for future timestamps', () => {
    const futureTimestamp = mockNow + 1000;
    expect(formatRelativeTime(futureTimestamp)).toBe('Just now');
  });
  
  it('should return "1 minute ago" for exactly 1 minute', () => {
    const timestamp = mockNow - 60 * 1000;
    expect(formatRelativeTime(timestamp)).toBe('1 minute ago');
  });
  
  it('should return "X minutes ago" for multiple minutes', () => {
    const timestamp = mockNow - 5 * 60 * 1000; // 5 minutes ago
    expect(formatRelativeTime(timestamp)).toBe('5 minutes ago');
  });
  
  it('should return "1 hour ago" for exactly 1 hour', () => {
    const timestamp = mockNow - 60 * 60 * 1000;
    expect(formatRelativeTime(timestamp)).toBe('1 hour ago');
  });
  
  it('should return "X hours ago" for multiple hours', () => {
    const timestamp = mockNow - 2 * 60 * 60 * 1000; // 2 hours ago
    expect(formatRelativeTime(timestamp)).toBe('2 hours ago');
  });
  
  it('should return "X hours ago" for 23 hours', () => {
    const timestamp = mockNow - 23 * 60 * 60 * 1000;
    expect(formatRelativeTime(timestamp)).toBe('23 hours ago');
  });
  
  it('should return "1 day ago" for exactly 24 hours', () => {
    const timestamp = mockNow - 24 * 60 * 60 * 1000;
    expect(formatRelativeTime(timestamp)).toBe('1 day ago');
  });
  
  it('should return "X days ago" for multiple days', () => {
    const timestamp = mockNow - 3 * 24 * 60 * 60 * 1000; // 3 days ago
    expect(formatRelativeTime(timestamp)).toBe('3 days ago');
  });
  
  it('should handle edge case at 59 seconds', () => {
    const timestamp = mockNow - 59 * 1000;
    expect(formatRelativeTime(timestamp)).toBe('Just now');
  });
  
  it('should handle edge case at 59 minutes', () => {
    const timestamp = mockNow - 59 * 60 * 1000;
    expect(formatRelativeTime(timestamp)).toBe('59 minutes ago');
  });
  
  it('should handle timestamps from several days ago', () => {
    const timestamp = mockNow - 7 * 24 * 60 * 60 * 1000; // 7 days ago
    expect(formatRelativeTime(timestamp)).toBe('7 days ago');
  });
});
