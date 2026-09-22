import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import OperatorDashboard from '../page';
import { listAllRoutes } from '@/lib/queries/ListAllRoutes';
import { listAllCustomers } from '@/lib/queries/ListAllCustomers';
import { getRouteWithStops } from '@/lib/queries';
import type { Route } from '@/amplify/types';

jest.mock('@/lib/use-user-groups', () => ({
  useCurrentUserId: () => 'operator-me',
}));

jest.mock('@/lib/queries/ListAllRoutes', () => ({
  listAllRoutes: jest.fn(),
}));

jest.mock('@/lib/queries/ListAllCustomers', () => ({
  listAllCustomers: jest.fn(),
}));

jest.mock('@/lib/queries', () => ({
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
    (listAllRoutes as jest.Mock).mockResolvedValue({
      data: [
        baseRoute({ id: 'route-unassigned', routeCode: 'W25-08-101' }),
        baseRoute({ id: 'route-mine', routeCode: 'W25-08-102', assignedOperatorSub: 'operator-me' }),
        baseRoute({ id: 'route-other', routeCode: 'W25-08-103', assignedOperatorSub: 'operator-someone-else' }),
      ],
      errors: undefined,
    });

    render(<OperatorDashboard />);

    await waitFor(() => expect(screen.getByText('W25-08-101')).toBeInTheDocument());
    expect(screen.getByText('W25-08-102')).toBeInTheDocument();
    expect(screen.queryByText('W25-08-103')).not.toBeInTheDocument();
  });
});
