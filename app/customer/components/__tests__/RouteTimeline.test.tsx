import { render, screen } from '@testing-library/react';
import RouteTimeline from '../RouteTimeline';
import type { Route } from '@/amplify/types';

describe('RouteTimeline', () => {
  const mockRoute: Route = {
    id: 'route-1',
    customerId: 'customer-1',
    status: 'planned',
    estimatedDurationMinutes: 120,
    createdAt: '2024-01-15T08:00:00Z',
  };

  it('displays all 6 named phases', () => {
    render(<RouteTimeline route={mockRoute} />);
    expect(screen.getByText(/^Planned$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Signs collected$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Signs placed$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Signs picked up$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Signs returned$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Route completed$/i)).toBeInTheDocument();
  });

  it('shows signs placed as the current phase mid-placement', () => {
    const activeRoute: Route = {
      ...mockRoute,
      status: 'in_progress',
      executionPhase: 'placement',
      actualStartTime: '2024-01-15T09:00:00Z',
      placementStartTime: '2024-01-15T09:00:00Z',
    };

    render(<RouteTimeline route={activeRoute} />);
    expect(screen.getByText(/^Signs placed$/i)).toHaveClass('stepLabelActive');
  });

  it('shows route completed as the current phase for completed routes', () => {
    const completedRoute: Route = {
      ...mockRoute,
      status: 'completed',
      actualStartTime: '2024-01-15T09:00:00Z',
      actualEndTime: '2024-01-15T11:00:00Z',
    };

    render(<RouteTimeline route={completedRoute} />);
    expect(screen.getByText(/^Route completed$/i)).toHaveClass('stepLabelActive');
  });

  it('handles routes with missing timestamps gracefully', () => {
    const routeNoTimes: Route = {
      ...mockRoute,
      actualStartTime: undefined,
      actualEndTime: undefined,
    };

    const { container } = render(<RouteTimeline route={routeNoTimes} />);
    expect(container).toBeInTheDocument();
  });
});
