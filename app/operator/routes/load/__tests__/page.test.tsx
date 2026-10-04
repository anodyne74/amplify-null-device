import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import OperatorLoadPage from '../page';
import { queueLoadChange, queueSignRunTransition } from '@/lib/signRunTransitions';
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
  createLoadStop: jest.fn(() => new Promise(() => {})),
}));

jest.mock('@/lib/use-user-groups', () => ({ useCurrentUserId: () => 'operator-1' }));

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
    queueLoadChange: jest.fn(actual.queueLoadChange),
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

  describe('timed signs checklist', () => {
    // jsdom has no PointerEvent, so fireEvent.pointer* would drop clientX.
    beforeAll(() => {
      class TestPointerEvent extends MouseEvent {
        pointerId: number;
        constructor(type: string, init: PointerEventInit = {}) {
          super(type, init);
          this.pointerId = init.pointerId ?? 0;
        }
      }
      (window as unknown as { PointerEvent: unknown }).PointerEvent = TestPointerEvent;
    });

    function stopsWithAddresses(): Stop[] {
      return baseStops().map((stop, i) => ({ ...stop, address: `${i + 1} Test St, Carlton` }) as Stop);
    }

    async function renderStartedLoad() {
      (getRouteWithStops as jest.Mock).mockResolvedValue({
        route: baseRoute({ loadStartedAt: '2026-09-12T07:37:00.000Z' }),
        stops: stopsWithAddresses(),
      });
      render(<OperatorLoadPage />);
      await screen.findByText('45 signs to load');
    }

    it('is not shown before the load starts', async () => {
      (getRouteWithStops as jest.Mock).mockResolvedValue({ route: baseRoute(), stops: stopsWithAddresses() });
      render(<OperatorLoadPage />);
      await screen.findByText('45 signs to load');

      expect(screen.queryByText(/properties · placement order/i)).not.toBeInTheDocument();
    });

    it('lists every property in placement order with its timed and blank signs', async () => {
      await renderStartedLoad();

      expect(screen.getByText(/properties · placement order/i)).toBeInTheDocument();
      expect(screen.getByText('0 of 4 loaded')).toBeInTheDocument();
      const rows = screen.getAllByRole('button', { name: /Test St, Carlton/ });
      expect(rows.map((row) => row.textContent)).toEqual([
        expect.stringContaining('1 Test St, CarltonRachel Morrow · 9 timed'),
        expect.stringContaining('2 Test St, CarltonRachel Morrow · 1 timed · 12 blank'),
        expect.stringContaining('3 Test St, CarltonJem Tran · 1 timed · 17 blank'),
        expect.stringContaining('4 Test St, CarltonUnassigned · 1 timed · 4 blank'),
      ]);
    });

    it('ticks a property loaded on tap, and unticks it on a second tap, saving nothing', async () => {
      await renderStartedLoad();

      const row = screen.getByRole('button', { name: /2 Test St, Carlton/ });
      fireEvent.click(row);
      expect(row).toHaveAttribute('aria-pressed', 'true');
      expect(row).toHaveTextContent('Loaded');
      expect(screen.getByText('1 of 4 loaded')).toBeInTheDocument();

      fireEvent.click(row);
      expect(row).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByText('0 of 4 loaded')).toBeInTheDocument();
      expect(queueLoadChange).not.toHaveBeenCalled();
      expect(queueSignRunTransition).not.toHaveBeenCalled();
    });

    it('removes a property swiped left, saving it and leaving it out of the count', async () => {
      await renderStartedLoad();

      const row = screen.getByRole('button', { name: /3 Test St, Carlton/ });
      fireEvent.pointerDown(row, { clientX: 300, pointerId: 1 });
      fireEvent.pointerMove(row, { clientX: 120, pointerId: 1 });
      fireEvent.pointerUp(row, { clientX: 120, pointerId: 1 });

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /3 Test St, Carlton/ })).not.toBeInTheDocument();
      });
      expect(queueLoadChange).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'route-1' }),
        expect.objectContaining({ type: 'remove', by: 'operator-1', stop: expect.objectContaining({ id: 's3' }) })
      );
      expect(screen.getByText('3 Test St, Carlton')).toBeInTheDocument();
      expect(screen.getByText('Jem Tran · Removed')).toBeInTheDocument();
      expect(screen.getByText('0 of 3 loaded')).toBeInTheDocument();
      expect(screen.getByText('27 signs to load')).toBeInTheDocument();
    });

    it('restores a removed property', async () => {
      await renderStartedLoad();

      fireEvent.keyDown(screen.getByRole('button', { name: /3 Test St, Carlton/ }), { key: 'Delete' });
      fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));

      expect(await screen.findByRole('button', { name: /3 Test St, Carlton/ })).toBeInTheDocument();
      expect(queueLoadChange).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ type: 'restore', stop: expect.objectContaining({ id: 's3' }) })
      );
      expect(screen.getByText('45 signs to load')).toBeInTheDocument();
    });

    it('keeps a property swiped only part way, without ticking it', async () => {
      await renderStartedLoad();

      const row = screen.getByRole('button', { name: /3 Test St, Carlton/ });
      fireEvent.pointerDown(row, { clientX: 300, pointerId: 1 });
      fireEvent.pointerMove(row, { clientX: 250, pointerId: 1 });
      fireEvent.pointerUp(row, { clientX: 250, pointerId: 1 });
      // The browser follows the drag with a click on the same button.
      fireEvent.click(row);

      expect(row).toBeInTheDocument();
      expect(row).toHaveAttribute('aria-pressed', 'false');
      expect(queueLoadChange).not.toHaveBeenCalled();
    });

    it('adds a property on the day to the end of the list, saving it', async () => {
      (getCustomer as jest.Mock).mockResolvedValue({ name: 'Beltline Group', agentOptions: ['Lena Park'] });
      await renderStartedLoad();

      fireEvent.click(screen.getByRole('button', { name: 'Add property' }));
      const add = screen.getByRole('button', { name: 'Add to end of list' });
      expect(add).toBeDisabled();

      fireEvent.change(screen.getByLabelText('Address'), { target: { value: '30 Faraday St, Carlton' } });
      fireEvent.change(screen.getByLabelText('Signs'), { target: { value: '3' } });
      fireEvent.click(await screen.findByRole('button', { name: 'Lena Park' }));
      fireEvent.click(add);

      await waitFor(() => expect(screen.getByText('0 of 5 loaded')).toBeInTheDocument());
      const rows = screen.getAllByRole('button', { name: /Carlton/ });
      expect(rows[rows.length - 1]).toHaveTextContent('30 Faraday St, CarltonLena Park · 1 timed · 2 blank · Added on the day');
      expect(screen.getByText('48 signs to load')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Add to end of list' })).not.toBeInTheDocument();
    });

    it('keeps the form open with the reason when an added property has no suburb', async () => {
      (getCustomer as jest.Mock).mockResolvedValue({ name: 'Beltline Group', agentOptions: ['Lena Park'] });
      await renderStartedLoad();

      fireEvent.click(screen.getByRole('button', { name: 'Add property' }));
      fireEvent.change(screen.getByLabelText('Address'), { target: { value: '30 Faraday St' } });
      fireEvent.click(await screen.findByRole('button', { name: 'Lena Park' }));
      fireEvent.click(screen.getByRole('button', { name: 'Add to end of list' }));

      expect(screen.getByRole('alert')).toHaveTextContent('Add the suburb to the address');
      expect(screen.getByRole('button', { name: 'Add to end of list' })).toBeInTheDocument();
      expect(screen.getByText('0 of 4 loaded')).toBeInTheDocument();
    });
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
