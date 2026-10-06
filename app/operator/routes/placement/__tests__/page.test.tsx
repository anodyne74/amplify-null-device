import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import OperatorPlacementPage from '../page';
import { queueSignRunTransition } from '@/lib/signRunTransitions';
import { signRunOutbox } from '@/lib/signRunOutbox';
import type { Route, Stop } from '@/amplify/types';
import { getRouteWithStops, updateStopExecution } from '@/lib/routes';
import { getCustomer } from '@/lib/customers';

const push = jest.fn();
let searchParamId: string | null = 'route-1';

// The live feed is inert here; these tests drive the screen through the fetch.
jest.mock('@/lib/routeWithStopsFeed', () => ({
  subscribeRouteWithStops: () => () => {},
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => ({ get: (key: string) => (key === 'id' ? searchParamId : null) }),
}));

jest.mock('@/lib/routes', () => ({
  getRouteWithStops: jest.fn(),
  updateRoute: jest.fn(() => new Promise(() => {})),
  updateStopExecution: jest.fn(),
}));

jest.mock('@/lib/customers', () => ({
  getCustomer: jest.fn(),
}));

// Sign Run writes go through the real outbox (#355). Their saves hang, so
// every test here shows the screen moving on without waiting for one.
jest.mock('@/lib/signRunTransitions', () => {
  const actual = jest.requireActual('@/lib/signRunTransitions');
  return {
    ...actual,
    queueSignRunTransition: jest.fn(actual.queueSignRunTransition),
    queueStopSettlement: jest.fn(actual.queueStopSettlement),
  };
});
jest.mock('aws-amplify/auth', () => ({ fetchAuthSession: jest.fn().mockResolvedValue({}) }));
jest.mock('@/lib/apiClient', () => ({ callApi: jest.fn().mockResolvedValue({}) }));
jest.mock('@/lib/use-user-groups', () => ({ useCurrentUserId: () => 'operator-1' }));

