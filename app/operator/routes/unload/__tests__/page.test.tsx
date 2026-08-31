import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import OperatorUnloadPage from '../page';
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
    status: 'in_progress',
    drivingModeEnabled: true,
    executionPhase: 'unload',
    loadedSignsCount: 45,
    ...overrides,
  } as Route;
}

function baseStops(): Stop[] {
  return [
    {
      id: 's1',
      routeId: 'route-1',
      sequence: 1,
      numberOfSigns: 9,
      notes: '[PICKUP_DONE:2026-08-31T10:00:00.000Z]',
      missingSignsCount: 0,
    } as Stop,
    {
      id: 's2',
      routeId: 'route-1',
      sequence: 2,
      numberOfSigns: 13,
      notes: '[PICKUP_DONE:2026-08-31T10:05:00.000Z]',
      missingSignsCount: 2,
    } as Stop,
    {
      id: 's3',
      routeId: 'route-1',
      sequence: 3,
      numberOfSigns: 18,
      notes: '[PICKUP_SKIPPED:2026-08-31T10:10:00.000Z|Gate locked]',
      missingSignsCount: 0,
    } as Stop,
    { id: 's4', routeId: 'route-1', sequence: 4, numberOfSigns: 5, missingSignsCount: 0 } as Stop,
  ];
}

describe('Operator Unload page', () => {
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

  it('shows the reconciliation stats and against-the-load summary', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops(), errors: [] });

    render(<OperatorUnloadPage />);

    // s1 (9, done) + s2 (13, done) returned; s3 skipped; s4 never picked up.
    expect(await screen.findByText('22 signs to return')).toBeInTheDocument();
    expect(screen.getByText('Beltline Group')).toBeInTheDocument();
    expect(screen.getByText('22 Dryburgh St, West Melbourne')).toBeInTheDocument();
    expect(screen.getByText('22')).toBeInTheDocument();
    expect(screen.getByText('2 / 4')).toBeInTheDocument();
    expect(screen.getByText('1 stops')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    // 45 loaded · 22 returned · 2 missing · 21 still on site (45 - 22 - 2).
    expect(screen.getByText('45 loaded · 22 returned · 2 reported missing · 21 still on site.')).toBeInTheDocument();
  });

  it('confirms the unload and returns to Today', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops(), errors: [] });

    render(<OperatorUnloadPage />);
    await screen.findByText('22 signs to return');

    fireEvent.click(screen.getByRole('button', { name: /confirm 22 signs returned/i }));

    await waitFor(() => {
      expect(updateRouteExecution).toHaveBeenCalledWith(
        'route-1',
        expect.objectContaining({ unloadConfirmedAt: expect.any(String), actualEndTime: expect.any(String) })
      );
    });
    expect(push).toHaveBeenCalledWith('/operator/dashboard');
  });

  it('does not overwrite an already-recorded actualEndTime', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: baseRoute({ actualEndTime: '2026-08-31T09:00:00.000Z' }),
      stops: baseStops(),
      errors: [],
    });

    render(<OperatorUnloadPage />);
    await screen.findByText('22 signs to return');

    fireEvent.click(screen.getByRole('button', { name: /confirm 22 signs returned/i }));

    await waitFor(() => {
      expect(updateRouteExecution).toHaveBeenCalledWith(
        'route-1',
        expect.objectContaining({ actualEndTime: '2026-08-31T09:00:00.000Z' })
      );
    });
  });

  it('shows a guard message when the route is not on the Unload phase', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: baseRoute({ executionPhase: 'pickup' }),
      stops: baseStops(),
      errors: [],
    });

    render(<OperatorUnloadPage />);

    expect(await screen.findByText(/not currently on the unload phase/i)).toBeInTheDocument();
    expect(updateRouteExecution).not.toHaveBeenCalled();
  });

  it('shows a guard message when the route is not found', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: null, stops: [], errors: [] });

    render(<OperatorUnloadPage />);

    expect(await screen.findByText(/route not found/i)).toBeInTheDocument();
  });

  it('shows a message when no route id is present', () => {
    searchParamId = null;
    render(<OperatorUnloadPage />);
    expect(screen.getByText(/no route selected/i)).toBeInTheDocument();
  });
});
