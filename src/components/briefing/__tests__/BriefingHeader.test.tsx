/**
 * BriefingHeader Component Tests
 * 
 * Tests for the BriefingHeader component including:
 * - Header rendering with date and insight count
 * - Date picker functionality
 * - Previous/Next navigation buttons
 * - Next button disabled when date is today
 * - Date formatting
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BriefingHeader } from '../BriefingHeader';

// Helper function to check if element exists in document
function isInDocument(element: HTMLElement | null): boolean {
  return element !== null && document.body.contains(element);
}

describe('BriefingHeader', () => {
  const mockOnDateChange = vi.fn();
  const testDate = '2024-01-15';
  const todayDate = new Date().toISOString().split('T')[0];

  beforeEach(() => {
    mockOnDateChange.mockClear();
  });

  describe('Rendering', () => {
    it('should render formatted date', () => {
      render(
        <BriefingHeader
          date={testDate}
          insightCount={5}
          onDateChange={mockOnDateChange}
        />
      );

      const dateElement = screen.getByText('Monday, January 15, 2024');
      expect(isInDocument(dateElement)).toBe(true);
    });

    it('should render insight count with singular form', () => {
      render(
        <BriefingHeader
          date={testDate}
          insightCount={1}
          onDateChange={mockOnDateChange}
        />
      );

      const countElement = screen.getByText('1 insight');
      expect(isInDocument(countElement)).toBe(true);
    });

    it('should render insight count with plural form', () => {
      render(
        <BriefingHeader
          date={testDate}
          insightCount={5}
          onDateChange={mockOnDateChange}
        />
      );

      const countElement = screen.getByText('5 insights');
      expect(isInDocument(countElement)).toBe(true);
    });

    it('should render insight count with zero', () => {
      render(
        <BriefingHeader
          date={testDate}
          insightCount={0}
          onDateChange={mockOnDateChange}
        />
      );

      const countElement = screen.getByText('0 insights');
      expect(isInDocument(countElement)).toBe(true);
    });
  });

  describe('Navigation Buttons', () => {
    it('should render Previous button', () => {
      render(
        <BriefingHeader
          date={testDate}
          insightCount={5}
          onDateChange={mockOnDateChange}
        />
      );

      const prevButton = screen.getByRole('button', { name: 'Previous day' });
      expect(prevButton).toBeInTheDocument();
    });

    it('should render Next button', () => {
      render(
        <BriefingHeader
          date={testDate}
          insightCount={5}
          onDateChange={mockOnDateChange}
        />
      );

      const nextButton = screen.getByRole('button', { name: 'Next day' });
      expect(nextButton).toBeInTheDocument();
    });

    it('should call onDateChange with previous date when Previous clicked', () => {
      render(
        <BriefingHeader
          date={testDate}
          insightCount={5}
          onDateChange={mockOnDateChange}
        />
      );

      const prevButton = screen.getByRole('button', { name: 'Previous day' });
      fireEvent.click(prevButton);

      expect(mockOnDateChange).toHaveBeenCalledWith('2024-01-14');
    });

    it('should call onDateChange with next date when Next clicked', () => {
      render(
        <BriefingHeader
          date={testDate}
          insightCount={5}
          onDateChange={mockOnDateChange}
        />
      );

      const nextButton = screen.getByRole('button', { name: 'Next day' });
      fireEvent.click(nextButton);

      expect(mockOnDateChange).toHaveBeenCalledWith('2024-01-16');
    });

    it('should disable Next button when date is today', () => {
      render(
        <BriefingHeader
          date={todayDate}
          insightCount={5}
          onDateChange={mockOnDateChange}
        />
      );

      const nextButton = screen.getByRole('button', { name: 'Next day' });
      expect(nextButton).toBeDisabled();
    });

    it('should enable Next button when date is not today', () => {
      render(
        <BriefingHeader
          date={testDate}
          insightCount={5}
          onDateChange={mockOnDateChange}
        />
      );

      const nextButton = screen.getByRole('button', { name: 'Next day' });
      expect(nextButton).not.toBeDisabled();
    });

    it('should not call onDateChange when Next clicked on today', () => {
      render(
        <BriefingHeader
          date={todayDate}
          insightCount={5}
          onDateChange={mockOnDateChange}
        />
      );

      const nextButton = screen.getByRole('button', { name: 'Next day' });
      fireEvent.click(nextButton);

      expect(mockOnDateChange).not.toHaveBeenCalled();
    });
  });

  describe('Date Picker', () => {
    it('should render date picker input', () => {
      render(
        <BriefingHeader
          date={testDate}
          insightCount={5}
          onDateChange={mockOnDateChange}
        />
      );

      const datePicker = screen.getByLabelText('Select date');
      expect(datePicker).toBeInTheDocument();
      expect(datePicker).toHaveAttribute('type', 'date');
    });

    it('should display current date value', () => {
      render(
        <BriefingHeader
          date={testDate}
          insightCount={5}
          onDateChange={mockOnDateChange}
        />
      );

      const datePicker = screen.getByLabelText('Select date') as HTMLInputElement;
      expect(datePicker.value).toBe(testDate);
    });

    it('should call onDateChange when date picker value changes', () => {
      render(
        <BriefingHeader
          date={testDate}
          insightCount={5}
          onDateChange={mockOnDateChange}
        />
      );

      const datePicker = screen.getByLabelText('Select date');
      fireEvent.change(datePicker, { target: { value: '2024-01-20' } });

      expect(mockOnDateChange).toHaveBeenCalledWith('2024-01-20');
    });

    it('should have max attribute set to today', () => {
      render(
        <BriefingHeader
          date={testDate}
          insightCount={5}
          onDateChange={mockOnDateChange}
        />
      );

      const datePicker = screen.getByLabelText('Select date');
      expect(datePicker).toHaveAttribute('max', todayDate);
    });
  });

  describe('Styling', () => {
    it('should have proper header styling', () => {
      const { container } = render(
        <BriefingHeader
          date={testDate}
          insightCount={5}
          onDateChange={mockOnDateChange}
        />
      );

      const header = container.querySelector('header');
      expect(header?.className).toContain('bg-card');
      expect(header?.className).toContain('border-b');
    });

    it('should have focus ring on date picker', () => {
      render(
        <BriefingHeader
          date={testDate}
          insightCount={5}
          onDateChange={mockOnDateChange}
        />
      );

      const datePicker = screen.getByLabelText('Select date');
      expect(datePicker.className).toContain('focus:ring-2');
      expect(datePicker.className).toContain('focus:ring-growth');
    });
  });

  describe('Edge Cases', () => {
    it('should handle month boundary correctly for Previous', () => {
      render(
        <BriefingHeader
          date="2024-02-01"
          insightCount={5}
          onDateChange={mockOnDateChange}
        />
      );

      const prevButton = screen.getByRole('button', { name: 'Previous day' });
      fireEvent.click(prevButton);

      expect(mockOnDateChange).toHaveBeenCalledWith('2024-01-31');
    });

    it('should handle month boundary correctly for Next', () => {
      render(
        <BriefingHeader
          date="2024-01-31"
          insightCount={5}
          onDateChange={mockOnDateChange}
        />
      );

      const nextButton = screen.getByRole('button', { name: 'Next day' });
      fireEvent.click(nextButton);

      expect(mockOnDateChange).toHaveBeenCalledWith('2024-02-01');
    });

    it('should handle year boundary correctly', () => {
      render(
        <BriefingHeader
          date="2023-12-31"
          insightCount={5}
          onDateChange={mockOnDateChange}
        />
      );

      const nextButton = screen.getByRole('button', { name: 'Next day' });
      fireEvent.click(nextButton);

      expect(mockOnDateChange).toHaveBeenCalledWith('2024-01-01');
    });

    it('should handle leap year correctly', () => {
      render(
        <BriefingHeader
          date="2024-02-28"
          insightCount={5}
          onDateChange={mockOnDateChange}
        />
      );

      const nextButton = screen.getByRole('button', { name: 'Next day' });
      fireEvent.click(nextButton);

      expect(mockOnDateChange).toHaveBeenCalledWith('2024-02-29');
    });
  });
});
