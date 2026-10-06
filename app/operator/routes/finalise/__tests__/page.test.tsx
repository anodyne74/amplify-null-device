import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import OperatorFinalisePage from '../page';
import { queueSignRunTransition } from '@/lib/signRunTransitions';
import { signRunOutbox } from '@/lib/signRunOutbox';
import type { Route, Stop } from '@/amplify/types';
import { getRouteWithStops } from '@/lib/routes';

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
  updateStopExecution: jest.fn(() => new Promise(() => {})),
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

function baseRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: 'route-1',
    routeCode: 'W25-08-114',
    customerId: 'cust-1',
    status: 'in_progress',
    drivingModeEnabled: true,
    executionPhase: 'unload',
    unloadStartedAt: '2026-08-31T08:52:00.000Z',
    unloadConfirmedAt: '2026-08-31T09:10:00.000Z',
    actualStartTime: '2026-08-31T08:00:00.000Z',
    actualEndTime: '2026-08-31T09:10:00.000Z',
    loadStartedAt: '2026-08-31T08:00:00.000Z',
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

afterEach(async () => {
  await signRunOutbox.discardAll();
});

describe('Operator Finalise page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchParamId = 'route-1';
  });

  it('shows the summary stats, measured defaults, and a warning state when the total is off a 15 min increment', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops() });

    render(<OperatorFinalisePage />);

    expect(await screen.findByText('Finalise route')).toBeInTheDocument();
    // s1 (9, done) + s2 (13 - 2 missing, done) returned; s3 skipped.
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument(); // signs collected
    expect(screen.getByText('2')).toBeInTheDocument(); // signs missing
    // Cumulative of the completed phases' measured times, not the actualStartTime ->
    // actualEndTime wall clock: 0 (load) + 22 (placement) + 12 (pickup) + 18 (unload) = 52m.
    expect(screen.getByText('52m')).toBeInTheDocument(); // duration
    expect(screen.getByText('Loaded time')).toBeInTheDocument();
    expect(screen.getByText('Returned time')).toBeInTheDocument();
    expect(screen.getByText('0m')).toBeInTheDocument(); // loaded time — load never actually measured
    expect(screen.getByText('18m')).toBeInTheDocument(); // returned time — measured unload duration

    // Adjuster sub-labels show the recorded measured time, not a static floor label.
    expect(screen.getByText('Not recorded')).toBeInTheDocument(); // load — start/confirm at the same instant
    expect(screen.getByText('Recorded 22m')).toBeInTheDocument(); // placement
    expect(screen.getByText('Recorded 12m')).toBeInTheDocument(); // pickup
    expect(screen.getByText('Recorded 18m')).toBeInTheDocument(); // unload

    // load: 0 measured -> floored at 15m. placement: 22min -> round5 -> 20m.
    // pickup: 12min -> round5 -> 10m. unload: 18min -> round5 -> 20m. Total 65m.
    expect(screen.getByText('15m')).toBeInTheDocument();
    expect(screen.getAllByText('20m')).toHaveLength(2);
    expect(screen.getByText('Total charged')).toBeInTheDocument();
    expect(screen.getByText('1h 5m')).toBeInTheDocument();
    expect(screen.getByText(/not a 15 min increment/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /round up to 1h 15m/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /complete route/i })).toBeDisabled();
    expect(screen.getByText('Total charged').closest('div')?.parentElement).toHaveClass('billPanelWarning');
  });

  it('rounding up brings the total to a 15 min increment and re-enables completion', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops() });

    render(<OperatorFinalisePage />);
    await screen.findByText('Finalise route');

    fireEvent.click(screen.getByRole('button', { name: /round up to 1h 15m/i }));

    expect(screen.getByText('Lands on a 15 min increment')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /complete route · 1h 15m/i })).toBeEnabled();
    expect(screen.getByText('Total charged').closest('div')?.parentElement).toHaveClass('billPanelValid');
  });

  it('steppers adjust billed minutes, respecting each phase floor', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops() });

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
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops() });

    render(<OperatorFinalisePage />);
    await screen.findByText('Finalise route');

    const distance = screen.getByLabelText('Distance (km)');
    expect(distance).toHaveValue('0.0');
    fireEvent.click(screen.getByRole('button', { name: 'Decrease distance' }));
    expect(distance).toHaveValue('0.0');

    fireEvent.click(screen.getByRole('button', { name: 'Increase distance' }));
    expect(distance).toHaveValue('0.5');
  });

  it('completes with a typed distance, rounded to 0.1 km, and steps on from it', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops() });

    render(<OperatorFinalisePage />);
    await screen.findByText('Finalise route');

    const distance = screen.getByLabelText('Distance (km)');
    fireEvent.change(distance, { target: { value: '37.46' } });
    fireEvent.click(screen.getByRole('button', { name: 'Increase distance' }));
    expect(distance).toHaveValue('38.0');

    fireEvent.change(distance, { target: { value: '37.46' } });
    fireEvent.click(screen.getByRole('button', { name: /round up to 1h 15m/i }));
    fireEvent.click(screen.getByRole('button', { name: /complete route · 1h 15m/i }));

    expect(queueSignRunTransition).toHaveBeenCalledWith(expect.objectContaining({ id: 'route-1' }), expect.objectContaining({ distanceKm: 37.5 }));
  });

  it.each(['', 'abc', '-3', '1.2.3'])('blocks completion while the distance is %p', async (typed) => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops() });

    render(<OperatorFinalisePage />);
    await screen.findByText('Finalise route');

    fireEvent.click(screen.getByRole('button', { name: /round up to 1h 15m/i }));
    fireEvent.change(screen.getByLabelText('Distance (km)'), { target: { value: typed } });

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a distance of 0 km or more.');
    expect(screen.getByRole('button', { name: /complete route/i })).toBeDisabled();
    expect(queueSignRunTransition).not.toHaveBeenCalled();
  });

  it('completes the route with all billed fields, the override totals, and status completed', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops() });

    render(<OperatorFinalisePage />);
    await screen.findByText('Finalise route');

    fireEvent.click(screen.getByRole('button', { name: 'Increase distance' }));
    fireEvent.click(screen.getByRole('button', { name: /round up to 1h 15m/i }));
    fireEvent.click(screen.getByRole('button', { name: /complete route · 1h 15m/i }));

    await waitFor(() => {
      expect(queueSignRunTransition).toHaveBeenCalledWith(expect.objectContaining({ id: 'route-1' }), {
        type: 'finalise',
        billedMinutes: { load: 15, placement: 20, pickup: 10, unload: 30 },
        distanceKm: 0.5,
      });
    });
    expect(push).toHaveBeenCalledWith('/operator/dashboard');
  });

  it('back to today does not write any changes', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops() });

    render(<OperatorFinalisePage />);
    await screen.findByText('Finalise route');

    fireEvent.click(screen.getByRole('button', { name: /back to today/i }));

    expect(queueSignRunTransition).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/operator/dashboard');
  });

  it('shows a guard message when the route is not ready to finalise', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: baseRoute({ unloadConfirmedAt: undefined, executionPhase: 'pickup' }),
      stops: baseStops(),
    });

    render(<OperatorFinalisePage />);

    expect(await screen.findByText(/not ready to finalise yet/i)).toBeInTheDocument();
    expect(queueSignRunTransition).not.toHaveBeenCalled();
  });

  it('shows a guard message when the route is not found', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue(null);

    render(<OperatorFinalisePage />);

    expect(await screen.findByText(/route not found/i)).toBeInTheDocument();
  });

  it('shows a message when no route id is present', () => {
    searchParamId = null;
    render(<OperatorFinalisePage />);
    expect(screen.getByText(/no route selected/i)).toBeInTheDocument();
  });
});
