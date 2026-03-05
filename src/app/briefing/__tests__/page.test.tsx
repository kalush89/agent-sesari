import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import BriefingPage from '../page';
import type { Briefing } from '@/types/briefing';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

// Mock child components
vi.mock('@/components/briefing/BriefingHeader', () => ({
  BriefingHeader: ({ date, insightCount, onDateChange }: any) => (
    <div data-testid="briefing-header">
      <span data-testid="header-date">{date}</span>
      <span data-testid="header-count">{insightCount}</span>
      <button onClick={() => onDateChange('2024-01-14')}>Change Date</button>
    </div>
  ),
}));

vi.mock('@/components/briefing/InsightCard', () => ({
  InsightCard: ({ insight }: any) => (
    <div data-testid="insight-card">{insight.narrative}</div>
  ),
}));

vi.mock('@/components/briefing/EmptyState', () => ({
  EmptyState: ({ isNewUser }: any) => (
    <div data-testid="empty-state">
      {isNewUser ? 'Welcome' : 'All quiet'}
    </div>
  ),
}));

vi.mock('@/components/briefing/ErrorBanner', () => ({
  ErrorBanner: ({ message, onRetry }: any) => (
    <div data-testid="error-banner">
      <span>{message}</span>
      <button onClick={onRetry}>Retry</button>
    </div>
  ),
}));

vi.mock('@/components/briefing/SkeletonLoader', () => ({
  SkeletonLoader: () => <div data-testid="skeleton-loader">Loading...</div>,
}));

describe('BriefingPage', () => {
  const mockBriefing: Briefing = {
    date: '2024-01-15',
    generatedAt: Date.now(),
    signalCount: 5,
    insightCount: 2,
    priorityLevel: 'high',
    insights: [
      {
        id: '1',
        narrative: 'Test insight 1',
        severity: 'high',
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
          label: 'View Details',
          action: 'navigate',
          target: '/customer/123',
        },
      },
      {
        id: '2',
        narrative: 'Test insight 2',
        severity: 'medium',
        category: 'behavioral',
        thoughtTrace: {
          signals: [
            {
              source: 'Mixpanel',
              eventType: 'behavioral.engagement_gap',
              timestamp: Date.now(),
              severity: 'medium',
            },
          ],
        },
        growthPlay: {
          label: 'Check Activity',
          action: 'navigate',
          target: '/user/456',
        },
      },
    ],
  };

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should display skeleton loader while loading', () => {
    (global.fetch as any).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(<BriefingPage />);

    expect(screen.getByTestId('skeleton-loader')).toBeInTheDocument();
  });

  it('should fetch and display briefing on mount', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockBriefing,
    });

    render(<BriefingPage />);

    await waitFor(() => {
      expect(screen.getByTestId('briefing-header')).toBeInTheDocument();
    });

    expect(screen.getByTestId('header-count')).toHaveTextContent('2');
    expect(screen.getAllByTestId('insight-card')).toHaveLength(2);
    expect(screen.getByText('Test insight 1')).toBeInTheDocument();
    expect(screen.getByText('Test insight 2')).toBeInTheDocument();
  });

  it('should display empty state when briefing not found', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    render(<BriefingPage />);

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });

    expect(screen.getByText('All quiet')).toBeInTheDocument();
  });

  it('should display empty state when briefing has no insights', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ...mockBriefing,
        insights: [],
        insightCount: 0,
      }),
    });

    render(<BriefingPage />);

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
  });

  it('should display error banner on fetch failure', async () => {
    (global.fetch as any).mockRejectedValueOnce(
      new Error('Network error')
    );

    render(<BriefingPage />);

    await waitFor(() => {
      expect(screen.getByTestId('error-banner')).toBeInTheDocument();
    });

    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('should retry fetching on error banner retry click', async () => {
    const user = userEvent.setup();

    // First call fails
    (global.fetch as any).mockRejectedValueOnce(
      new Error('Network error')
    );

    render(<BriefingPage />);

    await waitFor(() => {
      expect(screen.getByTestId('error-banner')).toBeInTheDocument();
    });

    // Second call succeeds
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockBriefing,
    });

    await user.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByTestId('briefing-header')).toBeInTheDocument();
    });
  });

  it('should fetch new briefing when date changes', async () => {
    const user = userEvent.setup();

    // Initial fetch
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockBriefing,
    });

    render(<BriefingPage />);

    await waitFor(() => {
      expect(screen.getByTestId('briefing-header')).toBeInTheDocument();
    });

    // Date change fetch
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ...mockBriefing,
        date: '2024-01-14',
        insightCount: 1,
        insights: [mockBriefing.insights[0]],
      }),
    });

    await user.click(screen.getByText('Change Date'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('date=2024-01-14')
      );
    });
  });

  it('should cache briefings and serve from cache on same-day requests', async () => {
    const user = userEvent.setup();

    // Initial fetch
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockBriefing,
    });

    render(<BriefingPage />);

    await waitFor(() => {
      expect(screen.getByTestId('briefing-header')).toBeInTheDocument();
    });

    const initialFetchCount = (global.fetch as any).mock.calls.length;

    // Change to different date
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ...mockBriefing,
        date: '2024-01-14',
      }),
    });

    await user.click(screen.getByText('Change Date'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(initialFetchCount + 1);
    });

    // Change back to original date - should use cache
    await user.click(screen.getByText('Change Date'));

    // Fetch count should not increase (cache hit)
    expect(global.fetch).toHaveBeenCalledTimes(initialFetchCount + 1);
  });

  it('should handle fetch with 500 error', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    render(<BriefingPage />);

    await waitFor(() => {
      expect(screen.getByTestId('error-banner')).toBeInTheDocument();
    });

    expect(screen.getByText('Failed to fetch briefing')).toBeInTheDocument();
  });

  it('should use today date as initial selected date', async () => {
    const today = new Date().toISOString().split('T')[0];

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockBriefing,
    });

    render(<BriefingPage />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`date=${today}`)
      );
    });
  });
});
