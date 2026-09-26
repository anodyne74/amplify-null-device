import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import OperatorDashboard from '../page';
import { useLiveAllRoutes } from '@/lib/useLiveRoutes';
import { listAllCustomers } from '@/lib/queries/ListAllCustomers';
import type { Route } from '@/amplify/types';
import { getRouteWithStops } from '@/lib/routes';

jest.mock('@/lib/use-user-groups', () => ({
  useCurrentUserId: () => 'operator-me',
}));

jest.mock('@/lib/useLiveRoutes', () => ({
  useLiveAllRoutes: jest.fn(),
}));

jest.mock('@/lib/queries/ListAllCustomers', () => ({
  listAllCustomers: jest.fn(),
}));

jest.mock('@/lib/routes', () => ({
  getRouteWithStops: jest.fn(),
}));

function baseRoute(overrides: Partial<Route>): Route {
  return {
    id: 'route-1',
    routeCode: 'W25-08-100',
    customerId: 'cust-1',
    status: 'in_progress',
    executionPhase: 'placement',
    ...overrides,
  } as Route;
}

describe('Operator Dashboard (Today)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listAllCustomers as jest.Mock).mockResolvedValue({ data: [{ id: 'cust-1', name: 'Beltline Group' }], errors: undefined });
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: null, stops: [], errors: [] });
  });

  it('shows unassigned routes and routes assigned to the signed-in operator, but excludes routes assigned to other operators', async () => {
    (useLiveAllRoutes as jest.Mock).mockReturnValue({
      routes: [
        baseRoute({ id: 'route-unassigned', routeCode: 'W25-08-101' }),
        baseRoute({ id: 'route-mine', routeCode: 'W25-08-102', assignedOperatorSub: 'operator-me' }),
        baseRoute({ id: 'route-other', routeCode: 'W25-08-103', assignedOperatorSub: 'operator-someone-else' }),
      ],
      loading: false,
      error: null,
    });

    render(<OperatorDashboard />);

    await waitFor(() => expect(screen.getByText('W25-08-101')).toBeInTheDocument());
    expect(screen.getByText('W25-08-102')).toBeInTheDocument();
    expect(screen.queryByText('W25-08-103')).not.toBeInTheDocument();
  });

  it('reflects a route newly assigned to the signed-in operator, pushed over useLiveAllRoutes without a manual reload', async () => {
    (useLiveAllRoutes as jest.Mock).mockReturnValue({
      routes: [baseRoute({ id: 'route-other', routeCode: 'W25-08-103', assignedOperatorSub: 'operator-someone-else' })],
      loading: false,
      error: null,
    });

    const { rerender } = render(<OperatorDashboard />);

    await waitFor(() => expect(screen.getByText(/no planned or active routes/i)).toBeInTheDocument());

    // Reassigned to the signed-in operator server-side — should appear
    // without a reload.
    (useLiveAllRoutes as jest.Mock).mockReturnValue({
      routes: [baseRoute({ id: 'route-other', routeCode: 'W25-08-103', assignedOperatorSub: 'operator-me' })],
      loading: false,
      error: null,
    });
    rerender(<OperatorDashboard />);

    await waitFor(() => expect(screen.getByText('W25-08-103')).toBeInTheDocument());
  });
});
