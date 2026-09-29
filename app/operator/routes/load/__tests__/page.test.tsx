import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import OperatorLoadPage from '../page';
import { queueSignRunTransition } from '@/lib/signRunTransitions';
import { signRunOutbox } from '@/lib/signRunOutbox';
import { getOrganizationSettings } from '@/lib/queries/OrganizationSettings';
import type { Route, Stop } from '@/amplify/types';
import { getRouteWithStops } from '@/lib/routes';
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
  updateStopExecution: jest.fn(() => new Promise(() => {})),
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

afterEach(async () => {
  await signRunOutbox.discardAll();
});

describe('Operator Load page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchParamId = 'route-1';
    (getCustomer as jest.Mock).mockResolvedValue({ name: 'Beltline Group' });
    (getOrganizationSettings as jest.Mock).mockResolvedValue({ address: '22 Dryburgh St, West Melbourne' });
  });

  it('shows the per-agent breakdown, totals and yard address', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops() });

    render(<OperatorLoadPage />);

    expect(await screen.findByText('45 signs to load')).toBeInTheDocument();
    expect(screen.getByText('Beltline Group')).toBeInTheDocument();
    expect(screen.getByText('22 Dryburgh St, West Melbourne')).toBeInTheDocument();
    expect(screen.getByText('Rachel Morrow')).toBeInTheDocument();
    expect(screen.getByText('Jem Tran')).toBeInTheDocument();
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    expect(screen.getByText('45 signs')).toBeInTheDocument();
    expect(screen.getByText(/tap start once you're at the yard/i)).toBeInTheDocument();
  });

  it('splits each property into 1 timed sign + remaining blank, except auctions which are all timed', async () => {
    const stops: Stop[] = [
      { id: 's1', routeId: 'route-1', sequence: 1, agent: 'Rachel Morrow', numberOfSigns: 5, isAuction: false } as Stop,
      { id: 's2', routeId: 'route-1', sequence: 2, agent: 'Rachel Morrow', numberOfSigns: 3, isAuction: false } as Stop,
      { id: 's3', routeId: 'route-1', sequence: 3, agent: 'Jem Tran', numberOfSigns: 5, isAuction: true } as Stop,
    ];
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops });

    render(<OperatorLoadPage />);
    await screen.findByText('13 signs to load');

    // Rachel Morrow: two non-auction properties (5 signs, 3 signs) -> 1 timed each = 2 timed, (4 + 2) = 6 blank.
    const rachelRow = screen.getByText('Rachel Morrow').closest('div');
    expect(rachelRow).not.toBeNull();
    const rachelValues = within(rachelRow as HTMLElement).getAllByText(/^\d+$/);
    expect(rachelValues.map((el) => el.textContent)).toEqual(['2', '6']);

    // Jem Tran: one 5-sign auction property -> all 5 timed, 0 blank.
    const jemRow = screen.getByText('Jem Tran').closest('div');
    expect(jemRow).not.toBeNull();
    const jemValues = within(jemRow as HTMLElement).getAllByText(/^\d+$/);
    expect(jemValues.map((el) => el.textContent)).toEqual(['5', '0']);

    // Totals: 2 + 5 = 7 timed, 6 + 0 = 6 blank.
    expect(screen.getByText('13 signs')).toBeInTheDocument();
  });

  it('starts the load through the confirm dialog, then shows the stamp and the confirm step', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops() });

    render(<OperatorLoadPage />);
    await screen.findByText('45 signs to load');

    expect(screen.getByText(/tap start once you're at the yard/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start load' }));

    expect(screen.getByText(/starting load of 45 signs/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => {
      expect(queueSignRunTransition).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'route-1' }),
        expect.objectContaining({ type: 'startLoad' })
      );
    });
    expect(await screen.findByText(/^Load started/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm 45 signs loaded/i })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('cancelling the start dialog leaves the load unstarted', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: baseStops() });

    render(<OperatorLoadPage />);
    await screen.findByText('45 signs to load');

    fireEvent.click(screen.getByRole('button', { name: 'Start load' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(queueSignRunTransition).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Start load' })).toBeInTheDocument();
  });

  it('confirms the load, advances the phase, and returns to Today', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: baseRoute({ loadStartedAt: '2026-09-12T07:37:00.000Z' }),
      stops: baseStops(),
    });

    render(<OperatorLoadPage />);
    await screen.findByText('45 signs to load');

    fireEvent.click(screen.getByRole('button', { name: /confirm 45 signs loaded/i }));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => {
      expect(queueSignRunTransition).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'route-1' }),
        expect.objectContaining({ type: 'confirmLoad', loadedSignsCount: 45 })
      );
    });
    expect(push).toHaveBeenCalledWith('/operator/dashboard');
  });

  it('shows a guard message when the route is not on the Load phase', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: baseRoute({ status: 'in_progress', executionPhase: 'pickup' }),
      stops: baseStops(),
    });

    render(<OperatorLoadPage />);

    expect(await screen.findByText(/not currently on the load phase/i)).toBeInTheDocument();
    expect(queueSignRunTransition).not.toHaveBeenCalled();
  });

  it('shows a guard message when the route is not found', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue(null);

    render(<OperatorLoadPage />);

    expect(await screen.findByText(/route not found/i)).toBeInTheDocument();
  });

  it('shows a message when no route id is present', () => {
    searchParamId = null;
    render(<OperatorLoadPage />);
    expect(screen.getByText(/no route selected/i)).toBeInTheDocument();
  });
});
