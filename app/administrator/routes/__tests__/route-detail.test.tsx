import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import RouteDetailPage from '../detail/page';
import type { RouteWithStopsFeedHandlers } from '@/lib/routeWithStopsFeed';
import type { Route, Stop } from '@/amplify/types';
import { deleteStop } from '@/lib/routes';

const mockOperatorRoute = jest.fn(({ children }: { children: React.ReactNode; requireAdmin?: boolean }) => <>{children}</>);

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => key === 'id' ? 'route-test-id-1234' : null }),
}));

// Mock Amplify UI
jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({
    authStatus: 'authenticated',
    user: {
      userId: 'op-1',
      signInUserSession: {
        idToken: { payload: { email: 'op@example.com', 'cognito:groups': ['operator'] } },
      },
    },
  }),
}));

// Mock amplify config
jest.mock('@/lib/amplify-config', () => ({
  isOperator: () => true,
  isCustomer: () => false,
  isAdmin: () => true,
}));

// Mock OperatorRoute to render children
jest.mock('@/app/administrator/components/RouteRequestsCard', () => ({
  RouteRequestsCard: () => <div>Requests</div>,
}));

jest.mock('@/app/components/OperatorRoute', () => ({
  __esModule: true,
  default: (props: { children: React.ReactNode; requireAdmin?: boolean }) => mockOperatorRoute(props),
}));

// Mock query modules
// Nothing is pushed live unless a test does so through mockFeed.
const mockFeed: { handlers: RouteWithStopsFeedHandlers | null } = { handlers: null };
jest.mock('@/lib/routeWithStopsFeed', () => ({
  subscribeRouteWithStops: (_routeId: string, handlers: RouteWithStopsFeedHandlers) => {
    mockFeed.handlers = handlers;
    return () => {};
  },
}));

// What getRouteWithStops resolves to; tests override route/stops per case.
const mockFetched: { route: unknown; stops: unknown[] } = { route: null, stops: [] };
jest.mock('@/lib/routes', () => ({
  deleteStop: jest.fn(),
  resequenceStops: jest.fn().mockResolvedValue(undefined),
  getRouteWithStops: jest.fn(() => Promise.resolve({ ...mockFetched })),
  createStop: jest.fn().mockResolvedValue({ data: { id: 'new-stop' }, errors: undefined }),
  deleteRoute: jest.fn().mockResolvedValue({ data: {}, errors: undefined }),
  updateRoute: jest.fn().mockResolvedValue({ data: {}, errors: undefined }),
  updateStop: jest.fn().mockResolvedValue({ data: {}, errors: undefined }),
}));

const mockListRouteInvoices = jest.fn();
jest.mock('@/lib/invoices', () => ({
  listRouteInvoices: (...args: unknown[]) => mockListRouteInvoices(...args),
}));

jest.mock('@/lib/customers', () => ({
  getCustomer: jest.fn().mockResolvedValue({ id: 'cust-abcd-5678', name: 'Acme Corp', billingRatePerHour: 30 }),
}));

const mockRoute: Route = {
  id: 'route-test-id-1234',
  routeCode: 'W19-26-001',
  customerId: 'cust-abcd-5678',
  status: 'planned',
  createdAt: '2024-03-01T10:00:00Z',
  notes: 'Test route notes',
};

const mockStops: Stop[] = [
  {
    id: 'stop-1',
    routeId: 'route-test-id-1234',
    sequence: 1,
    address: '100 First St',
  },
  {
    id: 'stop-2',
    routeId: 'route-test-id-1234',
    sequence: 2,
    address: '200 Second Ave',
  },
];

// A legacy-imported completed route: import-prep.js stamps every phase
// timestamp with the same single known date (no granular start/end was
// recorded).
const mockLegacyCompletedRoute: Route = {
  id: 'route-test-id-1234',
  routeCode: 'W14-25-001',
  customerId: 'cust-abcd-5678',
  status: 'completed',
  createdAt: '2024-03-01T10:00:00Z',
  actualDurationMinutes: 165,
  actualStartTime: '2025-04-15T00:00:00.000Z',
  actualEndTime: '2025-04-15T00:00:00.000Z',
  placementStartTime: '2025-04-15T00:00:00.000Z',
  placementEndTime: '2025-04-15T00:00:00.000Z',
  pickupStartTime: '2025-04-15T00:00:00.000Z',
  pickupEndTime: '2025-04-15T00:00:00.000Z',
};

const mockLegacyCompletedStops: Stop[] = [
  {
    id: 'stop-1',
    routeId: 'route-test-id-1234',
    sequence: 1,
    address: '100 First St',
    actualDepartureTime: '2025-04-15T00:00:00.000Z',
    numberOfSigns: 4,
  },
];

