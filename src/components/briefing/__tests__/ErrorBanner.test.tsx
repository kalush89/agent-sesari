/**
 * ErrorBanner Component Tests
 * 
 * Tests for the ErrorBanner component including:
 * - Error message display
 * - Retry button functionality
 * - Exponential backoff implementation
 * - Retry count tracking
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ErrorBanner } from '../ErrorBanner';

describe('ErrorBanner', () => {
  const mockOnRetry = vi.fn();
  const testErrorMessage = 'Failed to fetch briefing';

  beforeEach(() => {
    mockOnRetry.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Rendering', () => {
    it('should render error message', () => {
      render(<ErrorBanner message={testErrorMessage} onRetry={mockOnRetry} />);

      expect(screen.getByText(testErrorMessage)).toBeInTheDocument();
    });

    it('should render error heading', () => {
      render(<ErrorBanner message={testErrorMessage} onRetry={mockOnRetry} />);

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should render Retry button', () => {
      render(<ErrorBanner message={testErrorMessage} onRetry={mockOnRetry} />);

      const button = screen.getByRole('button', { name: 'Retry' });
      expect(button).toBeInTheDocument();
    });

    it('should render alert icon', () => {
      const { container } = render(
        <ErrorBanner message={testErrorMessage} onRetry={mockOnRetry} />
      );

      const icon = container.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('Retry Functionality', () => {
    it('should call onRetry when Retry button clicked', async () => {
      mockOnRetry.mockResolvedValue(undefined);
      
      render(<ErrorBanner message={testErrorMessage} onRetry={mockOnRetry} />);

      const button = screen.getByRole('button', { name: 'Retry' });
      fireEvent.click(button);

      // Fast-forward through backoff delay
      await vi.advanceTimersByTimeAsync(1000);

      await waitFor(() => {
        expect(mockOnRetry).toHaveBeenCalledTimes(1);
      });
    });

    it('should show "Retrying..." text while retrying', async () => {
      mockOnRetry.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 5000)));
      
      render(<ErrorBanner message={testErrorMessage} onRetry={mockOnRetry} />);

      const button = screen.getByRole('button', { name: 'Retry' });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Retrying...' })).toBeInTheDocument();
      });
    });

    it('should disable button while retrying', async () => {
      mockOnRetry.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 5000)));
      
      render(<ErrorBanner message={testErrorMessage} onRetry={mockOnRetry} />);

      const button = screen.getByRole('button', { name: 'Retry' });
      fireEvent.click(button);

      await waitFor(() => {
        const retryingButton = screen.getByRole('button', { name: 'Retrying...' });
        expect(retryingButton).toBeDisabled();
      });
    });

    it('should re-enable button after retry completes', async () => {
      mockOnRetry.mockResolvedValue(undefined);
      
      render(<ErrorBanner message={testErrorMessage} onRetry={mockOnRetry} />);

      const button = screen.getByRole('button', { name: 'Retry' });
      fireEvent.click(button);

      await vi.advanceTimersByTimeAsync(1000);

      await waitFor(() => {
        const retryButton = screen.getByRole('button', { name: 'Retry' });
        expect(retryButton).not.toBeDisabled();
      });
    });
  });

  describe('Exponential Backoff', () => {
    it('should wait 1 second on first retry', async () => {
      mockOnRetry.mockResolvedValue(undefined);
      
      render(<ErrorBanner message={testErrorMessage} onRetry={mockOnRetry} />);

      const button = screen.getByRole('button', { name: 'Retry' });
      fireEvent.click(button);

      // Should not call immediately
      expect(mockOnRetry).not.toHaveBeenCalled();

      // Should call after 1 second
      await vi.advanceTimersByTimeAsync(1000);
      
      await waitFor(() => {
        expect(mockOnRetry).toHaveBeenCalledTimes(1);
      });
    });

    it('should wait 2 seconds on second retry', async () => {
      mockOnRetry.mockRejectedValue(new Error('Still failing'));
      
      render(<ErrorBanner message={testErrorMessage} onRetry={mockOnRetry} />);

      const button = screen.getByRole('button', { name: 'Retry' });
      
      // First retry
      fireEvent.click(button);
      await vi.advanceTimersByTimeAsync(1000);
      await waitFor(() => expect(mockOnRetry).toHaveBeenCalledTimes(1));

      // Second retry
      mockOnRetry.mockClear();
      fireEvent.click(button);
      
      // Should not call after 1 second
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockOnRetry).not.toHaveBeenCalled();

      // Should call after 2 seconds total
      await vi.advanceTimersByTimeAsync(1000);
      
      await waitFor(() => {
        expect(mockOnRetry).toHaveBeenCalledTimes(1);
      });
    });

    it('should cap backoff at 10 seconds', async () => {
      mockOnRetry.mockRejectedValue(new Error('Still failing'));
      
      render(<ErrorBanner message={testErrorMessage} onRetry={mockOnRetry} />);

      const button = screen.getByRole('button', { name: 'Retry' });
      
      // Simulate many retries to reach cap
      for (let i = 0; i < 5; i++) {
        fireEvent.click(button);
        await vi.advanceTimersByTimeAsync(Math.min(1000 * Math.pow(2, i), 10000));
        await waitFor(() => expect(mockOnRetry).toHaveBeenCalled());
        mockOnRetry.mockClear();
      }

      // Next retry should wait max 10 seconds
      fireEvent.click(button);
      await vi.advanceTimersByTimeAsync(10000);
      
      await waitFor(() => {
        expect(mockOnRetry).toHaveBeenCalledTimes(1);
      });
    });

    it('should reset retry count on successful retry', async () => {
      mockOnRetry
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValueOnce(undefined);
      
      render(<ErrorBanner message={testErrorMessage} onRetry={mockOnRetry} />);

      const button = screen.getByRole('button', { name: 'Retry' });
      
      // First retry (fails)
      fireEvent.click(button);
      await vi.advanceTimersByTimeAsync(1000);
      await waitFor(() => expect(mockOnRetry).toHaveBeenCalledTimes(1));

      // Second retry (succeeds)
      fireEvent.click(button);
      await vi.advanceTimersByTimeAsync(2000);
      await waitFor(() => expect(mockOnRetry).toHaveBeenCalledTimes(2));

      // Retry count should be reset - not displayed
      expect(screen.queryByText(/Retry attempt/)).not.toBeInTheDocument();
    });
  });

  describe('Retry Count Display', () => {
    it('should not show retry count initially', () => {
      render(<ErrorBanner message={testErrorMessage} onRetry={mockOnRetry} />);

      expect(screen.queryByText(/Retry attempt/)).not.toBeInTheDocument();
    });

    it('should show retry count after first failed retry', async () => {
      mockOnRetry.mockRejectedValue(new Error('Still failing'));
      
      render(<ErrorBanner message={testErrorMessage} onRetry={mockOnRetry} />);

      const button = screen.getByRole('button', { name: 'Retry' });
      fireEvent.click(button);
      
      await vi.advanceTimersByTimeAsync(1000);
      
      await waitFor(() => {
        expect(screen.getByText('Retry attempt 1')).toBeInTheDocument();
      });
    });

    it('should increment retry count on subsequent failures', async () => {
      mockOnRetry.mockRejectedValue(new Error('Still failing'));
      
      render(<ErrorBanner message={testErrorMessage} onRetry={mockOnRetry} />);

      const button = screen.getByRole('button', { name: 'Retry' });
      
      // First retry
      fireEvent.click(button);
      await vi.advanceTimersByTimeAsync(1000);
      await waitFor(() => expect(screen.getByText('Retry attempt 1')).toBeInTheDocument());

      // Second retry
      fireEvent.click(button);
      await vi.advanceTimersByTimeAsync(2000);
      await waitFor(() => expect(screen.getByText('Retry attempt 2')).toBeInTheDocument());
    });
  });

  describe('Styling', () => {
    it('should have proper error banner styling', () => {
      const { container } = render(
        <ErrorBanner message={testErrorMessage} onRetry={mockOnRetry} />
      );

      const banner = container.querySelector('.bg-alert\\/10');
      expect(banner).toBeInTheDocument();
    });

    it('should have proper button styling', () => {
      render(<ErrorBanner message={testErrorMessage} onRetry={mockOnRetry} />);

      const button = screen.getByRole('button', { name: 'Retry' });
      expect(button.className).toContain('bg-primary');
      expect(button.className).toContain('text-white');
    });

    it('should center content on screen', () => {
      const { container } = render(
        <ErrorBanner message={testErrorMessage} onRetry={mockOnRetry} />
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('min-h-screen');
      expect(wrapper.className).toContain('flex');
      expect(wrapper.className).toContain('items-center');
      expect(wrapper.className).toContain('justify-center');
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      render(<ErrorBanner message={testErrorMessage} onRetry={mockOnRetry} />);

      const heading = screen.getByRole('heading', { level: 3 });
      expect(heading.textContent).toBe('Something went wrong');
    });

    it('should have accessible button', () => {
      render(<ErrorBanner message={testErrorMessage} onRetry={mockOnRetry} />);

      const button = screen.getByRole('button', { name: 'Retry' });
      expect(button).toBeInTheDocument();
    });

    it('should indicate disabled state properly', async () => {
      mockOnRetry.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 5000)));
      
      render(<ErrorBanner message={testErrorMessage} onRetry={mockOnRetry} />);

      const button = screen.getByRole('button', { name: 'Retry' });
      fireEvent.click(button);

      await waitFor(() => {
        const retryingButton = screen.getByRole('button', { name: 'Retrying...' });
        expect(retryingButton).toHaveAttribute('disabled');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty error message', () => {
      render(<ErrorBanner message="" onRetry={mockOnRetry} />);

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should handle very long error message', () => {
      const longMessage = 'A'.repeat(500);
      render(<ErrorBanner message={longMessage} onRetry={mockOnRetry} />);

      expect(screen.getByText(longMessage)).toBeInTheDocument();
    });

    it('should handle onRetry throwing synchronous error', async () => {
      mockOnRetry.mockImplementation(() => {
        throw new Error('Sync error');
      });
      
      render(<ErrorBanner message={testErrorMessage} onRetry={mockOnRetry} />);

      const button = screen.getByRole('button', { name: 'Retry' });
      fireEvent.click(button);

      await vi.advanceTimersByTimeAsync(1000);

      await waitFor(() => {
        expect(screen.getByText('Retry attempt 1')).toBeInTheDocument();
      });
    });
  });
});
