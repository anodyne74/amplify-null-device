import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import OperatorDashboard from '../page';
import { useLiveAllRoutes } from '@/lib/useLiveRoutes';
import type { Route } from '@/amplify/types';
import { getRouteWithStops } from '@/lib/routes';
import { listAllCustomers } from '@/lib/customers';
import { useMyPayouts } from '@/lib/useMyPayouts';

jest.mock('@/lib/use-user-groups', () => ({
  useCurrentUserId: () => 'operator-me',
}));

jest.mock('@/lib/useLiveRoutes', () => ({
  useLiveAllRoutes: jest.fn(),
}));

jest.mock('@/lib/customers', () => ({
  listAllCustomers: jest.fn(),
}));

jest.mock('@/lib/useMyPayouts', () => ({
  useMyPayouts: jest.fn(),
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
    (listAllCustomers as jest.Mock).mockResolvedValue([{ id: 'cust-1', name: 'Beltline Group' }]);
    (getRouteWithStops as jest.Mock).mockResolvedValue(null);
    (useMyPayouts as jest.Mock).mockReturnValue({ payouts: [], loading: false, error: null });
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

  describe('Outstanding payouts tile', () => {
    beforeEach(() => {
      (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: [], loading: false, error: null });
    });

    it('shows the total of pending payouts, linking to the payouts page', async () => {
      (useMyPayouts as jest.Mock).mockReturnValue({
        payouts: [
          { id: 'a', amount: 40.5, status: 'pending' },
          { id: 'b', amount: 10, status: 'pending' },
          { id: 'c', amount: 99, status: 'paid' },
        ],
        loading: false,
        error: null,
      });
      render(<OperatorDashboard />);

      const link = await screen.findByRole('link', { name: /outstanding/i });
      expect(link).toHaveAttribute('href', '/operator/payouts');
      expect(link).toHaveTextContent('$50.50');
    });

    it('shows $0.00 rather than hiding when nothing is owed', async () => {
      render(<OperatorDashboard />);
      expect(await screen.findByRole('link', { name: /outstanding/i })).toHaveTextContent('$0.00');
    });

    it('does not show a figure while payouts are loading', async () => {
      (useMyPayouts as jest.Mock).mockReturnValue({ payouts: [], loading: true, error: null });
      render(<OperatorDashboard />);
      expect(await screen.findByRole('link', { name: /outstanding/i })).not.toHaveTextContent('$0.00');
    });
  });
});
