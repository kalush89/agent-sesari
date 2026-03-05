import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { InsightCard } from '../InsightCard';
import { BriefingHeader } from '../BriefingHeader';
import type { Insight } from '@/types/briefing';

describe('Accessibility Tests', () => {
  const mockInsight: Insight = {
    id: 'test-1',
    narrative: 'Test narrative for accessibility',
    severity: 'critical',
    category: 'revenue',
    thoughtTrace: {
      signals: [
        {
          source: 'Stripe',
          eventType: 'revenue.expansion',
          timestamp: Date.now(),
          severity: 'high',
        },
      ],
    },
    growthPlay: {
      label: 'View Customer',
      action: 'navigate',
      target: '/customer/123',
    },
  };

  describe('InsightCard Accessibility', () => {
    it('should have proper ARIA labels for interactive elements', () => {
      render(<InsightCard insight={mockInsight} />);

      const toggleButton = screen.getByRole('button', { name: /show source signals/i });
      expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
      expect(toggleButton).toHaveAttribute('aria-controls', 'thought-trace-test-1');
    });

    it('should update aria-expanded when Thought Trace is toggled', async () => {
      const user = userEvent.setup();
      render(<InsightCard insight={mockInsight} />);

      const toggleButton = screen.getByRole('button', { name: /show source signals/i });
      expect(toggleButton).toHaveAttribute('aria-expanded', 'false');

      await user.click(toggleButton);

      expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('button', { name: /hide source signals/i })).toBeInTheDocument();
    });

    it('should have proper role and aria-label for severity indicator', () => {
      render(<InsightCard insight={mockInsight} />);

      const severityIndicator = screen.getByRole('status', { name: /critical severity/i });
      expect(severityIndicator).toBeInTheDocument();
    });

    it('should have aria-labelledby for article', () => {
      const { container } = render(<InsightCard insight={mockInsight} />);

      const article = container.querySelector('article');
      expect(article).toHaveAttribute('aria-labelledby', 'insight-test-1');
    });

    it('should have proper aria-label for Growth Play button', () => {
      render(<InsightCard insight={mockInsight} />);

      const growthPlayButton = screen.getByRole('button', { name: 'View Customer' });
      expect(growthPlayButton).toBeInTheDocument();
    });

    it('should have region role for Thought Trace', async () => {
      const user = userEvent.setup();
      render(<InsightCard insight={mockInsight} />);

      const toggleButton = screen.getByRole('button', { name: /show source signals/i });
      await user.click(toggleButton);

      const thoughtTrace = screen.getByRole('region', { name: /source signals/i });
      expect(thoughtTrace).toBeInTheDocument();
    });

    it('should have status role for severity badges', async () => {
      const user = userEvent.setup();
      render(<InsightCard insight={mockInsight} />);

      const toggleButton = screen.getByRole('button', { name: /show source signals/i });
      await user.click(toggleButton);

      const severityBadge = screen.getByRole('status', { name: /high severity/i });
      expect(severityBadge).toBeInTheDocument();
    });
  });

  describe('BriefingHeader Accessibility', () => {
    const mockOnDateChange = () => {};

    it('should have proper aria-labels for navigation buttons', () => {
      render(
        <BriefingHeader
          date="2024-01-15"
          insightCount={5}
          onDateChange={mockOnDateChange}
        />
      );

      expect(screen.getByRole('button', { name: /previous day/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /next day/i })).toBeInTheDocument();
    });

    it('should have aria-label for date picker', () => {
      render(
        <BriefingHeader
          date="2024-01-15"
          insightCount={5}
          onDateChange={mockOnDateChange}
        />
      );

      const datePicker = screen.getByLabelText(/select date/i);
      expect(datePicker).toBeInTheDocument();
    });

    it('should disable Next button when date is today', () => {
      const today = new Date().toISOString().split('T')[0];

      render(
        <BriefingHeader
          date={today}
          insightCount={5}
          onDateChange={mockOnDateChange}
        />
      );

      const nextButton = screen.getByRole('button', { name: /next day/i });
      expect(nextButton).toBeDisabled();
    });
  });

  describe('Keyboard Navigation', () => {
    it('should support Tab navigation through interactive elements', async () => {
      const user = userEvent.setup();
      render(<InsightCard insight={mockInsight} />);

      // Tab to Thought Trace toggle
      await user.tab();
      expect(screen.getByRole('button', { name: /show source signals/i })).toHaveFocus();

      // Tab to Growth Play button
      await user.tab();
      expect(screen.getByRole('button', { name: 'View Customer' })).toHaveFocus();
    });

    it('should activate buttons with Enter key', async () => {
      const user = userEvent.setup();
      render(<InsightCard insight={mockInsight} />);

      const toggleButton = screen.getByRole('button', { name: /show source signals/i });
      toggleButton.focus();

      await user.keyboard('{Enter}');

      expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
    });

    it('should activate buttons with Space key', async () => {
      const user = userEvent.setup();
      render(<InsightCard insight={mockInsight} />);

      const toggleButton = screen.getByRole('button', { name: /show source signals/i });
      toggleButton.focus();

      await user.keyboard(' ');

      expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
    });
  });

  describe('Focus Indicators', () => {
    it('should have focus ring on Thought Trace toggle', () => {
      render(<InsightCard insight={mockInsight} />);

      const toggleButton = screen.getByRole('button', { name: /show source signals/i });
      expect(toggleButton).toHaveClass('focus:outline-none', 'focus:ring-2');
    });

    it('should have focus ring on Growth Play button', () => {
      render(<InsightCard insight={mockInsight} />);

      const growthPlayButton = screen.getByRole('button', { name: 'View Customer' });
      expect(growthPlayButton).toHaveClass('focus:outline-none', 'focus:ring-2');
    });
  });

  describe('Color Contrast', () => {
    it('should use high contrast colors for Growth Play button', () => {
      render(<InsightCard insight={mockInsight} />);

      const growthPlayButton = screen.getByRole('button', { name: 'View Customer' });
      
      // Check for emerald green background (#00C853) with white text
      expect(growthPlayButton).toHaveClass('bg-[#00C853]', 'text-white');
    });

    it('should use high contrast for primary text', () => {
      const { container } = render(<InsightCard insight={mockInsight} />);

      const narrative = container.querySelector('p');
      
      // Check for deep charcoal text (#1A1A1A)
      expect(narrative).toHaveClass('text-[#1A1A1A]');
    });
  });

  describe('Screen Reader Announcements', () => {
    it('should announce insight count in header', () => {
      render(
        <BriefingHeader
          date="2024-01-15"
          insightCount={5}
          onDateChange={() => {}}
        />
      );

      expect(screen.getByText('5 insights')).toBeInTheDocument();
    });

    it('should announce singular insight count', () => {
      render(
        <BriefingHeader
          date="2024-01-15"
          insightCount={1}
          onDateChange={() => {}}
        />
      );

      expect(screen.getByText('1 insight')).toBeInTheDocument();
    });

    it('should have descriptive labels for all buttons', () => {
      render(<InsightCard insight={mockInsight} />);

      // All buttons should have accessible names
      expect(screen.getByRole('button', { name: /show source signals/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'View Customer' })).toBeInTheDocument();
    });
  });
});
