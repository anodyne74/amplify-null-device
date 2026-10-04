import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Route, Stop } from '@/amplify/types';
import RouteDetailContent from '../[id]/_RouteDetailContent';
import type { RouteWithStopsFeedHandlers } from '@/lib/routeWithStopsFeed';
import { getRouteWithStops, updateRoute, updateRouteCustomerInstructions } from '@/lib/routes';
import { getCustomer, getCustomerPortalContext, listCustomerUsers } from '@/lib/customers';
import { listCustomerRouteRequests } from '@/lib/customerRouteRequests';

jest.mock('@/lib/use-user-groups', () => ({
  useCurrentUserId: () => 'viewer-sub-1',
}));

jest.mock('@/app/components/ProtectedRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/lib/customerRouteRequests', () => ({
  listCustomerRouteRequests: jest.fn(),
  downloadCustomerRouteRequestFile: jest.fn(),
}));

const mockCallApi = jest.fn();
jest.mock('@/lib/apiClient', () => ({
  ...jest.requireActual('@/lib/apiClient'),
  callApi: (...args: unknown[]) => mockCallApi(...args),
}));

jest.mock('@/lib/routes', () => ({
  getRouteWithStops: jest.fn(),
  updateRouteCustomerInstructions: jest.fn(),
  updateRoute: jest.fn(),
}));

jest.mock('@/lib/customers', () => ({
  getCustomer: jest.fn(),
  getCustomerPortalContext: jest.fn(),
  listCustomerUsers: jest.fn(),
}));

// Nothing is pushed live unless a test does so through mockFeed, so the
// one-shot getRouteWithStops fetch drives these tests by default.
const mockFeed: { handlers: RouteWithStopsFeedHandlers | null } = { handlers: null };
jest.mock('@/lib/routeWithStopsFeed', () => ({
  subscribeRouteWithStops: (_routeId: string, handlers: RouteWithStopsFeedHandlers) => {
    mockFeed.handlers = handlers;
    return () => {};
  },
}));

jest.mock('@/app/operator/components/RouteStopsMap', () => ({
  RouteStopsMap: ({
    stops,
    activeStopId,
    upcomingStopIds,
    mapTheme,
  }: {
    stops: Stop[];
    activeStopId?: string | null;
    upcomingStopIds?: string[];
    mapTheme?: string;
  }) => (
    <div
      data-testid="customer-route-map"
      data-stop-count={stops.length}
      data-active-stop={activeStopId ?? ''}
      data-upcoming-stops={(upcomingStopIds ?? []).join(',')}
      data-map-theme={mapTheme ?? ''}
    />
  ),
}));

