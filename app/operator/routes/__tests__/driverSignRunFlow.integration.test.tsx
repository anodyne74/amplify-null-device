import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import OperatorLoadPage from '../load/page';
import OperatorPlacementPage from '../placement/page';
import OperatorPickupPage from '../pickup/page';
import OperatorUnloadPage from '../unload/page';
import OperatorFinalisePage from '../finalise/page';
import { getRouteWithStops, getCustomer, updateRouteExecution, updateStopExecution } from '@/lib/queries';
import { getOrganizationSettings } from '@/lib/queries/OrganizationSettings';
import type { Route, Stop } from '@/amplify/types';

/**
 * Walks a single route through every screen of the Driver Sign Run flow —
 * Load -> Placement -> Pickup -> Unload -> Finalise — against a single
 * in-memory "backend" that each mocked query reads from and writes to, the
 * same way the real AppSync-backed store would. Verifies the flow holds
 * together as a whole: signs loaded at Load feed Unload's reconciliation,
 * stops actioned in Pickup drive both Unload's and Finalise's stats, and the
 * phase timestamps set by every prior screen become Finalise's billed-time
 * defaults — not just that each screen works in isolation (see each
 * screen's own __tests__/page.test.tsx for that).
 */

const push = jest.fn();
const routeId = 'route-1';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => ({ get: (key: string) => (key === 'id' ? 'route-1' : null) }),
}));

jest.mock('@/lib/queries', () => ({
  getRouteWithStops: jest.fn(),
  getCustomer: jest.fn(),
  updateRouteExecution: jest.fn(),
  updateStopExecution: jest.fn(),
}));

jest.mock('@/lib/queries/OrganizationSettings', () => ({
  getOrganizationSettings: jest.fn(),
}));

jest.mock('@/app/operator/components/RouteStopsMap', () => ({
  RouteStopsMap: () => <div data-testid="stops-map" />,
}));

// Route-level timestamps are pinned to fixed values (rather than left as the real
// `new Date().toISOString()` each screen actually passes) so the elapsed spans between
// them — and therefore Finalise's measured-minutes defaults — are deterministic.
const T0 = '2026-08-31T08:00:00.000Z'; // load confirmed / actual start
const T1 = '2026-08-31T08:05:00.000Z'; // placement start
const T2 = '2026-08-31T08:25:00.000Z'; // placement end (20 min)
const T3 = '2026-08-31T08:30:00.000Z'; // pickup start
const T4 = '2026-08-31T08:42:00.000Z'; // pickup end (12 min)
const T5 = '2026-08-31T09:00:00.000Z'; // unload confirmed / actual end (18 min after T4)
const FIXED_TIMES: Record<string, string> = {
  actualStartTime: T0,
  loadConfirmedAt: T0,
  placementStartTime: T1,
  placementEndTime: T2,
  pickupStartTime: T3,
  pickupEndTime: T4,
  unloadConfirmedAt: T5,
  actualEndTime: T5,
};

function initialStops(): Stop[] {
  return [
    {
      id: 's1',
      routeId,
      sequence: 1,
      numberOfSigns: 9,
      agent: 'Alex',
      address: '100 First St, Northcote',
      formattedAddress: '100 First St, Northcote',
    } as Stop,
    {
      id: 's2',
      routeId,
      sequence: 2,
      numberOfSigns: 13,
      agent: 'Sam',
      address: '14 Second Ave, Northcote',
      formattedAddress: '14 Second Ave, Northcote',
    } as Stop,
    {
      id: 's3',
      routeId,
      sequence: 3,
      numberOfSigns: 18,
      agent: 'Alex',
      address: '8 Third Rd, Northcote',
      formattedAddress: '8 Third Rd, Northcote',
    } as Stop,
  ];
}

