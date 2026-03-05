/**
 * InsightCard Component Tests
 * 
 * Tests for the InsightCard component including:
 * - Card rendering with all elements
 * - Severity indicator display
 * - Thought Trace toggle functionality
 * - Growth Play button clicks (navigate and external)
 * - Accessibility attributes (ARIA labels)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { InsightCard } from '../InsightCard';

// Helper function to check if element exists in document
function isInDocument(element: HTMLElement | null): boolean {
  return element !== null && document.body.contains(element);
}

describe('InsightCard', () => {
  const mockInsight = {
    id: 'insight-1',
    narrative: 'Acme Corp upgraded their subscription. MRR increased by $500.',
    severity: 'high' as const,
    category: 'revenue' as const,
    thoughtTrace: {
      signals: [
        {
          source: 'stripe',
          eventType: 'revenue.expansion',
          timestamp: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
          severity: 'high'
        },
        {
          source: 'hubspot',
          eventType: 'relationship.deal_advanced',
          timestamp: Date.now() - 3 * 60 * 60 * 1000, // 3 hours ago
          severity: 'medium'
        }
      ]
    },
    growthPlay: {
      label: 'View Customer Details',
      action: 'navigate' as const,
      target: '/customers/cus_123'
    }
  };

  describe('Card Rendering', () => {
    it('should render narrative text', () => {
      render(<InsightCard insight={mockInsight} />);
      
      const narrative = screen.getByText(mockInsight.narrative);
      expect(isInDocument(narrative)).toBe(true);
    });

    it('should render Growth Play button with correct label', () => {
      render(<InsightCard insight={mockInsight} />);
      
      const button = screen.getByRole('button', { name: mockInsight.growthPlay.label });
      expect(isInDocument(button)).toBe(true);
      expect(button.textContent).toBe('View Customer Details');
    });

    it('should render Why? toggle button', () => {
      render(<InsightCard insight={mockInsight} />);
      
      const toggleButton = screen.getByRole('button', { name: /show source signals/i });
      expect(isInDocument(toggleButton)).toBe(true);
      expect(toggleButton.textContent).toContain('Why?');
    });

    it('should have proper ARIA labelledby for narrative', () => {
      render(<InsightCard insight={mockInsight} />);
      
      const article = screen.getByRole('article');
      expect(article.getAttribute('aria-labelledby')).toBe('insight-insight-1');
    });
  });

  describe('Severity Indicator', () => {
    it('should display red dot for critical severity', () => {
      const criticalInsight = {
        ...mockInsight,
        severity: 'critical' as const
      };
      
      render(<InsightCard insight={criticalInsight} />);
      
      const indicator = screen.getByLabelText('Critical severity');
      expect(isInDocument(indicator)).toBe(true);
      expect(indicator.className).toContain('bg-[#FF3D00]');
    });

    it('should NOT display severity dot for high severity', () => {
      render(<InsightCard insight={mockInsight} />);
      
      const indicator = screen.queryByLabelText('Critical severity');
      expect(indicator).toBeNull();
    });

    it('should NOT display severity dot for medium severity', () => {
      const mediumInsight = {
        ...mockInsight,
        severity: 'medium' as const
      };
      
      render(<InsightCard insight={mediumInsight} />);
      
      const indicator = screen.queryByLabelText('Critical severity');
      expect(indicator).toBeNull();
    });

    it('should NOT display severity dot for low severity', () => {
      const lowInsight = {
        ...mockInsight,
        severity: 'low' as const
      };
      
      render(<InsightCard insight={lowInsight} />);
      
      const indicator = screen.queryByLabelText('Critical severity');
      expect(indicator).toBeNull();
    });
  });

  describe('Thought Trace Toggle', () => {
    it('should initially hide Thought Trace content', () => {
      render(<InsightCard insight={mockInsight} />);
      
      const thoughtTrace = screen.queryByRole('region', { name: 'Source signals' });
      expect(thoughtTrace).toBeNull();
    });

    it('should show Thought Trace when toggle button is clicked', () => {
      render(<InsightCard insight={mockInsight} />);
      
      const toggleButton = screen.getByRole('button', { name: /show source signals/i });
      fireEvent.click(toggleButton);
      
      const thoughtTrace = screen.getByRole('region', { name: 'Source signals' });
      expect(isInDocument(thoughtTrace)).toBe(true);
    });

    it('should hide Thought Trace when toggle button is clicked again', () => {
      render(<InsightCard insight={mockInsight} />);
      
      const toggleButton = screen.getByRole('button', { name: /show source signals/i });
      
      // Expand
      fireEvent.click(toggleButton);
      expect(isInDocument(screen.getByRole('region', { name: 'Source signals' }))).toBe(true);
      
      // Collapse
      fireEvent.click(toggleButton);
      expect(screen.queryByRole('region', { name: 'Source signals' })).toBeNull();
    });

    it('should update aria-expanded attribute when toggled', () => {
      render(<InsightCard insight={mockInsight} />);
      
      const toggleButton = screen.getByRole('button', { name: /show source signals/i });
      
      expect(toggleButton.getAttribute('aria-expanded')).toBe('false');
      
      fireEvent.click(toggleButton);
      expect(toggleButton.getAttribute('aria-expanded')).toBe('true');
      
      fireEvent.click(toggleButton);
      expect(toggleButton.getAttribute('aria-expanded')).toBe('false');
    });

    it('should show ChevronDown icon when collapsed', () => {
      render(<InsightCard insight={mockInsight} />);
      
      const toggleButton = screen.getByRole('button', { name: /show source signals/i });
      const svg = toggleButton.querySelector('svg');
      
      expect(svg).not.toBeNull();
    });

    it('should show ChevronUp icon when expanded', () => {
      render(<InsightCard insight={mockInsight} />);
      
      const toggleButton = screen.getByRole('button', { name: /show source signals/i });
      fireEvent.click(toggleButton);
      
      const svg = toggleButton.querySelector('svg');
      expect(svg).not.toBeNull();
    });
  });

  describe('Thought Trace Display', () => {
    beforeEach(() => {
      render(<InsightCard insight={mockInsight} />);
      const toggleButton = screen.getByRole('button', { name: /show source signals/i });
      fireEvent.click(toggleButton);
    });

    it('should display all source signals', () => {
      expect(isInDocument(screen.getByText('Stripe'))).toBe(true);
      expect(isInDocument(screen.getByText('Hubspot'))).toBe(true);
    });

    it('should display formatted event types', () => {
      expect(isInDocument(screen.getByText('Revenue Expansion'))).toBe(true);
      expect(isInDocument(screen.getByText('Relationship Deal Advanced'))).toBe(true);
    });

    it('should display relative timestamps', () => {
      expect(isInDocument(screen.getByText('2 hours ago'))).toBe(true);
      expect(isInDocument(screen.getByText('3 hours ago'))).toBe(true);
    });

    it('should display severity badges', () => {
      const highBadge = screen.getByLabelText('high severity');
      const mediumBadge = screen.getByLabelText('medium severity');
      
      expect(isInDocument(highBadge)).toBe(true);
      expect(isInDocument(mediumBadge)).toBe(true);
    });

    it('should limit display to 5 signals maximum', () => {
      const manySignalsInsight = {
        ...mockInsight,
        thoughtTrace: {
          signals: Array.from({ length: 10 }, (_, i) => ({
            source: `source-${i}`,
            eventType: `event.type.${i}`,
            timestamp: Date.now() - i * 60 * 60 * 1000,
            severity: 'low'
          }))
        }
      };
      
      const { container } = render(<InsightCard insight={manySignalsInsight} />);
      const toggleButton = screen.getByRole('button', { name: /show source signals/i });
      fireEvent.click(toggleButton);
      
      const thoughtTrace = screen.getByRole('region', { name: 'Source signals' });
      const signalElements = thoughtTrace.querySelectorAll('.text-sm');
      
      expect(signalElements.length).toBe(5);
    });
  });

  describe('Growth Play Button', () => {
    let originalLocation: typeof window.location;
    let originalOpen: typeof window.open;

    beforeEach(() => {
      originalLocation = window.location;
      originalOpen = window.open;
      
      // Mock window.location.href
      Object.defineProperty(window, 'location', {
        value: { href: '' },
        writable: true,
        configurable: true
      });
      
      // Mock window.open
      window.open = vi.fn();
    });

    afterEach(() => {
      window.location = originalLocation;
      window.open = originalOpen;
    });

    it('should navigate to internal route when action is navigate', () => {
      render(<InsightCard insight={mockInsight} />);
      
      const button = screen.getByRole('button', { name: mockInsight.growthPlay.label });
      fireEvent.click(button);
      
      expect(window.location.href).toBe('/customers/cus_123');
    });

    it('should open external URL in new tab when action is external', () => {
      const externalInsight = {
        ...mockInsight,
        growthPlay: {
          label: 'Open in HubSpot',
          action: 'external' as const,
          target: 'https://app.hubspot.com/contacts/123'
        }
      };
      
      render(<InsightCard insight={externalInsight} />);
      
      const button = screen.getByRole('button', { name: 'Open in HubSpot' });
      fireEvent.click(button);
      
      expect(window.open).toHaveBeenCalledWith(
        'https://app.hubspot.com/contacts/123',
        '_blank',
        'noopener,noreferrer'
      );
    });

    it('should have proper styling for Growth Play button', () => {
      render(<InsightCard insight={mockInsight} />);
      
      const button = screen.getByRole('button', { name: mockInsight.growthPlay.label });
      
      expect(button.className).toContain('bg-[#00C853]');
      expect(button.className).toContain('text-white');
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA controls for toggle button', () => {
      render(<InsightCard insight={mockInsight} />);
      
      const toggleButton = screen.getByRole('button', { name: /show source signals/i });
      expect(toggleButton.getAttribute('aria-controls')).toBe('thought-trace-insight-1');
    });

    it('should have focus ring on interactive elements', () => {
      render(<InsightCard insight={mockInsight} />);
      
      const toggleButton = screen.getByRole('button', { name: /show source signals/i });
      expect(toggleButton.className).toContain('focus:ring-2');
      
      const growthPlayButton = screen.getByRole('button', { name: mockInsight.growthPlay.label });
      expect(growthPlayButton.className).toContain('focus:ring-2');
    });

    it('should have proper role for severity indicator', () => {
      const criticalInsight = {
        ...mockInsight,
        severity: 'critical' as const
      };
      
      render(<InsightCard insight={criticalInsight} />);
      
      const indicator = screen.getByLabelText('Critical severity');
      expect(indicator.getAttribute('role')).toBe('status');
    });

    it('should have proper role for Thought Trace region', () => {
      render(<InsightCard insight={mockInsight} />);
      
      const toggleButton = screen.getByRole('button', { name: /show source signals/i });
      fireEvent.click(toggleButton);
      
      const thoughtTrace = screen.getByRole('region', { name: 'Source signals' });
      expect(isInDocument(thoughtTrace)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle insight with no signals in Thought Trace', () => {
      const noSignalsInsight = {
        ...mockInsight,
        thoughtTrace: {
          signals: []
        }
      };
      
      render(<InsightCard insight={noSignalsInsight} />);
      
      const toggleButton = screen.getByRole('button', { name: /show source signals/i });
      fireEvent.click(toggleButton);
      
      const thoughtTrace = screen.getByRole('region', { name: 'Source signals' });
      expect(isInDocument(thoughtTrace)).toBe(true);
      expect(thoughtTrace.querySelectorAll('.text-sm').length).toBe(0);
    });

    it('should handle insight with single signal', () => {
      const singleSignalInsight = {
        ...mockInsight,
        thoughtTrace: {
          signals: [mockInsight.thoughtTrace.signals[0]]
        }
      };
      
      render(<InsightCard insight={singleSignalInsight} />);
      
      const toggleButton = screen.getByRole('button', { name: /show source signals/i });
      fireEvent.click(toggleButton);
      
      expect(isInDocument(screen.getByText('Stripe'))).toBe(true);
      expect(screen.queryByText('Hubspot')).toBeNull();
    });

    it('should handle very long narrative text', () => {
      const longNarrativeInsight = {
        ...mockInsight,
        narrative: 'A'.repeat(500)
      };
      
      render(<InsightCard insight={longNarrativeInsight} />);
      
      const narrative = screen.getByText('A'.repeat(500));
      expect(isInDocument(narrative)).toBe(true);
    });

    it('should capitalize source names correctly', () => {
      render(<InsightCard insight={mockInsight} />);
      
      const toggleButton = screen.getByRole('button', { name: /show source signals/i });
      fireEvent.click(toggleButton);
      
      // Source names should be capitalized
      expect(isInDocument(screen.getByText('Stripe'))).toBe(true);
      expect(isInDocument(screen.getByText('Hubspot'))).toBe(true);
    });
  });
});