describe('Customer route detail tracker', () => {
  // executionPhase 'load' = signs are still being collected, i.e. before sign
  // placement has begun — special instructions are still editable at this
  // point (see the dedicated locking test below for the 'placement' case).
  const route: Route = {
    id: 'route-1',
    routeCode: 'W19-26-001',
    customerId: 'cust-1',
    status: 'in_progress',
    executionPhase: 'load',
    createdAt: '2024-01-15T10:00:00Z',
  } as Route;

  const stops: Stop[] = [
    {
      id: 'stop-1',
      routeId: 'route-1',
      sequence: 1,
      address: '100 First St',
      latitude: -37.8136,
      longitude: 144.9631,
      numberOfSigns: 5,
      actualDepartureTime: '2024-01-15T11:00:00Z',
    },
    {
      id: 'stop-2',
      routeId: 'route-1',
      sequence: 2,
      address: '200 Second St',
      latitude: -37.8236,
      longitude: 144.9731,
      numberOfSigns: 3,
    },
    {
      id: 'stop-3',
      routeId: 'route-1',
      sequence: 3,
      address: '300 Third St',
      latitude: -37.8336,
      longitude: 144.9831,
      numberOfSigns: 4,
    },
  ] as Stop[];

  beforeEach(() => {
    jest.clearAllMocks();
    // The feedback card on a completed Route asks whether it's still open.
    mockCallApi.mockResolvedValue({ locked: null });
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'read_only',
      customerId: 'cust-1',
    });
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route,
      stops,
    });
    (updateRouteCustomerInstructions as jest.Mock).mockResolvedValue({ data: {}, errors: undefined });
    (updateRoute as jest.Mock).mockResolvedValue({ data: {}, errors: undefined });
    (getCustomer as jest.Mock).mockResolvedValue({ id: 'cust-1', agentOptions: ["Betty O'Shea", 'David Mun'] });
    (listCustomerUsers as jest.Mock).mockResolvedValue([]);
    (listCustomerRouteRequests as jest.Mock).mockResolvedValue([]);
  });

  it("shows an Account Owner and a read-only user the Route's requests (#360)", async () => {
    (listCustomerRouteRequests as jest.Mock).mockResolvedValue([
      {
        id: 'req',
        role: 'request',
        requesterName: 'Ann Agent',
        requesterEmail: 'ann@agency.test',
        recordedByNullDevice: false,
        sentAt: '2026-09-27T23:15:00.000Z',
        subject: 'Route for Tuesday',
        bodyText: 'Please see attached.',
        attachments: [],
      },
    ]);

    for (const role of ['account_owner', 'read_only']) {
      (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role, customerId: 'cust-1' });
      const { unmount } = render(<RouteDetailContent params={{ id: 'route-1' }} />);

      expect(await screen.findByText('Route for Tuesday')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Requests' }).closest('#requests')).not.toBeNull();
      unmount();
    }
    expect(listCustomerRouteRequests).toHaveBeenCalledWith('route-1');
  });

  it('lets a read-only customer user view their route tracker with map and stops', async () => {
    render(<RouteDetailContent params={{ id: 'route-1' }} />);

    expect(await screen.findByRole('heading', { name: /route w19-26-001/i })).toBeInTheDocument();

    const map = screen.getByTestId('customer-route-map');
    expect(map).toHaveAttribute('data-stop-count', '3');
    expect(map).toHaveAttribute('data-active-stop', 'stop-2');
    expect(map).toHaveAttribute('data-upcoming-stops', 'stop-3');
    expect(map).toHaveAttribute('data-map-theme', 'dark');
    // Next stop card is gated to the signs_placed/signs_picked_up phases (see the
    // dedicated locking tests below), so at 'load' phase it only appears once, in the list.
    expect(screen.getAllByText('200 Second St')).toHaveLength(1);

    await waitFor(() => {
      expect(getRouteWithStops).toHaveBeenCalledWith('route-1');
    });

    expect(screen.getByText('Signs out')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Placed (1/3)')).toBeInTheDocument();
  });

  it("shows the route's Date, the same value as the Routes list, instead of its created time (#314)", async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: { ...route, actualStartTime: '2024-01-15T00:00:00Z', createdAt: '2026-09-18T04:00:00Z' },
      stops,
    });

    render(<RouteDetailContent params={{ id: 'route-1' }} />);

    await screen.findByRole('heading', { name: /route w19-26-001/i });
    expect(screen.getByText('Placement date')).toBeInTheDocument();
    expect(screen.queryByText('Created')).not.toBeInTheDocument();
    // Once in the Date stat and once on the timeline's Planned step.
    expect(screen.getAllByText('Jan 15, 2024')).toHaveLength(2);
    expect(screen.queryByText(/Sep 18/)).not.toBeInTheDocument();
  });

  it('lets a customer add a special instruction for the route, attributed to a picked agent', async () => {
    render(<RouteDetailContent params={{ id: 'route-1' }} />);

    await screen.findByRole('heading', { name: /route w19-26-001/i });

    const agentField = await screen.findByLabelText(/posting as/i);
    fireEvent.change(agentField, { target: { value: 'David Mun' } });

    const instructionsField = screen.getByLabelText(/add an instruction for this route/i);
    fireEvent.change(instructionsField, { target: { value: 'Leave signs at side gate' } });
    fireEvent.click(screen.getByRole('button', { name: /add instruction/i }));

    await waitFor(() => {
      expect(updateRouteCustomerInstructions).toHaveBeenCalledWith('route-1', expect.any(String));
    });

    const [, savedValue] = (updateRouteCustomerInstructions as jest.Mock).mock.calls[0];
    const saved = JSON.parse(savedValue);
    expect(saved.entries).toEqual([
      expect.objectContaining({
        text: 'Leave signs at side gate',
        agentLabel: 'David Mun',
        authorSub: 'viewer-sub-1',
      }),
    ]);

    expect(await screen.findByText(/instruction added/i)).toBeInTheDocument();
    expect(screen.getByText('Leave signs at side gate')).toBeInTheDocument();
    expect(screen.getByText(/david mun ·/i)).toBeInTheDocument();
  });

  it("resolves an instruction's authorSub to a name from the CustomerUser directory, in place of agentLabel", async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: {
        ...route,
        customerInstructions: JSON.stringify({
          v: 1,
          entries: [
            {
              text: 'Use the side gate, front is blocked',
              agentLabel: 'David Mun',
              authorSub: 'owner-sub-1',
              createdAt: '2024-01-16T09:00:00Z',
            },
          ],
        }),
      },
      stops,
    });
    (listCustomerUsers as jest.Mock).mockResolvedValue([{ userSub: 'owner-sub-1', name: 'Priya Nair' }]);

    render(<RouteDetailContent params={{ id: 'route-1' }} />);

    await screen.findByRole('heading', { name: /route w19-26-001/i });

    expect(await screen.findByText(/priya nair ·/i)).toBeInTheDocument();
    expect(screen.queryByText(/david mun ·/i)).not.toBeInTheDocument();
  });

  it('falls back to the stored agentLabel when the author cannot be resolved (e.g. a read_only viewer looking at a teammate\'s entry)', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: {
        ...route,
        customerInstructions: JSON.stringify({
          v: 1,
          entries: [
            {
              text: 'Use the side gate, front is blocked',
              agentLabel: 'David Mun',
              authorSub: 'owner-sub-1',
              createdAt: '2024-01-16T09:00:00Z',
            },
          ],
        }),
      },
      stops,
    });
    // A read_only viewer's CustomerUser query only returns their own row.
    (listCustomerUsers as jest.Mock).mockResolvedValue([{ userSub: 'viewer-sub-1', name: 'The Viewer' }]);

    render(<RouteDetailContent params={{ id: 'route-1' }} />);

    await screen.findByRole('heading', { name: /route w19-26-001/i });

    expect(await screen.findByText(/david mun ·/i)).toBeInTheDocument();
  });

  it('locks special instructions once sign placement has begun, hiding the add-instruction form', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: { ...route, executionPhase: 'placement' },
      stops,
    });

    render(<RouteDetailContent params={{ id: 'route-1' }} />);

    await screen.findByRole('heading', { name: /route w19-26-001/i });

    expect(screen.getByText(/sign placement has already begun/i)).toBeInTheDocument();
    expect(screen.getByText(/sign placement has begun/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/add an instruction for this route/i)).not.toBeInTheDocument();
  });

  it('keeps special instructions locked for a completed route even without loadConfirmedAt set (legacy data)', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: { ...route, status: 'completed', executionPhase: undefined },
      stops,
    });

    render(<RouteDetailContent params={{ id: 'route-1' }} />);

    await screen.findByRole('heading', { name: /route w19-26-001/i });

    expect(screen.getByText(/sign placement has already begun/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/add an instruction for this route/i)).not.toBeInTheDocument();
  });

  it('shows the "Next stop" card only during the signs_placed/signs_picked_up phases', async () => {
    render(<RouteDetailContent params={{ id: 'route-1' }} />);
    await screen.findByRole('heading', { name: /route w19-26-001/i });
    expect(screen.queryByRole('heading', { name: /next stop/i })).not.toBeInTheDocument();

    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: { ...route, executionPhase: 'placement' },
      stops,
    });
    const { unmount } = render(<RouteDetailContent params={{ id: 'route-1' }} />);
    await screen.findAllByRole('heading', { name: /route w19-26-001/i });
    expect(await screen.findByRole('heading', { name: /next stop/i })).toBeInTheDocument();
    unmount();
  });

  it('collapses and re-expands the special instructions panel', async () => {
    render(<RouteDetailContent params={{ id: 'route-1' }} />);

    await screen.findByRole('heading', { name: /route w19-26-001/i });

    const toggle = screen.getByRole('button', { name: /collapse special instructions/i });
    expect(screen.getByLabelText(/add an instruction for this route/i)).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.queryByLabelText(/add an instruction for this route/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /expand special instructions/i }));
    expect(screen.getByLabelText(/add an instruction for this route/i)).toBeInTheDocument();
  });

  describe('narrow viewport', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation((query: string) => ({
          matches: true,
          media: query,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
        })),
      });
    });

    afterEach(() => {
      // @ts-expect-error -- cleanup of a property only this describe block defines
      delete window.matchMedia;
    });

    it('renders the route map before the stop list', async () => {
      render(<RouteDetailContent params={{ id: 'route-1' }} />);

      await screen.findByRole('heading', { name: /route w19-26-001/i });

      const headings = screen.getAllByRole('heading', { name: /route map|stops \(3\)/i });
      expect(headings.map((h) => h.textContent)).toEqual(['Route map', 'Stops (3)']);
    });
  });

  it('shows a legacy plain-text customerInstructions value as an unattributed feed entry', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: { ...route, customerInstructions: 'Old freeform note from before this feature' },
      stops,
    });

    render(<RouteDetailContent params={{ id: 'route-1' }} />);

    await screen.findByRole('heading', { name: /route w19-26-001/i });

    expect(screen.getByText('Old freeform note from before this feature')).toBeInTheDocument();
  });

  it('only shows the feedback card for a completed route, and sends All good in one click (#467)', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: { ...route, status: 'completed' },
      stops,
    });
    mockCallApi.mockImplementation(async (path: string) =>
      path === '/api/customer/route-feedback/status' ? { locked: null } : { success: true, emailed: false }
    );

    render(<RouteDetailContent params={{ id: 'route-1' }} />);

    await screen.findByRole('heading', { name: /route w19-26-001/i });

    expect(screen.getByRole('heading', { name: /how did this route go\?/i })).toBeInTheDocument();

    const allGood = screen.getByRole('button', { name: /^all good$/i });
    await waitFor(() => expect(allGood).toBeEnabled());
    fireEvent.click(allGood);

    await waitFor(() => {
      expect(mockCallApi).toHaveBeenCalledWith('/api/customer/route-feedback', { routeId: 'route-1', tone: 'good', note: '' });
    });
    expect(updateRoute).not.toHaveBeenCalled();
    expect(await screen.findByText(/feedback was sent/i)).toBeInTheDocument();
  });

  it('hides the feedback card for a route that is not completed', async () => {
    render(<RouteDetailContent params={{ id: 'route-1' }} />);

    await screen.findByRole('heading', { name: /route w19-26-001/i });

    expect(screen.queryByRole('heading', { name: /how did this route go\?/i })).not.toBeInTheDocument();
  });

  it('reflects a live status change pushed over the live feed, without a manual reload', async () => {
    render(<RouteDetailContent params={{ id: 'route-1' }} />);

    expect(await screen.findByText('in progress')).toBeInTheDocument();

    // Simulate the AppSync subscription pushing a status change made
    // server-side (e.g. by an operator), independent of the one-shot fetch.
    act(() => mockFeed.handlers?.onRoute({ ...route, status: 'completed' }));

    expect(await screen.findByText('completed')).toBeInTheDocument();
    expect(screen.queryByText('in progress')).not.toBeInTheDocument();
  });

  it.each([
    [() => Promise.reject(new Error('boom')), 'Failed to load route details'],
    [() => Promise.resolve(null), 'Route not found'],
    [() => Promise.resolve({ route: { ...route, customerId: 'cust-other' }, stops }), 'You do not have permission to view this route'],
  ])('shows an error in place of the route: %#', async (fetched, message) => {
    (getRouteWithStops as jest.Mock).mockImplementation(fetched);

    render(<RouteDetailContent params={{ id: 'route-1' }} />);

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /route w19-26-001/i })).not.toBeInTheDocument();
  });

  it('shows the finalised override duration, not actualDurationMinutes, once a route is completed', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: { ...route, status: 'completed', actualDurationMinutes: 130, overrideDurationMinutes: 150 },
      stops,
    });

    render(<RouteDetailContent params={{ id: 'route-1' }} />);

    await screen.findByRole('heading', { name: /route w19-26-001/i });

    expect(screen.getByText('2h 30m')).toBeInTheDocument();
  });
});
