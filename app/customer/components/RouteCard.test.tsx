import { render, screen } from '@testing-library/react';
import RouteCard from './RouteCard';
import type { Route } from '@/amplify/types';

describe('RouteCard', () => {
  it('links to the route detail page', () => {
    render(
      <RouteCard
        route={{ id: 'route-1', routeCode: 'RT-2044', status: 'planned', createdAt: '2026-08-20T00:00:00Z' } as Route}
      />
    );

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/customer/routes/route-1');
  });

  it('shows the route code when set', () => {
    render(<RouteCard route={{ id: 'route-1', routeCode: 'RT-2044', status: 'planned' } as Route} />);
    expect(screen.getByText('RT-2044')).toBeInTheDocument();
  });

  it('falls back to a truncated id when there is no route code', () => {
    render(<RouteCard route={{ id: 'route-abcdefgh12345', status: 'planned' } as Route} />);
    expect(screen.getByText('route-ab...')).toBeInTheDocument();
  });

  it('shows the stop count', () => {
    render(<RouteCard route={{ id: 'route-1', status: 'planned', stops: [{}, {}, {}] } as unknown as Route} />);
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });

  it('shows N/A duration for a route that has not been finalised yet', () => {
    render(
      <RouteCard route={{ id: 'route-1', status: 'in_progress', actualDurationMinutes: 90 } as Route} />
    );
    expect(screen.getByText(/duration:/i).parentElement).toHaveTextContent('Duration: N/A');
  });

  it('shows the actual duration once the route is completed', () => {
    render(<RouteCard route={{ id: 'route-1', status: 'completed', actualDurationMinutes: 130 } as Route} />);
    expect(screen.getByText(/duration:/i).parentElement).toHaveTextContent('Duration: 2h 10m');
  });
});
