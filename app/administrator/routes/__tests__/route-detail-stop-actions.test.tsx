import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import RouteDetailPage from '../detail/page';
import { getRouteWithStops } from '@/lib/routes';
import {
  removeStopAsAdministrator,
  restoreStopAsAdministrator,
  settleStopAsAdministrator,
} from '@/lib/administratorRouteActions';
import { STOP_PROBLEM_REASONS } from '@/app/operator/components/StopCompletionDialog';
import type { Route, Stop } from '@/amplify/types';

// What an administrator's Stop actions do on the Route detail page: the
// plans themselves are tested in lib/administratorRouteActions.test.ts, so
// the actions are mocked at that edge and these cover what the page does
// with their results.

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'id' ? 'route-test-id-1234' : null) }),
}));

jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({ authStatus: 'authenticated', user: { userId: 'admin-1' } }),
}));

jest.mock('@/lib/amplify-config', () => ({
  isOperator: () => true,
  isCustomer: () => false,
  isAdmin: () => true,
}));

jest.mock('@/app/administrator/components/RouteRequestsCard', () => ({
  RouteRequestsCard: () => <div>Requests</div>,
}));

jest.mock('@/app/administrator/components/RouteEstimateCard', () => ({
  RouteEstimateCard: () => <div>Estimate</div>,
}));

jest.mock('@/app/components/OperatorRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/lib/routeWithStopsFeed', () => ({
  subscribeRouteWithStops: () => () => {},
}));

const mockFetched: { route: unknown; stops: unknown[] } = { route: null, stops: [] };
jest.mock('@/lib/routes', () => ({
  deleteStop: jest.fn(),
  resequenceStops: jest.fn().mockResolvedValue(undefined),
  getRouteWithStops: jest.fn(() => Promise.resolve({ ...mockFetched })),
  createStop: jest.fn(),
  deleteRoute: jest.fn(),
  updateRoute: jest.fn(),
  updateStop: jest.fn(),
}));

jest.mock('@/lib/invoices', () => ({ listRouteInvoices: jest.fn().mockResolvedValue([]) }));
jest.mock('@/lib/customers', () => ({
  getCustomer: jest.fn().mockResolvedValue({ id: 'cust-abcd-5678', name: 'Acme Corp', billingRatePerHour: 30 }),
}));

jest.mock('@/lib/administratorRouteActions', () => ({
  ...jest.requireActual('@/lib/administratorRouteActions'),
  settleStopAsAdministrator: jest.fn(),
  removeStopAsAdministrator: jest.fn(),
  restoreStopAsAdministrator: jest.fn(),
}));

const baseRoute: Route = {
  id: 'route-test-id-1234',
  routeCode: 'W19-26-001',
  customerId: 'cust-abcd-5678',
  status: 'in_progress',
  executionPhase: 'placement',
  createdAt: '2024-03-01T10:00:00Z',
};

const stops: Stop[] = [
  { id: 'stop-1', routeId: 'route-test-id-1234', sequence: 1, address: '100 First St' },
  { id: 'stop-2', routeId: 'route-test-id-1234', sequence: 2, address: '200 Second Ave' },
];

const settle = settleStopAsAdministrator as jest.Mock;
const remove = removeStopAsAdministrator as jest.Mock;
const restore = restoreStopAsAdministrator as jest.Mock;
const fetchCalls = () => (getRouteWithStops as jest.Mock).mock.calls.length;

async function loadPlacement() {
  render(<RouteDetailPage />);
  const buttons = await screen.findAllByRole('button', { name: 'Signs Placed' });
  return buttons[0];
}

describe('Administrator Stop actions on the Route detail page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetched.route = baseRoute;
    mockFetched.stops = stops;
  });

  it('settles the Stop as done and reloads the Route once it is saved', async () => {
    settle.mockResolvedValue({ ok: true });
    const done = await loadPlacement();
    const before = fetchCalls();

    fireEvent.click(done);

    await waitFor(() => expect(fetchCalls()).toBe(before + 1));
    expect(settle).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'route-test-id-1234' }),
      expect.objectContaining({ id: 'stop-1' }),
      { action: 'complete' }
    );
  });

  it('shows a refused action on that Stop and does not reload', async () => {
    settle.mockResolvedValue({ ok: false, error: 'Stops can only be settled while the route is on Placement or Pickup.', saved: false });
    const done = await loadPlacement();
    const before = fetchCalls();

    fireEvent.click(done);

    expect(await screen.findByRole('alert')).toHaveTextContent('Stops can only be settled');
    expect(fetchCalls()).toBe(before);
  });

  it('reloads and shows the error when the Stop saved but its audit entry did not', async () => {
    settle.mockResolvedValue({ ok: false, error: 'Saved, but the audit entry was not written.', saved: true });
    const done = await loadPlacement();
    const before = fetchCalls();

    fireEvent.click(done);

    expect(await screen.findByRole('alert')).toHaveTextContent('audit entry was not written');
    await waitFor(() => expect(fetchCalls()).toBe(before + 1));
  });

  it("removes the Stop with the chosen reason when it can't be placed", async () => {
    remove.mockResolvedValue({ ok: true });
    await loadPlacement();

    fireEvent.click(screen.getAllByRole('button', { name: "Can't place" })[0]);
    expect(remove).not.toHaveBeenCalled();
    const reason = STOP_PROBLEM_REASONS.placement[0];
    fireEvent.click(await screen.findByRole('button', { name: reason }));

    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'stop-1' }), reason)
    );
  });

  it("settles the Stop as Couldn't Collect with the chosen reason during Pickup", async () => {
    mockFetched.route = { ...baseRoute, executionPhase: 'pickup' };
    settle.mockResolvedValue({ ok: true });
    render(<RouteDetailPage />);

    fireEvent.click((await screen.findAllByRole('button', { name: "Couldn't collect" }))[0]);
    const reason = STOP_PROBLEM_REASONS.pickup[0];
    fireEvent.click(await screen.findByRole('button', { name: reason }));

    await waitFor(() =>
      expect(settle).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'stop-1' }), {
        action: 'couldntCollect',
        reason,
      })
    );
  });

  it('puts a Removed Stop back through the restore action', async () => {
    mockFetched.route = { ...baseRoute, executionPhase: 'unload', loadConfirmedAt: '2026-10-04T13:24:27.986Z' };
    mockFetched.stops = [
      ...stops,
      { id: 'stop-3', routeId: 'route-test-id-1234', sequence: 3, address: '300 Third Rd', removed: true, removedAt: '2026-10-04T13:24:16.967Z' },
    ];
    restore.mockResolvedValue({ ok: true });
    render(<RouteDetailPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(restore).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'stop-3' })));
  });
});
