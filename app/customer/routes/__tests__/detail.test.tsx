import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Route, Stop } from '@/amplify/types';
import RouteDetailContent from '../[id]/_RouteDetailContent';
import {
  getCustomer,
  getCustomerPortalContext,
  listCustomerUsers,
} from '@/lib/queries';
import type { RouteWithStopsFeedHandlers } from '@/lib/routeWithStopsFeed';
import { getRouteWithStops, updateRoute, updateRouteCustomerInstructions } from '@/lib/routes';

jest.mock('@/lib/use-user-groups', () => ({
  useCurrentUserId: () => 'viewer-sub-1',
}));

jest.mock('@/app/components/ProtectedRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/lib/routes', () => ({
  getRouteWithStops: jest.fn(),
  updateRouteCustomerInstructions: jest.fn(),
  updateRoute: jest.fn(),
}));

jest.mock('@/lib/queries', () => ({
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
      serviceType: 'delivery',
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
      serviceType: 'delivery',
      numberOfSigns: 3,
    },
    {
      id: 'stop-3',
      routeId: 'route-1',
      sequence: 3,
      address: '300 Third St',
      latitude: -37.8336,
      longitude: 144.9831,
      serviceType: 'delivery',
      numberOfSigns: 4,
    },
  ] as Stop[];

  beforeEach(() => {
    jest.clearAllMocks();
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'read_only',
      customerId: 'cust-1',
    });
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route,
      stops,
      errors: [],
    });
    (updateRouteCustomerInstructions as jest.Mock).mockResolvedValue({ data: {}, errors: undefined });
    (updateRoute as jest.Mock).mockResolvedValue({ data: {}, errors: undefined });
    (getCustomer as jest.Mock).mockResolvedValue({
      data: { id: 'cust-1', agentOptions: ["Betty O'Shea", 'David Mun'] },
      errors: undefined,
    });
    (listCustomerUsers as jest.Mock).mockResolvedValue({ data: [], errors: undefined });
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
      errors: [],
    });
    (listCustomerUsers as jest.Mock).mockResolvedValue({
      data: [{ userSub: 'owner-sub-1', name: 'Priya Nair' }],
      errors: undefined,
    });

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
      errors: [],
    });
    // A read_only viewer's CustomerUser query only returns their own row.
    (listCustomerUsers as jest.Mock).mockResolvedValue({
      data: [{ userSub: 'viewer-sub-1', name: 'The Viewer' }],
      errors: undefined,
    });

    render(<RouteDetailContent params={{ id: 'route-1' }} />);

    await screen.findByRole('heading', { name: /route w19-26-001/i });

    expect(await screen.findByText(/david mun ·/i)).toBeInTheDocument();
  });

  it('locks special instructions once sign placement has begun, hiding the add-instruction form', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: { ...route, executionPhase: 'placement' },
      stops,
      errors: [],
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
      errors: [],
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
      errors: [],
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
      errors: [],
    });

    render(<RouteDetailContent params={{ id: 'route-1' }} />);

    await screen.findByRole('heading', { name: /route w19-26-001/i });

    expect(screen.getByText('Old freeform note from before this feature')).toBeInTheDocument();
  });

  it('only shows the feedback card for a completed route, and lets a customer send it', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: { ...route, status: 'completed' },
      stops,
      errors: [],
    });

    render(<RouteDetailContent params={{ id: 'route-1' }} />);

    await screen.findByRole('heading', { name: /route w19-26-001/i });

    expect(screen.getByRole('heading', { name: /how did this route go\?/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^all good$/i }));
    fireEvent.click(screen.getByRole('button', { name: /send feedback/i }));

    await waitFor(() => {
      expect(updateRoute).toHaveBeenCalledWith('route-1', {
        customerFeedbackTone: 'good',
        customerFeedbackNote: '',
      });
    });

    expect(await screen.findByText(/feedback sent/i)).toBeInTheDocument();
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
    [{ route: null, stops: [], errors: [{ message: 'boom' }] }, 'Failed to load route details'],
    [{ route: null, stops: [], errors: [] }, 'Route not found'],
    [{ route: { ...route, customerId: 'cust-other' }, stops, errors: [] }, 'You do not have permission to view this route'],
  ])('shows an error in place of the route: %#', async (fetched, message) => {
    (getRouteWithStops as jest.Mock).mockResolvedValue(fetched);

    render(<RouteDetailContent params={{ id: 'route-1' }} />);

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /route w19-26-001/i })).not.toBeInTheDocument();
  });

  it('shows the finalised override duration, not actualDurationMinutes, once a route is completed', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: { ...route, status: 'completed', actualDurationMinutes: 130, overrideDurationMinutes: 150 },
      stops,
      errors: [],
    });

    render(<RouteDetailContent params={{ id: 'route-1' }} />);

    await screen.findByRole('heading', { name: /route w19-26-001/i });

    expect(screen.getByText('2h 30m')).toBeInTheDocument();
  });
});
