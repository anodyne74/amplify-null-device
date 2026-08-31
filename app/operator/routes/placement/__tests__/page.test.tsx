import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import OperatorPlacementPage from '../page';
import { getRouteWithStops, getCustomer, updateRouteExecution, updateStopExecution } from '@/lib/queries';
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
  updateStopExecution: jest.fn(),
}));

jest.mock('@/app/operator/components/RouteStopsMap', () => ({
  RouteStopsMap: ({ stops, activeStopId }: { stops: Stop[]; activeStopId?: string | null }) => (
    <div data-testid="placement-map" data-stop-count={stops.length} data-active-stop={activeStopId ?? ''} />
  ),
}));

function baseRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: 'route-1',
    routeCode: 'W25-08-114',
    customerId: 'cust-1',
    status: 'in_progress',
    drivingModeEnabled: true,
    executionPhase: 'placement',
    placementStartTime: '2026-08-31T09:00:00.000Z',
    ...overrides,
  } as Route;
}

function baseStops(): Stop[] {
  return [
    {
      id: 's1',
      routeId: 'route-1',
      sequence: 1,
      address: '100 First St, Northcote',
      formattedAddress: '100 First St, Northcote',
      agent: 'Rachel Morrow',
      numberOfSigns: 9,
      isAuction: true,
      latitude: -37.7679,
      longitude: 144.9985,
    } as Stop,
    {
      id: 's2',
      routeId: 'route-1',
      sequence: 2,
      address: '14 Second Ave, Northcote',
      formattedAddress: '14 Second Ave, Northcote',
      agent: 'Jem Tran',
      numberOfSigns: 5,
      isAuction: false,
      latitude: -37.7701,
      longitude: 144.9997,
    } as Stop,
  ];
}

describe('Operator Placement page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchParamId = 'route-1';
    (getCustomer as jest.Mock).mockResolvedValue({ data: { name: 'Beltline Group' }, errors: undefined });
    (updateRouteExecution as jest.Mock).mockResolvedValue({ data: { id: 'route-1' }, errors: undefined });
    (updateStopExecution as jest.Mock).mockResolvedValue({ data: { id: 's1' }, errors: undefined });
  });

  it('shows the current stop on the glass card and the remaining stop in the THEN list', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops(), errors: [] });

    render(<OperatorPlacementPage />);

    expect(await screen.findByText('PLACEMENT · STOP 1 OF 2')).toBeInTheDocument();
    expect(screen.getByText('100 First St')).toBeInTheDocument();
    expect(screen.getByText('9 signs')).toBeInTheDocument();
    expect(screen.getByText('Auction')).toBeInTheDocument();
    expect(screen.getByText('14 Second Ave')).toBeInTheDocument();
    expect(screen.getByTestId('placement-map')).toHaveAttribute('data-active-stop', 's1');
  });

  it('does not re-set placementStartTime when it is already recorded', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops(), errors: [] });

    render(<OperatorPlacementPage />);
    await screen.findByText('PLACEMENT · STOP 1 OF 2');

    expect(updateRouteExecution).not.toHaveBeenCalledWith('route-1', expect.objectContaining({ placementStartTime: expect.anything() }));
  });

  it('lazily records placementStartTime on mount when unset', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: baseRoute({ placementStartTime: null }),
      stops: baseStops(),
      errors: [],
    });

    render(<OperatorPlacementPage />);
    await screen.findByText('PLACEMENT · STOP 1 OF 2');

    await waitFor(() => {
      expect(updateRouteExecution).toHaveBeenCalledWith(
        'route-1',
        expect.objectContaining({ placementStartTime: expect.any(String) })
      );
    });
  });

  it('completes the current stop with one tap and advances to the next', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops(), errors: [] });

    render(<OperatorPlacementPage />);
    await screen.findByText('PLACEMENT · STOP 1 OF 2');

    fireEvent.click(screen.getByRole('button', { name: /signs placed/i }));

    await waitFor(() => {
      expect(updateStopExecution).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ notes: expect.stringContaining('[PLACEMENT_DONE:') })
      );
    });
    expect(await screen.findByText('PLACEMENT · STOP 2 OF 2')).toBeInTheDocument();
  });

  it('skips the current stop via the reason sheet', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops(), errors: [] });

    render(<OperatorPlacementPage />);
    await screen.findByText('PLACEMENT · STOP 1 OF 2');

    fireEvent.click(screen.getByRole('button', { name: /^skip$/i }));
    expect(await screen.findByText('Why is this stop skipped?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /gate locked/i }));

    await waitFor(() => {
      expect(updateStopExecution).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ notes: expect.stringContaining('[PLACEMENT_SKIPPED:') })
      );
    });
    expect(await screen.findByText('PLACEMENT · STOP 2 OF 2')).toBeInTheDocument();
  });

  it('opens the out-of-order sheet from the THEN list', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops(), errors: [] });

    render(<OperatorPlacementPage />);
    await screen.findByText('14 Second Ave');

    fireEvent.click(screen.getByText('14 Second Ave'));

    expect(await screen.findByText('14 Second Ave, Northcote')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Signs Placed' })).toBeInTheDocument();
  });

  it('advances the phase to pickup and returns to Today after the last stop', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: baseRoute(),
      stops: [baseStops()[0]],
      errors: [],
    });

    render(<OperatorPlacementPage />);
    await screen.findByText('PLACEMENT · STOP 1 OF 1');

    fireEvent.click(screen.getByRole('button', { name: /signs placed/i }));

    await waitFor(() => {
      expect(updateRouteExecution).toHaveBeenCalledWith(
        'route-1',
        expect.objectContaining({ executionPhase: 'pickup', placementEndTime: expect.any(String) })
      );
    });
    expect(push).toHaveBeenCalledWith('/operator/dashboard');
  });

  it('shows a guard message when the route is not on the Placement phase', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: baseRoute({ executionPhase: 'pickup' }),
      stops: baseStops(),
      errors: [],
    });

    render(<OperatorPlacementPage />);

    expect(await screen.findByText(/not currently on the placement phase/i)).toBeInTheDocument();
  });

  it('shows a guard message when the route is not found', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: null, stops: [], errors: [] });

    render(<OperatorPlacementPage />);

    expect(await screen.findByText(/route not found/i)).toBeInTheDocument();
  });

  it('shows a message when no route id is present', () => {
    searchParamId = null;
    render(<OperatorPlacementPage />);
    expect(screen.getByText(/no route selected/i)).toBeInTheDocument();
  });
});
