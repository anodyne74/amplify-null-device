import { render, screen } from '@testing-library/react';
import RouteListItem from '../RouteListItem';
import type { Route } from '@/amplify/types';

describe('RouteListItem', () => {
  const mockRoute: Route = {
    id: 'route-1',
    customerId: 'customer-1',
    status: 'signs_placed',
    estimatedDurationMinutes: 120,
    createdAt: '2024-01-15T10:00:00Z',
  };

  it('renders route data correctly', () => {
    render(
      <RouteListItem route={mockRoute} />
    );

    expect(screen.getByText(/route-1/i)).toBeInTheDocument();
  });

  it('displays status label', () => {
    render(
      <RouteListItem route={mockRoute} />
    );

    expect(screen.getByText(/Signs placed|Planned|Completed|Archived/i)).toBeInTheDocument();
  });

  it('handles routes with no duration', () => {
    const { container } = render(
      <RouteListItem route={{ ...mockRoute, estimatedDurationMinutes: undefined }} />
    );

    expect(container).toBeInTheDocument();
  });
});
