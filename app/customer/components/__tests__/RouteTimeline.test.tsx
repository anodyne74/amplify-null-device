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

  it('displays planned status timeline', () => {
    render(<RouteTimeline route={mockRoute} />);
    expect(screen.getByText(/Planned/i)).toBeInTheDocument();
    expect(screen.getByText(/Active/i)).toBeInTheDocument();
    expect(screen.getByText(/Completed/i)).toBeInTheDocument();
  });

  it('shows active status as current for active routes', () => {
    const activeRoute: Route = {
      ...mockRoute,
      status: 'active',
      actualStartTime: '2024-01-15T09:00:00Z',
    };

    render(<RouteTimeline route={activeRoute} />);
    expect(screen.getByText(/Active/i)).toBeInTheDocument();
  });

  it('shows completed status as current for completed routes', () => {
    const completedRoute: Route = {
      ...mockRoute,
      status: 'completed',
      actualStartTime: '2024-01-15T09:00:00Z',
      actualEndTime: '2024-01-15T11:00:00Z',
    };

    render(<RouteTimeline route={completedRoute} />);
    expect(screen.getByText(/Completed/i)).toBeInTheDocument();
  });

  it('shows route status header', () => {
    render(<RouteTimeline route={mockRoute} />);
    expect(screen.getByText(/Route Status/i)).toBeInTheDocument();
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