describe('Driver Sign Run — full Load through Finalise flow', () => {
  let store: { route: Route; stops: Stop[] };

  beforeEach(() => {
    jest.clearAllMocks();
    store = {
      route: {
        id: routeId,
        routeCode: 'W25-09-01',
        customerId: 'cust-1',
        status: 'planned',
        drivingModeEnabled: true,
        executionPhase: null,
      } as Route,
      stops: initialStops(),
    };

    (getRouteWithStops as jest.Mock).mockImplementation(async () => ({
      route: store.route,
      stops: store.stops,
      errors: [],
    }));
    (getCustomer as jest.Mock).mockResolvedValue({ data: { name: 'Beltline Group' }, errors: undefined });
    (getOrganizationSettings as jest.Mock).mockResolvedValue({
      data: { address: '22 Dryburgh St, West Melbourne' },
      errors: undefined,
    });
    (updateRouteExecution as jest.Mock).mockImplementation(async (id: string, updates: Partial<Route>) => {
      const patched: Record<string, unknown> = { ...updates };
      for (const key of Object.keys(patched)) {
        if (key in FIXED_TIMES) patched[key] = FIXED_TIMES[key];
      }
      store.route = { ...store.route, ...patched } as Route;
      return { data: { id }, errors: undefined };
    });
    (updateStopExecution as jest.Mock).mockImplementation(async (stopId: string, updates: Partial<Stop>) => {
      store.stops = store.stops.map((stop) => (stop.id === stopId ? { ...stop, ...updates } : stop));
      return { data: { id: stopId }, errors: undefined };
    });
  });

  it('carries signs loaded, stops actioned, and elapsed time through every screen to a billable finalise', async () => {
    // --- Load ---------------------------------------------------------
    const load = render(<OperatorLoadPage />);
    expect(await screen.findByText('40 signs to load')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /confirm 40 signs loaded/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/operator/dashboard'));
    expect(store.route.loadedSignsCount).toBe(40);
    expect(store.route.executionPhase).toBe('placement');
    expect(store.route.loadConfirmedAt).toBe(T0);
    expect(store.route.actualStartTime).toBe(T0);
    load.unmount();
    push.mockClear();

    // --- Placement: place s1 and s2, skip s3 --------------------------
    const placement = render(<OperatorPlacementPage />);
    expect(await screen.findByText('PLACEMENT · STOP 1 OF 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /signs placed/i }));
    expect(await screen.findByText('PLACEMENT · STOP 2 OF 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /signs placed/i }));
    expect(await screen.findByText('PLACEMENT · STOP 3 OF 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^skip$/i }));
    expect(await screen.findByText('Why is this stop skipped?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /gate locked/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/operator/dashboard'));
    expect(store.route.executionPhase).toBe('pickup');
    expect(store.route.placementStartTime).toBe(T1);
    expect(store.route.placementEndTime).toBe(T2);
    placement.unmount();
    push.mockClear();

    // --- Pickup: pick up s1, log a missing sign then pick up s2, skip s3 --
    const pickup = render(<OperatorPickupPage />);
    expect(await screen.findByText('PICKUP · STOP 1 OF 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /signs picked up/i }));
    expect(await screen.findByText('PICKUP · STOP 2 OF 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /sign missing/i }));
    await waitFor(() => expect(screen.getByText('1 missing')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /signs picked up/i }));
    expect(await screen.findByText('PICKUP · STOP 3 OF 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^skip$/i }));
    expect(await screen.findByText('Why is this stop skipped?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /gate locked/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/operator/dashboard'));
    expect(store.route.executionPhase).toBe('unload');
    expect(store.route.pickupStartTime).toBe(T3);
    expect(store.route.pickupEndTime).toBe(T4);
    const s2 = store.stops.find((s) => s.id === 's2')!;
    expect(s2.missingSignsCount).toBe(1);
    pickup.unmount();
    push.mockClear();

    // --- Unload: reconcile against the load and confirm ---------------
    const unload = render(<OperatorUnloadPage />);
    // s1 (9) + s2 (13) returned; s3 skipped; 1 reported missing on s2;
    // 40 loaded - 22 returned - 1 missing = 17 still on site.
    expect(await screen.findByText('22 signs to return')).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.getByText('1 stops')).toBeInTheDocument();
    expect(screen.getByText('40 loaded · 22 returned · 1 reported missing · 17 still on site.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /confirm 22 signs returned/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/operator/dashboard'));
    expect(store.route.unloadConfirmedAt).toBe(T5);
    expect(store.route.actualEndTime).toBe(T5);
    unload.unmount();
    push.mockClear();

    // --- Finalise: the same stats agree, billed time derives from every
    //     phase's timestamps, and completing writes the invoicing fields --
    const finalise = render(<OperatorFinalisePage />);
    expect(await screen.findByText('Finalise route')).toBeInTheDocument();

    // Independently recomputed by Finalise's own buildSummary — should match Unload.
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.getByText('22')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    // Cumulative of the completed phases' measured times, not the actualStartTime ->
    // actualEndTime wall clock: 0 (load) + 20 (placement) + 12 (pickup) + 18 (unload) = 50 min.
    expect(screen.getByText('50m')).toBeInTheDocument();

    // Measured defaults: load 0min->floor 15m; placement 20min->20m;
    // pickup 12min->round5->10m; unload 18min->round5->20m. Total 65m, not billable.
    expect(screen.getByText('15m')).toBeInTheDocument();
    expect(screen.getAllByText('20m')).toHaveLength(2);
    expect(screen.getByText('10m')).toBeInTheDocument();
    expect(screen.getByText('1h 5m')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /complete route/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /round up to 1h 15m/i }));
    expect(screen.getByText('Lands on a 15 min increment')).toBeInTheDocument();

    const completeButton = screen.getByRole('button', { name: /complete route · 1h 15m/i });
    expect(completeButton).toBeEnabled();
    fireEvent.click(completeButton);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/operator/dashboard'));
    expect(updateRouteExecution).toHaveBeenCalledWith(routeId, {
      billedLoadMinutes: 15,
      billedPlacementMinutes: 20,
      billedPickupMinutes: 10,
      billedUnloadMinutes: 30,
      overrideDurationMinutes: 75,
      overrideDistanceKm: 0,
      status: 'completed',
    });
    finalise.unmount();
  });
});