jest.mock('@/app/operator/components/RouteStopsMap', () => ({
  RouteStopsMap: ({
    stops,
    activeStopId,
    phase,
  }: {
    stops: Stop[];
    activeStopId?: string | null;
    phase?: string;
  }) => (
    <div
      data-testid="placement-map"
      data-stop-count={stops.length}
      data-active-stop={activeStopId ?? ''}
      data-phase={phase ?? ''}
    />
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

afterEach(async () => {
  await signRunOutbox.discardAll();
});

describe('Operator Placement page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchParamId = 'route-1';
    (getCustomer as jest.Mock).mockResolvedValue({ name: 'Beltline Group' });
    // Stop settlements (they carry notes) hang; other stop writes save.
    (updateStopExecution as jest.Mock).mockImplementation((id: string, fields: object) =>
      'notes' in fields ? new Promise(() => {}) : Promise.resolve({ data: { id }, errors: undefined })
    );
  });

  it('shows the current stop on the glass card and the remaining stop in the THEN list', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops() });

    render(<OperatorPlacementPage />);

    expect(await screen.findByText('PLACEMENT · STOP 1 OF 2')).toBeInTheDocument();
    expect(screen.getByText('100 First St')).toBeInTheDocument();
    expect(screen.getByText('9 signs')).toBeInTheDocument();
    expect(screen.getByText('Auction')).toBeInTheDocument();
    expect(screen.getByText('14 Second Ave')).toBeInTheDocument();
    expect(screen.getByTestId('placement-map')).toHaveAttribute('data-active-stop', 's1');
  });

  it('shows a gated start panel until the driver starts placement', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: baseRoute({ placementStartTime: null }),
      stops: baseStops(),
    });

    render(<OperatorPlacementPage />);

    expect(await screen.findByText('2 stops to place')).toBeInTheDocument();
    expect(screen.getByText(/tap start once you're on the road/i)).toBeInTheDocument();
    expect(screen.queryByTestId('placement-map')).not.toBeInTheDocument();
    expect(queueSignRunTransition).not.toHaveBeenCalled();
  });

  it('starts placement through the confirm dialog', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: baseRoute({ placementStartTime: null }),
      stops: baseStops(),
    });

    render(<OperatorPlacementPage />);
    await screen.findByText('2 stops to place');

    fireEvent.click(screen.getByRole('button', { name: 'Start placement' }));
    expect(screen.getByText(/starting placement for 2 stops/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => {
      expect(queueSignRunTransition).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'route-1' }),
        expect.objectContaining({ type: 'startPlacement' })
      );
    });
    expect(await screen.findByText('PLACEMENT · STOP 1 OF 2')).toBeInTheDocument();
  });

  it('cancelling the start dialog leaves placement unstarted', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: baseRoute({ placementStartTime: null }),
      stops: baseStops(),
    });

    render(<OperatorPlacementPage />);
    await screen.findByText('2 stops to place');

    fireEvent.click(screen.getByRole('button', { name: 'Start placement' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(queueSignRunTransition).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Start placement' })).toBeInTheDocument();
  });

  it('completes the current stop with one tap and advances to the next', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops() });

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

  describe('placement GPS (#285)', () => {
    const originalGeolocation = navigator.geolocation;

    function setGeolocation(geolocation: Partial<Geolocation> | undefined) {
      Object.defineProperty(navigator, 'geolocation', { value: geolocation, configurable: true });
    }

    afterEach(() => setGeolocation(originalGeolocation));

    it('records where the device was when the stop is marked placed, without moving its pin', async () => {
      setGeolocation({
        getCurrentPosition: (onSuccess: PositionCallback) =>
          onSuccess({
            coords: { latitude: -37.7681, longitude: 144.9982, accuracy: 8 },
            timestamp: Date.parse('2026-09-27T01:00:00Z'),
          } as GeolocationPosition),
      });
      (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops() });

      render(<OperatorPlacementPage />);
      await screen.findByText('PLACEMENT · STOP 1 OF 2');
      fireEvent.click(screen.getByRole('button', { name: /signs placed/i }));

      await waitFor(() => {
        expect(updateStopExecution).toHaveBeenCalledWith('s1', {
          placedLatitude: -37.7681,
          placedLongitude: 144.9982,
          placedAccuracyMeters: 8,
          placedPositionAt: '2026-09-27T01:00:00.000Z',
        });
      });
      expect(await screen.findByText('PLACEMENT · STOP 2 OF 2')).toBeInTheDocument();
    });

    it('still places the stop when location is denied', async () => {
      setGeolocation({
        getCurrentPosition: (_onSuccess: PositionCallback, onError?: PositionErrorCallback | null) =>
          onError?.({ code: 1 } as GeolocationPositionError),
      });
      (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops() });

      render(<OperatorPlacementPage />);
      await screen.findByText('PLACEMENT · STOP 1 OF 2');
      fireEvent.click(screen.getByRole('button', { name: /signs placed/i }));

      expect(await screen.findByText('PLACEMENT · STOP 2 OF 2')).toBeInTheDocument();
      expect(updateStopExecution).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it("does not record a position for a stop that can't be placed", async () => {
      const getCurrentPosition = jest.fn();
      setGeolocation({ getCurrentPosition });
      (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops() });

      render(<OperatorPlacementPage />);
      await screen.findByText('PLACEMENT · STOP 1 OF 2');
      fireEvent.click(screen.getByRole('button', { name: "Can't place" }));
      fireEvent.click(await screen.findByRole('button', { name: /gate locked/i }));

      expect(await screen.findByText('PLACEMENT · STOP 1 OF 1')).toBeInTheDocument();
      expect(getCurrentPosition).not.toHaveBeenCalled();
    });
  });

  it("removes the current stop with a reason when its signs can't go up, and lets it be restored", async () => {
    // Removals save, with the version the outbox shows them under until the live data catches up.
    (updateStopExecution as jest.Mock).mockImplementation((id: string) =>
      Promise.resolve({ data: { id, updatedAt: '2026-09-30T00:00:00.000Z' }, errors: undefined })
    );
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops() });

    render(<OperatorPlacementPage />);
    await screen.findByText('PLACEMENT · STOP 1 OF 2');

    fireEvent.click(screen.getByRole('button', { name: "Can't place" }));
    expect(await screen.findByText("Why can't the signs go up?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /gate locked/i }));

    await waitFor(() => {
      expect(updateStopExecution).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ removed: true, removedBy: 'operator-1', removedReason: 'Gate locked / no access' })
      );
    });
    // It counts toward nothing: one stop left, and it's off the map.
    expect(await screen.findByText('PLACEMENT · STOP 1 OF 1')).toBeInTheDocument();
    expect(screen.getByTestId('placement-map')).toHaveAttribute('data-stop-count', '1');
    const removed = screen.getByRole('region', { name: 'Removed today' });
    expect(removed).toHaveTextContent('100 First St');
    expect(removed).toHaveTextContent('Gate locked / no access');

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(updateStopExecution).toHaveBeenCalledWith('s1', { removed: false }));
    expect(await screen.findByText('PLACEMENT · STOP 1 OF 2')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Removed today' })).not.toBeInTheDocument();
  });

  it("doesn't offer to restore a stop removed at Load, nor show it", async () => {
    const stops = baseStops();
    // Newer than any write saved earlier in this file, as live data is once it has caught up.
    stops[0] = { ...stops[0], removed: true, removedAt: '2026-08-31T07:30:00.000Z', updatedAt: '2026-12-01T00:00:00.000Z' } as Stop;
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops });

    render(<OperatorPlacementPage />);
    await screen.findByText('PLACEMENT · STOP 1 OF 1');

    expect(screen.getByTestId('placement-map')).toHaveAttribute('data-phase', 'placement');
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
  });

  it('opens the out-of-order sheet from the THEN list', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops() });

    render(<OperatorPlacementPage />);
    await screen.findByText('14 Second Ave');

    fireEvent.click(screen.getByText('14 Second Ave'));

    expect(await screen.findByText('14 Second Ave, Northcote')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Signs Placed' })).toBeInTheDocument();
  });

  it('shows a confirm-to-finish state after the last stop, without advancing the phase yet', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: baseRoute(),
      stops: [baseStops()[0]],
    });

    render(<OperatorPlacementPage />);
    await screen.findByText('PLACEMENT · STOP 1 OF 1');

    fireEvent.click(screen.getByRole('button', { name: /signs placed/i }));

    expect(await screen.findByText('All stops done')).toBeInTheDocument();
    expect(screen.getByText('Route complete')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /complete placement/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^skip$/i })).not.toBeInTheDocument();
    expect(queueSignRunTransition).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'completePlacement' }));
    expect(push).not.toHaveBeenCalled();
  });

  it('advances the phase to pickup and returns to Today once the driver confirms', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: baseRoute(),
      stops: [baseStops()[0]],
    });

    render(<OperatorPlacementPage />);
    await screen.findByText('PLACEMENT · STOP 1 OF 1');

    fireEvent.click(screen.getByRole('button', { name: /signs placed/i }));
    fireEvent.click(await screen.findByRole('button', { name: /complete placement/i }));

    expect(screen.getByText(/this closes placement for w25-08-114/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => {
      expect(queueSignRunTransition).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'route-1' }),
        expect.objectContaining({ type: 'completePlacement' })
      );
    });
    expect(push).toHaveBeenCalledWith('/operator/dashboard');
  });

  it('shows a guard message when the route is not on the Placement phase', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: baseRoute({ executionPhase: 'pickup' }),
      stops: baseStops(),
    });

    render(<OperatorPlacementPage />);

    expect(await screen.findByText(/not currently on the placement phase/i)).toBeInTheDocument();
  });

  it('shows a guard message when the route is not found', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue(null);

    render(<OperatorPlacementPage />);

    expect(await screen.findByText(/route not found/i)).toBeInTheDocument();
  });

  it('shows a message when no route id is present', () => {
    searchParamId = null;
    render(<OperatorPlacementPage />);
    expect(screen.getByText(/no route selected/i)).toBeInTheDocument();
  });
});
