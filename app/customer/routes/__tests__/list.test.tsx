'use client';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import RoutesPage from '../page';
import { useLiveRoutes } from '@/lib/useLiveRoutes';
import type { Route } from '@/amplify/types';
import { getCustomerPortalContext } from '@/lib/customers';

// Mock Next.js router first
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

// Mock the amplify config utilities
jest.mock('@/lib/amplify-config', () => ({
  isCustomer: () => true,
  isOperator: () => false,
  fetchUserGroups: jest.fn().mockResolvedValue(['customer']),
}));

// Mock the authentication
jest.mock('@/lib/use-user-groups', () => ({
  useCurrentUserId: () => 'viewer-sub-1',
}));

// Mock the queries
jest.mock('@/lib/useLiveRoutes', () => ({
  useLiveRoutes: jest.fn(),
}));
jest.mock('@/lib/customers', () => ({
  getCustomerPortalContext: jest.fn(),
}));

// Mock the session utilities
jest.mock('@/app/auth/session', () => ({
  getCurrentCustomerId: (_user: any) => 'viewer-sub-1',
}));

// Render children directly: the real ProtectedRoute fetches user groups
// asynchronously, which races the page assertions below.
jest.mock('@/app/components/ProtectedRoute', () => {
  return function MockProtectedRoute({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  };
});

// The status chips and the RouteStatusPill badges can render the same text
// (e.g. "Signs placed"), so chip clicks must be scoped to the filter row.
function clickStatusChip(label: string | RegExp) {
  const chips = document.querySelector('.chips') as HTMLElement;
  fireEvent.click(within(chips).getByText(label));
}

// Routes W01-26-001, W01-26-002, ... for tests that need more than one page.
const makeRoutes = (count: number): Route[] =>
  Array.from({ length: count }, (_, index) => {
    const seq = String(index + 1).padStart(3, '0');
    return {
      id: `route-${seq}`,
      customerId: 'test-customer-1',
      routeCode: `W01-26-${seq}`,
      status: index % 2 === 0 ? 'planned' : 'completed',
      createdAt: '2026-01-01T00:00:00Z',
    } as Route;
  });
const hrefs = () => screen.getAllByRole('link').map((link) => link.getAttribute('href'));
const next = () => screen.getByRole('button', { name: 'Next page of routes' });
const previous = () => screen.getByRole('button', { name: 'Previous page of routes' });

describe('Customer Routes List Page', () => {
  const mockRoutes: Route[] = [
    {
      id: 'route-1',
      customerId: 'test-customer-1',
      status: 'planned',
      estimatedDurationMinutes: 120,
      createdAt: '2024-01-15T10:00:00Z',
    },
    {
      id: 'route-2',
      customerId: 'test-customer-1',
      status: 'completed',
      estimatedDurationMinutes: 90,
      actualDurationMinutes: 130,
      createdAt: '2024-01-14T09:00:00Z',
    },
    {
      id: 'route-3',
      customerId: 'test-customer-1',
      status: 'signs_placed',
      estimatedDurationMinutes: 150,
      createdAt: '2024-01-16T11:00:00Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'read_only',
      customerId: 'test-customer-1',
    });
    (useLiveRoutes as jest.Mock).mockReturnValue({ routes: [], loading: true, error: null });
  });

  it('fetches and displays routes on mount', async () => {
    (useLiveRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading routes/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/^Routes$/i)).toBeInTheDocument();
  });

  it('displays error message when fetch fails', async () => {
    (useLiveRoutes as jest.Mock).mockReturnValue({ routes: [], loading: false, error: 'Failed to load routes' });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load routes/i)).toBeInTheDocument();
    });
  });

  it('filters routes by phase, with no separate Archived chip', async () => {
    (useLiveRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading routes/i)).not.toBeInTheDocument();
    });

    expect(screen.queryByText(/^Archived$/i)).not.toBeInTheDocument();

    clickStatusChip(/^Signs placed$/i);

    await waitFor(() => {
      const routeLinks = screen.getAllByRole('link');
      expect(routeLinks.map((link) => link.getAttribute('href'))).toEqual(['/customer/routes/route-3']);
    });
  });

  it('displays correct route count for each filter', async () => {
    (useLiveRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading routes/i)).not.toBeInTheDocument();
    });

    // Status filter should exist
    const statusLabels = screen.getAllByText(/Status/i);
    expect(statusLabels.length).toBeGreaterThan(0);
  });

  it('sorts by route id descending by default', async () => {
    (useLiveRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });

    render(<RoutesPage />);

    // The route list is derived from fetched data in a second effect, so it
    // settles one tick after the loading spinner disappears — findAllByRole
    // waits for that instead of asserting on a possibly-stale render.
    const routeLinks = await screen.findAllByRole('link');
    expect(routeLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/customer/routes/route-3',
      '/customer/routes/route-2',
      '/customer/routes/route-1',
    ]);
  });

  it('shows Duration as N/A until a route is completed, then its actual duration', async () => {
    (useLiveRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });

    render(<RoutesPage />);

    await screen.findAllByRole('link');

    expect(screen.getAllByText('N/A')).toHaveLength(2); // route-1 (planned), route-3 (signs_placed)
    expect(screen.getByText('2h 10m')).toBeInTheDocument(); // route-2 (completed), from actualDurationMinutes
  });

  it('prefers the finalised override duration over actualDurationMinutes once completed', async () => {
    (useLiveRoutes as jest.Mock).mockReturnValue({
      routes: [
        {
          id: 'route-2',
          customerId: 'test-customer-1',
          status: 'completed',
          actualDurationMinutes: 130,
          overrideDurationMinutes: 150,
          createdAt: '2024-01-14T09:00:00Z',
        },
      ],
      loading: false,
      error: null,
    });

    render(<RoutesPage />);

    await screen.findAllByRole('link');

    expect(screen.getByText('2h 30m')).toBeInTheDocument();
  });

  it("shows each route's Date -- its scheduled or run date, not the import date (#314)", async () => {
    (useLiveRoutes as jest.Mock).mockReturnValue({
      routes: [
        { id: 'scheduled', customerId: 'test-customer-1', routeCode: 'W10-26-001', status: 'planned', scheduledDate: '2026-03-02', createdAt: '2026-09-18T04:00:00Z' },
        { id: 'imported', customerId: 'test-customer-1', routeCode: 'W02-24-001', status: 'completed', actualStartTime: '2024-01-15T00:00:00Z', createdAt: '2026-09-18T04:00:00Z' },
      ] as Route[],
      loading: false,
      error: null,
    });

    render(<RoutesPage />);

    await screen.findAllByRole('link');
    expect(screen.getByRole('columnheader', { name: 'Date' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Created' })).not.toBeInTheDocument();
    expect(screen.getByText('Mar 2, 2026')).toBeInTheDocument();
    expect(screen.getByText('Jan 15, 2024')).toBeInTheDocument();
    expect(screen.queryByText('Sep 18, 2026')).not.toBeInTheDocument();
  });

  it('handles empty route list gracefully', async () => {
    (useLiveRoutes as jest.Mock).mockReturnValue({ routes: [], loading: false, error: null });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading routes/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/No routes found/i)).toBeInTheDocument();
  });

  it('filters routes by route code search text', async () => {
    (useLiveRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading routes/i)).not.toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/search route code/i), { target: { value: 'route-2' } });

    await waitFor(() => {
      const routeLinks = screen.getAllByRole('link');
      expect(routeLinks.map((link) => link.getAttribute('href'))).toEqual(['/customer/routes/route-2']);
    });

    expect(screen.getByText('Showing 1–1 of 1 routes')).toBeInTheDocument();
  });

  it('calls useLiveRoutes with the portal context customer ID instead of the user sub', async () => {
    (useLiveRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(useLiveRoutes).toHaveBeenCalledWith('test-customer-1');
    });
  });

  it('reflects a live status change pushed after the initial render, without a manual reload', async () => {
    (useLiveRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });

    const { rerender } = render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading routes/i)).not.toBeInTheDocument();
    });
    clickStatusChip(/^Signs placed$/i);
    await waitFor(() => {
      const routeLinks = screen.getAllByRole('link');
      expect(routeLinks.map((link) => link.getAttribute('href'))).toEqual(['/customer/routes/route-3']);
    });

    // route-3 moves to 'completed' server-side — a live update should push
    // that through useLiveRoutes and drop it out of the active filter.
    (useLiveRoutes as jest.Mock).mockReturnValue({
      routes: mockRoutes.map((route) => (route.id === 'route-3' ? { ...route, status: 'completed' } : route)),
      loading: false,
      error: null,
    });
    rerender(<RoutesPage />);

    await waitFor(() => {
      expect(screen.queryAllByRole('link')).toHaveLength(0);
    });
  });

  describe('with more than one page of routes', () => {

    async function renderOnPageTwo(routes: Route[]) {
      (useLiveRoutes as jest.Mock).mockReturnValue({ routes, loading: false, error: null });
      const view = render(<RoutesPage />);
      await screen.findByText(`Showing 1–25 of ${routes.length} routes`);
      fireEvent.click(next());
      return view;
    }

    it('shows the newest 25 routes, then the rest on the next page', async () => {
      (useLiveRoutes as jest.Mock).mockReturnValue({ routes: makeRoutes(30), loading: false, error: null });

      render(<RoutesPage />);

      await screen.findByText('Showing 1–25 of 30 routes');
      expect(hrefs()).toHaveLength(25);
      expect(hrefs()[0]).toBe('/customer/routes/route-030');
      expect(previous()).toBeDisabled();
      expect(screen.getByText(/Click on any route to view details and stops/)).toBeInTheDocument();

      fireEvent.click(next());

      expect(screen.getByText('Showing 26–30 of 30 routes')).toBeInTheDocument();
      expect(hrefs()).toEqual([
        '/customer/routes/route-005',
        '/customer/routes/route-004',
        '/customer/routes/route-003',
        '/customer/routes/route-002',
        '/customer/routes/route-001',
      ]);
      expect(next()).toBeDisabled();
    });

    it('returns to page 1 when the phase chip changes', async () => {
      await renderOnPageTwo(makeRoutes(60));
      expect(screen.getByText('Showing 26–50 of 60 routes')).toBeInTheDocument();

      clickStatusChip(/^Planned$/i);
      clickStatusChip(/^All$/i);

      expect(screen.getByText('Showing 1–25 of 60 routes')).toBeInTheDocument();
    });

    it('returns to page 1 when the search text changes', async () => {
      await renderOnPageTwo(makeRoutes(60));

      fireEvent.change(screen.getByLabelText(/search route code/i), { target: { value: 'W01' } });

      expect(screen.getByText('Showing 1–25 of 60 routes')).toBeInTheDocument();
    });

    it('stays on the same page when a live update adds a route', async () => {
      const { rerender } = await renderOnPageTwo(makeRoutes(30));

      (useLiveRoutes as jest.Mock).mockReturnValue({ routes: makeRoutes(31), loading: false, error: null });
      rerender(<RoutesPage />);

      expect(screen.getByText('Showing 26–31 of 31 routes')).toBeInTheDocument();
    });

    it('moves back to the last page when a live update removes the current one', async () => {
      const { rerender } = await renderOnPageTwo(makeRoutes(30));

      (useLiveRoutes as jest.Mock).mockReturnValue({ routes: makeRoutes(20), loading: false, error: null });
      rerender(<RoutesPage />);

      expect(screen.getByText('Showing 1–20 of 20 routes')).toBeInTheDocument();
      expect(hrefs()).toHaveLength(20);
    });

    it('shows no pagination bar when there are no routes', async () => {
      (useLiveRoutes as jest.Mock).mockReturnValue({ routes: [], loading: false, error: null });

      render(<RoutesPage />);

      await screen.findByText(/No routes found/i);
      expect(screen.queryByRole('navigation', { name: 'routes pagination' })).not.toBeInTheDocument();
    });
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

    it('renders a stacked RouteCard list instead of the DataTable', async () => {
      (useLiveRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });

      render(<RoutesPage />);

      const routeLinks = await screen.findAllByRole('link');
      expect(routeLinks.map((link) => link.getAttribute('href')).sort()).toEqual(
        ['/customer/routes/route-1', '/customer/routes/route-2', '/customer/routes/route-3'].sort()
      );
      expect(screen.queryByText('Route ID')).not.toBeInTheDocument();
    });

    it('pages the card list 25 at a time too', async () => {
      (useLiveRoutes as jest.Mock).mockReturnValue({ routes: makeRoutes(30), loading: false, error: null });

      render(<RoutesPage />);

      await screen.findByText('Showing 1–25 of 30 routes');
      expect(hrefs()).toHaveLength(25);
      fireEvent.click(next());
      expect(hrefs()).toHaveLength(5);
    });

    it('shows an empty-state message when there are no routes', async () => {
      (useLiveRoutes as jest.Mock).mockReturnValue({ routes: [], loading: false, error: null });

      render(<RoutesPage />);

      await waitFor(() => {
        expect(screen.getByText(/No routes found/i)).toBeInTheDocument();
      });
    });
  });
});
