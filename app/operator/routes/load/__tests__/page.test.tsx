import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import OperatorLoadPage from '../page';
import { getRouteWithStops, getCustomer, updateRouteExecution } from '@/lib/queries';
import { getOrganizationSettings } from '@/lib/queries/OrganizationSettings';
import type { Route, Stop } from '@/amplify/types';

const push = jest.fn();
let searchParamId: string | null = 'route-1';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => ({ get: (key: string) => (key === 'id' ? searchParamId : null) }),
}));

jest.mock('@/lib/queries', () => ({
  getRouteWithStops: jest.fn(),
  getCustomer: jest.fn(),
  updateRouteExecution: jest.fn(),
}));

jest.mock('@/lib/queries/OrganizationSettings', () => ({
  getOrganizationSettings: jest.fn(),
}));

function baseRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: 'route-1',
    routeCode: 'W25-08-114',
    customerId: 'cust-1',
    status: 'planned',
    drivingModeEnabled: true,
    executionPhase: null,
    ...overrides,
  } as Route;
}

function baseStops(): Stop[] {
  return [
    { id: 's1', routeId: 'route-1', sequence: 1, agent: 'Rachel Morrow', numberOfSigns: 9, isAuction: true } as Stop,
    { id: 's2', routeId: 'route-1', sequence: 2, agent: 'Rachel Morrow', numberOfSigns: 13, isAuction: false } as Stop,
    { id: 's3', routeId: 'route-1', sequence: 3, agent: 'Jem Tran', numberOfSigns: 18, isAuction: false } as Stop,
    { id: 's4', routeId: 'route-1', sequence: 4, agent: undefined, numberOfSigns: 5, isAuction: false } as Stop,
  ];
}

describe('Operator Load page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchParamId = 'route-1';
    (getCustomer as jest.Mock).mockResolvedValue({ data: { name: 'Beltline Group' }, errors: undefined });
    (getOrganizationSettings as jest.Mock).mockResolvedValue({
      data: { address: '22 Dryburgh St, West Melbourne' },
      errors: undefined,
    });
    (updateRouteExecution as jest.Mock).mockResolvedValue({ data: { id: 'route-1' }, errors: undefined });
  });

  it('shows the per-agent breakdown, totals and yard address', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops(), errors: [] });

    render(<OperatorLoadPage />);

    expect(await screen.findByText('45 signs to load')).toBeInTheDocument();
    expect(screen.getByText('Beltline Group')).toBeInTheDocument();
    expect(screen.getByText('22 Dryburgh St, West Melbourne')).toBeInTheDocument();
    expect(screen.getByText('Rachel Morrow')).toBeInTheDocument();
    expect(screen.getByText('Jem Tran')).toBeInTheDocument();
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    expect(screen.getByText('45 signs')).toBeInTheDocument();
    expect(screen.getByText(/load not confirmed/i)).toBeInTheDocument();
  });

  it('confirms the load, advances the phase, and returns to Today', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops(), errors: [] });

    render(<OperatorLoadPage />);
    await screen.findByText('45 signs to load');

    fireEvent.click(screen.getByRole('button', { name: /confirm 45 signs loaded/i }));

    await waitFor(() => {
      expect(updateRouteExecution).toHaveBeenCalledWith(
        'route-1',
        expect.objectContaining({
          loadedSignsCount: 45,
          executionPhase: 'placement',
          status: 'in_progress',
        })
      );
    });
    expect(push).toHaveBeenCalledWith('/operator/dashboard');
  });

  it('routes to van count on "Count differs — recount"', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops(), errors: [] });

    render(<OperatorLoadPage />);
    await screen.findByText('45 signs to load');

    fireEvent.click(screen.getByRole('button', { name: /count differs/i }));
    expect(push).toHaveBeenCalledWith('/operator/van-count');
  });

  it('shows a guard message when the route is not on the Load phase', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: baseRoute({ status: 'in_progress', executionPhase: 'pickup' }),
      stops: baseStops(),
      errors: [],
    });

    render(<OperatorLoadPage />);

    expect(await screen.findByText(/not currently on the load phase/i)).toBeInTheDocument();
    expect(updateRouteExecution).not.toHaveBeenCalled();
  });

  it('shows a guard message when the route is not found', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: null, stops: [], errors: [] });

    render(<OperatorLoadPage />);

    expect(await screen.findByText(/route not found/i)).toBeInTheDocument();
  });

  it('shows a message when no route id is present', () => {
    searchParamId = null;
    render(<OperatorLoadPage />);
    expect(screen.getByText(/no route selected/i)).toBeInTheDocument();
  });
});