describe('Operator Route Detail Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockFetched.route = mockRoute;

    mockFetched.stops = mockStops;

    (deleteStop as jest.Mock).mockResolvedValue(undefined);
    mockListRouteInvoices.mockResolvedValue([]);
  });

  it('renders route information after loading', async () => {
    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.queryByText(/loading route/i)).not.toBeInTheDocument();
    });

    // Check route heading contains route code
    expect(screen.getByRole('heading', { name: /w19-26-001/i })).toBeInTheDocument();
    // Status badge span has exactly 'planned' as text content
    expect(screen.getByText('planned')).toBeInTheDocument();
    // Customer name is displayed
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('requires administrator access for the administrator route detail page', async () => {
    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.queryByText(/loading route/i)).not.toBeInTheDocument();
    });

    expect(mockOperatorRoute).toHaveBeenCalledWith(
      expect.objectContaining({ requireAdmin: true })
    );
  });

  it('renders stops list', async () => {
    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('100 First St')).toBeInTheDocument();
    });

    expect(screen.getByText('200 Second Ave')).toBeInTheDocument();
  });

  // Smoke test for the shared lib/stopStatusLabel wiring — full label-case
  // coverage (skip reasons, legacy-import fallback, etc.) lives in
  // lib/stopStatusLabel.test.ts so it isn't duplicated per portal.
  it('shows "Load signs" instead of "Awaiting placement" for a planned route (#5)', async () => {
    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('100 First St')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Load signs').length).toBeGreaterThan(0);
    expect(screen.queryByText('Awaiting placement')).not.toBeInTheDocument();
  });

  it('offers to settle every stop during Placement', async () => {
    mockFetched.route = { ...mockRoute, status: 'in_progress', executionPhase: 'placement' };

    render(<RouteDetailPage />);

    expect(await screen.findAllByRole('button', { name: 'Signs Placed' })).toHaveLength(2);
  });

  it('shows "Add Stop" button', async () => {
    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.queryByText(/loading route/i)).not.toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /add stop/i })).toBeInTheDocument();
  });

  it('calls deleteStop after confirming in the dialog', async () => {
    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /delete/i }).length).toBeGreaterThan(0);
    });

    const stopDeleteButtons = screen.getAllByRole('button', { name: /^delete$/i });
    fireEvent.click(stopDeleteButtons[0]);

    const dialog = screen.getByRole('alertdialog', { name: 'Delete stop?' });
    expect(deleteStop).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(deleteStop).toHaveBeenCalledWith('stop-1');
    });
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });

  it('does not call deleteStop when the confirmation dialog is cancelled', async () => {
    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /delete/i }).length).toBeGreaterThan(0);
    });

    const stopDeleteButtons = screen.getAllByRole('button', { name: /^delete$/i });
    fireEvent.click(stopDeleteButtons[0]);

    const dialog = screen.getByRole('alertdialog', { name: 'Delete stop?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(deleteStop).not.toHaveBeenCalled();
  });

  it('shows a read-only phase tracker for planned routes instead of transition buttons', async () => {
    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.queryByText(/loading route/i)).not.toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: /route phase/i })).toBeInTheDocument();
    expect(screen.getByText(/planned · phase 1 of 6/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start route/i })).not.toBeInTheDocument();
  });

  it('shows breadcrumb navigation back to the routes list', async () => {
    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.queryByText(/loading route/i)).not.toBeInTheDocument();
    });

    const breadcrumbs = screen.getByRole('navigation', { name: /breadcrumb/i });
    const routesLink = within(breadcrumbs).getByRole('link', { name: 'Routes' });
    expect(routesLink).toHaveAttribute('href', '/administrator/routes');
    expect(within(breadcrumbs).getByText(/route w19-26-001/i)).toHaveAttribute('aria-current', 'page');
  });

  it('shows a legacy-imported completed route\'s stops as done, not "Awaiting placement"', async () => {
    mockFetched.route = mockLegacyCompletedRoute;
    mockFetched.stops = mockLegacyCompletedStops;

    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('100 First St')).toBeInTheDocument();
    });

    expect(screen.queryByText('Awaiting placement')).not.toBeInTheDocument();
  });

  it('derives Time Taken/Amount from actualDurationMinutes, not the 15+15min load/unload floor', async () => {
    mockFetched.route = mockLegacyCompletedRoute;
    mockFetched.stops = mockLegacyCompletedStops;

    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /route summary/i })).toBeInTheDocument();
    });

    // 165 real minutes, not the 15+15=30min floor that identical phase start/end timestamps used to collapse to.
    expect(screen.getAllByText('2h 45m').length).toBeGreaterThan(0);
    expect(screen.queryByText('30 min')).not.toBeInTheDocument();
    // The Customer's $30/hr * 165min => $82.50, not the $15 the 30min floor produced.
    expect(screen.getByText('$82.50')).toBeInTheDocument();
  });

  it('excludes missing signs from "Total Number of Signs" — a stop returning 10 with 3 missing counts as 7', async () => {
    mockFetched.route = mockLegacyCompletedRoute;
    const stopsWithMissingSigns: Stop[] = [
      {
        id: 'stop-1',
        routeId: 'route-test-id-1234',
        sequence: 1,
        address: '100 First St',
        notes: '[PICKUP_DONE:2025-04-15T00:00:00.000Z]',
        numberOfSigns: 10,
        missingSignsCount: 3,
      },
    ];
    mockFetched.stops = stopsWithMissingSigns;

    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Total Number of Signs')).toBeInTheDocument();
    });

    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('lets an administrator correct the Billed Time of a completed Route, warning when it was invoiced', async () => {
    mockFetched.route = mockLegacyCompletedRoute;
    mockFetched.stops = mockLegacyCompletedStops;
    mockListRouteInvoices.mockResolvedValue([{ id: 'inv-1', invoiceNumber: 'ND-INV-128' }]);

    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /correct billed time/i })).toBeInTheDocument();
    });
    // A Route from before the Sign Run is corrected by its total.
    expect(screen.getByLabelText('Total charged (minutes)')).toHaveValue('165');
    expect(await screen.findByText(/Already invoiced on ND-INV-128/)).toBeInTheDocument();
    expect(mockListRouteInvoices).toHaveBeenCalledWith('route-test-id-1234');
  });

  it('offers no Billed Time correction before a Route is completed', async () => {
    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('100 First St')).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: /correct billed time/i })).not.toBeInTheDocument();
  });
});
