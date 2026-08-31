import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import OperatorFinalisePage from '../page';
import { getRouteWithStops, updateRouteExecution } from '@/lib/queries';
import type { Route, Stop } from '@/amplify/types';

const push = jest.fn();
let searchParamId: string | null = 'route-1';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => ({ get: (key: string) => (key === 'id' ? searchParamId : null) }),
}));

jest.mock('@/lib/queries', () => ({
  getRouteWithStops: jest.fn(),
  updateRouteExecution: jest.fn(),
}));

function baseRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: 'route-1',
    routeCode: 'W25-08-114',
    customerId: 'cust-1',
    status: 'in_progress',
    drivingModeEnabled: true,
    executionPhase: 'unload',
    unloadConfirmedAt: '2026-08-31T09:10:00.000Z',
    actualStartTime: '2026-08-31T08:00:00.000Z',
    actualEndTime: '2026-08-31T09:10:00.000Z',
    loadConfirmedAt: '2026-08-31T08:00:00.000Z',
    placementStartTime: '2026-08-31T08:15:00.000Z',
    placementEndTime: '2026-08-31T08:37:00.000Z',
    pickupStartTime: '2026-08-31T08:40:00.000Z',
    pickupEndTime: '2026-08-31T08:52:00.000Z',
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
      notes: '[PICKUP_DONE:2026-08-31T08:45:00.000Z]',
      missingSignsCount: 0,
    } as Stop,
    {
      id: 's2',
      routeId: 'route-1',
      sequence: 2,
      numberOfSigns: 13,
      notes: '[PICKUP_DONE:2026-08-31T08:50:00.000Z]',
      missingSignsCount: 2,
    } as Stop,
    {
      id: 's3',
      routeId: 'route-1',
      sequence: 3,
      numberOfSigns: 18,
      notes: '[PICKUP_SKIPPED:2026-08-31T08:55:00.000Z|Gate locked]',
      missingSignsCount: 0,
    } as Stop,
  ];
}

describe('Operator Finalise page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchParamId = 'route-1';
    (updateRouteExecution as jest.Mock).mockResolvedValue({ data: { id: 'route-1' }, errors: undefined });
  });

  it('shows the summary stats, measured defaults, and a warning state when the total is off a 15 min increment', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops(), errors: [] });

    render(<OperatorFinalisePage />);

    expect(await screen.findByText('Finalise route')).toBeInTheDocument();
    // s1 (9, done) + s2 (13, done) returned; s3 skipped.
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.getByText('22')).toBeInTheDocument(); // signs collected
    expect(screen.getByText('2')).toBeInTheDocument(); // signs missing
    expect(screen.getByText('1h 10m')).toBeInTheDocument(); // duration

    // load: 0 measured -> floored at 15m. placement: 22min -> round5 -> 20m.
    // pickup: 12min -> round5 -> 10m. unload: 18min -> round5 -> 20m. Total 65m.
    expect(screen.getByText('15m')).toBeInTheDocument();
    expect(screen.getAllByText('20m')).toHaveLength(2);
    expect(screen.getByText('Total charged')).toBeInTheDocument();
    expect(screen.getByText('1h 5m')).toBeInTheDocument();
    expect(screen.getByText(/not a 15 min increment/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /round up to 1h 15m/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /complete route/i })).toBeDisabled();
  });

  it('rounding up brings the total to a 15 min increment and re-enables completion', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops(), errors: [] });

    render(<OperatorFinalisePage />);
    await screen.findByText('Finalise route');

    fireEvent.click(screen.getByRole('button', { name: /round up to 1h 15m/i }));

    expect(screen.getByText('Lands on a 15 min increment')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /complete route · 1h 15m/i })).toBeEnabled();
  });

  it('steppers adjust billed minutes, respecting each phase floor', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops(), errors: [] });

    render(<OperatorFinalisePage />);
    await screen.findByText('Finalise route');

    fireEvent.click(screen.getByRole('button', { name: 'Increase Placement minutes' }));
    expect(screen.getByText('25m')).toBeInTheDocument();

    // Load starts at its 15 min floor already — decreasing must not go below it.
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Load minutes' }));
    const loadValues = screen.getAllByText('15m');
    expect(loadValues.length).toBeGreaterThan(0);
  });

  it('the distance stepper adjusts in 0.5 km steps with a 0 floor', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops(), errors: [] });

    render(<OperatorFinalisePage />);
    await screen.findByText('Finalise route');

    expect(screen.getByText('0.0 km')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Decrease distance' }));
    expect(screen.getByText('0.0 km')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Increase distance' }));
    expect(screen.getByText('0.5 km')).toBeInTheDocument();
  });

  it('completes the route with all billed fields, the override totals, and status completed', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops(), errors: [] });

    render(<OperatorFinalisePage />);
    await screen.findByText('Finalise route');

    fireEvent.click(screen.getByRole('button', { name: 'Increase distance' }));
    fireEvent.click(screen.getByRole('button', { name: /round up to 1h 15m/i }));
    fireEvent.click(screen.getByRole('button', { name: /complete route · 1h 15m/i }));

    await waitFor(() => {
      expect(updateRouteExecution).toHaveBeenCalledWith('route-1', {
        billedLoadMinutes: 15,
        billedPlacementMinutes: 20,
        billedPickupMinutes: 10,
        billedUnloadMinutes: 30,
        overrideDurationMinutes: 75,
        overrideDistanceKm: 0.5,
        status: 'completed',
      });
    });
    expect(push).toHaveBeenCalledWith('/operator/dashboard');
  });

  it('back to today does not write any changes', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops(), errors: [] });

    render(<OperatorFinalisePage />);
    await screen.findByText('Finalise route');

    fireEvent.click(screen.getByRole('button', { name: /back to today/i }));

    expect(updateRouteExecution).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/operator/dashboard');
  });

  it('shows a guard message when the route is not ready to finalise', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: baseRoute({ unloadConfirmedAt: undefined, executionPhase: 'pickup' }),
      stops: baseStops(),
      errors: [],
    });

    render(<OperatorFinalisePage />);

    expect(await screen.findByText(/not ready to finalise yet/i)).toBeInTheDocument();
    expect(updateRouteExecution).not.toHaveBeenCalled();
  });

  it('shows a guard message when the route is not found', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: null, stops: [], errors: [] });

    render(<OperatorFinalisePage />);

    expect(await screen.findByText(/route not found/i)).toBeInTheDocument();
  });

  it('shows a message when no route id is present', () => {
    searchParamId = null;
    render(<OperatorFinalisePage />);
    expect(screen.getByText(/no route selected/i)).toBeInTheDocument();
  });
});
