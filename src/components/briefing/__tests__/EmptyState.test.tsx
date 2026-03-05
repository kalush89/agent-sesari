/**
 * EmptyState Component Tests
 * 
 * Tests for the EmptyState component including:
 * - New user welcome message
 * - Quiet day message
 * - Connect Integration button
 * - Navigation functionality
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from '../EmptyState';

// Mock Next.js router
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush
  })
}));

describe('EmptyState', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  describe('New User State', () => {
    it('should render welcome message for new users', () => {
      render(<EmptyState isNewUser={true} />);

      expect(screen.getByText('Welcome to Sesari!')).toBeInTheDocument();
    });

    it('should render onboarding text for new users', () => {
      render(<EmptyState isNewUser={true} />);

      expect(
        screen.getByText(/Connect your first integration to start receiving daily briefings/)
      ).toBeInTheDocument();
    });

    it('should render Connect Integration button for new users', () => {
      render(<EmptyState isNewUser={true} />);

      const button = screen.getByRole('button', { name: 'Connect Integration' });
      expect(button).toBeInTheDocument();
    });

    it('should navigate to integrations page when button clicked', () => {
      render(<EmptyState isNewUser={true} />);

      const button = screen.getByRole('button', { name: 'Connect Integration' });
      fireEvent.click(button);

      expect(mockPush).toHaveBeenCalledWith('/integrations');
    });

    it('should have proper styling for Connect Integration button', () => {
      render(<EmptyState isNewUser={true} />);

      const button = screen.getByRole('button', { name: 'Connect Integration' });
      expect(button.className).toContain('bg-growth');
      expect(button.className).toContain('text-white');
    });
  });

  describe('Quiet Day State', () => {
    it('should render quiet day message by default', () => {
      render(<EmptyState />);

      expect(screen.getByText('All quiet today')).toBeInTheDocument();
    });

    it('should render quiet day message when isNewUser is false', () => {
      render(<EmptyState isNewUser={false} />);

      expect(screen.getByText('All quiet today')).toBeInTheDocument();
    });

    it('should render explanation text for quiet day', () => {
      render(<EmptyState />);

      expect(
        screen.getByText(/No new signals detected/)
      ).toBeInTheDocument();
    });

    it('should NOT render Connect Integration button for quiet day', () => {
      render(<EmptyState />);

      const button = screen.queryByRole('button', { name: 'Connect Integration' });
      expect(button).not.toBeInTheDocument();
    });
  });

  describe('Layout and Styling', () => {
    it('should center content vertically and horizontally', () => {
      const { container } = render(<EmptyState />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('min-h-screen');
      expect(wrapper.className).toContain('flex');
      expect(wrapper.className).toContain('items-center');
      expect(wrapper.className).toContain('justify-center');
    });

    it('should use background color from theme', () => {
      const { container } = render(<EmptyState />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('bg-background');
    });

    it('should have proper text styling', () => {
      render(<EmptyState />);

      const heading = screen.getByText('All quiet today');
      expect(heading.className).toContain('text-2xl');
      expect(heading.className).toContain('font-bold');
      expect(heading.className).toContain('text-primary');
    });

    it('should have muted text for description', () => {
      render(<EmptyState />);

      const description = screen.getByText(/No new signals detected/);
      expect(description.className).toContain('text-muted');
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      render(<EmptyState />);

      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toBeInTheDocument();
      expect(heading.textContent).toBe('All quiet today');
    });

    it('should have proper heading for new user state', () => {
      render(<EmptyState isNewUser={true} />);

      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading.textContent).toBe('Welcome to Sesari!');
    });

    it('should have accessible button', () => {
      render(<EmptyState isNewUser={true} />);

      const button = screen.getByRole('button', { name: 'Connect Integration' });
      expect(button).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined isNewUser prop', () => {
      render(<EmptyState isNewUser={undefined} />);

      expect(screen.getByText('All quiet today')).toBeInTheDocument();
    });

    it('should not crash when router push fails', () => {
      mockPush.mockImplementation(() => {
        throw new Error('Navigation failed');
      });

      render(<EmptyState isNewUser={true} />);

      const button = screen.getByRole('button', { name: 'Connect Integration' });
      
      expect(() => fireEvent.click(button)).toThrow();
    });
  });
});
