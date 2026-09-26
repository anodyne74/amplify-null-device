import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import RoutesPage from '../page';
import { useLiveAllRoutes } from '@/lib/useLiveRoutes';
import * as listAllCustomersModule from '@/lib/customers';
import { listAllStops } from '@/lib/routes';
import type { Route, Stop } from '@/amplify/types';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

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

jest.mock('@/lib/amplify-config', () => ({
  isOperator: () => true,
  isCustomer: () => false,
  isAdmin: () => true,
}));

const operatorRouteMock = jest.fn(({ children }: { children: React.ReactNode }) => <>{children}</>);

jest.mock('@/app/components/OperatorRoute', () => ({
  __esModule: true,
  default: (props: { children: React.ReactNode; requireAdmin?: boolean }) => operatorRouteMock(props),
}));

jest.mock('@/lib/useLiveRoutes', () => ({
  useLiveAllRoutes: jest.fn(),
}));
jest.mock('@/lib/customers');
jest.mock('@/lib/routes', () => ({
  listAllStops: jest.fn(),
}));

const mockRoutes: Route[] = [
  {
    id: 'route-aaaa-1111',
    routeCode: 'W19-26-001',
    customerId: 'cust-bbbb-2222',
    status: 'planned',
    createdAt: '2024-03-01T10:00:00Z',
  },
  {
    id: 'route-cccc-3333',
    routeCode: 'W19-26-002',
    customerId: 'cust-dddd-4444',
    status: 'signs_placed',
    createdAt: '2024-03-02T11:00:00Z',
  },
];

const mockStops: Stop[] = [
  {
    id: 'stop-1',
    routeId: 'route-aaaa-1111',
    customerId: 'cust-bbbb-2222',
    address: '14 Cliff Rd, Epping NSW 2121',
    agent: "Betty O'Shea",
    numberOfSigns: 3,
  },
  {
    id: 'stop-2',
    routeId: 'route-cccc-3333',
    customerId: 'cust-dddd-4444',
    address: '14 Cliff Rd, Epping NSW 2121',
    agent: "Betty O'Shea",
    numberOfSigns: 3,
  },
  {
    id: 'stop-3',
    routeId: 'route-aaaa-1111',
    customerId: 'cust-bbbb-2222',
    address: '19 Ryedale Rd, Eastwood NSW 2122',
    agent: 'Sam Whitton',
    numberOfSigns: 4,
  },
];

describe('Operator Routes List Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    operatorRouteMock.mockImplementation(({ children }: { children: React.ReactNode }) => <>{children}</>);
    (listAllCustomersModule.listAllCustomers as jest.Mock).mockResolvedValue({
      data: [
        { id: 'cust-bbbb-2222', name: 'Acme Corp', email: 'acme@example.com' },
        { id: 'cust-dddd-4444', name: 'Globex Inc', email: 'globex@example.com' },
      ],
      errors: undefined,
    });
    (listAllStops as jest.Mock).mockResolvedValue({
      data: mockStops,
      errors: undefined,
      nextToken: undefined,
    });
  });

  it('renders loading spinner initially', async () => {
    (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: [], loading: true, error: null });
    render(<RoutesPage />);
    expect(screen.getByText(/loading routes/i)).toBeInTheDocument();
  });

  it('renders routes list after data loads', async () => {
    (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.queryByText(/loading routes/i)).not.toBeInTheDocument();
    });

    // Route codes
    expect(screen.getByText('W19-26-001')).toBeInTheDocument();
    expect(screen.getByText('W19-26-002')).toBeInTheDocument();

    // Customer names
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Globex Inc')).toBeInTheDocument();
  });

  it('shows "Create New Route" link', async () => {
    (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: [], loading: false, error: null });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.queryByText(/loading routes/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/create new route/i)).toBeInTheDocument();
    // #62: was missing a size modifier class, leaving the pill with no horizontal padding.
    expect(screen.getByText(/create new route/i)).toHaveClass('nd-btn--md');
  });

  it('shows empty state when no routes', async () => {
    (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: [], loading: false, error: null });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.getByText(/no routes found/i)).toBeInTheDocument();
    });
  });

  it('shows error when fetch fails', async () => {
    (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: [], loading: false, error: 'Network error' });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load routes/i)).toBeInTheDocument();
    });
  });

  it('shows a Retry button on fetch error and refetches when clicked', async () => {
    (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: [], loading: false, error: 'Network error' });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load routes/i)).toBeInTheDocument();
    });

    const retryButton = screen.getByRole('button', { name: /retry/i });
    expect(retryButton).toBeInTheDocument();

    // Retry remounts the list section, which re-subscribes via useLiveAllRoutes.
    (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText('W19-26-001')).toBeInTheDocument();
    });

    expect(screen.queryByText(/failed to load routes/i)).not.toBeInTheDocument();
  });

  it('shows a create CTA in the empty state linking to the new route page', async () => {
    (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: [], loading: false, error: null });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.getByText(/no routes found/i)).toBeInTheDocument();
    });

    const cta = screen.getByRole('link', { name: /create your first route/i });
    expect(cta).toHaveAttribute('href', '/administrator/routes/new');
  });

  it('keeps the status filter visible when a filtered status has no routes', async () => {
    (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.getByText('W19-26-001')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^signs picked up$/i }));

    expect(screen.getByText(/no routes found/i)).toBeInTheDocument();
    // The filter row stays so the user can switch back.
    expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument();
    // The full-page empty CTA is reserved for a truly empty route list.
    expect(screen.queryByRole('link', { name: /create your first route/i })).not.toBeInTheDocument();
  });

  describe('search and date filters', () => {
    async function renderWithRoutes() {
      (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });

      render(<RoutesPage />);

      await waitFor(() => {
        expect(screen.getByText('W19-26-001')).toBeInTheDocument();
      });
    }

    it('narrows results by customer name search (case-insensitive)', async () => {
      await renderWithRoutes();

      fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'ACME' } });

      expect(screen.getByText('W19-26-001')).toBeInTheDocument();
      expect(screen.queryByText('W19-26-002')).not.toBeInTheDocument();
      expect(screen.getByText(/showing 1 of 2 routes/i)).toBeInTheDocument();
    });

    it('narrows results by route code search', async () => {
      await renderWithRoutes();

      fireEvent.change(screen.getByLabelText(/search/i), { target: { value: '26-002' } });

      expect(screen.getByText('W19-26-002')).toBeInTheDocument();
      expect(screen.queryByText('W19-26-001')).not.toBeInTheDocument();
    });

    it('shows the filtered empty message when search matches nothing', async () => {
      await renderWithRoutes();

      fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'no-such-route' } });

      expect(screen.getByText(/no routes found/i)).toBeInTheDocument();
      expect(screen.getByText(/showing 0 of 2 routes/i)).toBeInTheDocument();
      // Full-page empty CTA stays reserved for a truly empty list.
      expect(screen.queryByRole('link', { name: /create your first route/i })).not.toBeInTheDocument();
    });

    it('narrows results by created date range with inclusive bounds', async () => {
      await renderWithRoutes();

      // From-only bound: 2024-03-02 keeps the second route, drops the first.
      fireEvent.change(screen.getByLabelText(/created from/i), { target: { value: '2024-03-02' } });

      expect(screen.queryByText('W19-26-001')).not.toBeInTheDocument();
      expect(screen.getByText('W19-26-002')).toBeInTheDocument();

      // Inclusive To bound on the same day keeps the route visible.
      fireEvent.change(screen.getByLabelText(/created to/i), { target: { value: '2024-03-02' } });

      expect(screen.getByText('W19-26-002')).toBeInTheDocument();
      expect(screen.getByText(/showing 1 of 2 routes/i)).toBeInTheDocument();
    });

    it('filters by To date only', async () => {
      await renderWithRoutes();

      fireEvent.change(screen.getByLabelText(/created to/i), { target: { value: '2024-03-01' } });

      expect(screen.getByText('W19-26-001')).toBeInTheDocument();
      expect(screen.queryByText('W19-26-002')).not.toBeInTheDocument();
    });

    it('clears search and dates together via Clear filters', async () => {
      await renderWithRoutes();

      fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'globex' } });
      fireEvent.change(screen.getByLabelText(/created from/i), { target: { value: '2024-03-02' } });

      expect(screen.queryByText('W19-26-001')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));

      expect(screen.getByText('W19-26-001')).toBeInTheDocument();
      expect(screen.getByText('W19-26-002')).toBeInTheDocument();
      expect(screen.getByLabelText(/search/i)).toHaveValue('');
      expect(screen.getByLabelText(/created from/i)).toHaveValue('');
      expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();
    });

    it('composes search with the status filter', async () => {
      await renderWithRoutes();

      // Both routes match the shared "W19" prefix.
      fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'W19' } });

      expect(screen.getByText('W19-26-001')).toBeInTheDocument();
      expect(screen.getByText('W19-26-002')).toBeInTheDocument();

      // Status filter narrows to the signs_placed route only.
      fireEvent.click(screen.getByRole('button', { name: /^signs placed$/i }));

      expect(screen.queryByText('W19-26-001')).not.toBeInTheDocument();
      expect(screen.getByText('W19-26-002')).toBeInTheDocument();
      expect(screen.getByText(/showing 1 of 1 routes/i)).toBeInTheDocument();
    });
  });

  describe('find a property', () => {
    async function renderWithRoutes() {
      (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: mockRoutes, loading: false, error: null });

      render(<RoutesPage />);

      await waitFor(() => {
        expect(screen.getByText('W19-26-001')).toBeInTheDocument();
      });
    }

    it('shows the idle prompt before two characters are typed', async () => {
      await renderWithRoutes();

      expect(screen.getByText(/type at least two characters/i)).toBeInTheDocument();
    });

    it('narrows the routes table to routes containing a matched property', async () => {
      await renderWithRoutes();

      fireEvent.change(screen.getByLabelText(/property address, street, or suburb/i), {
        target: { value: 'ryedale' },
      });

      const table = within(screen.getByRole('table'));
      expect(table.getByText('W19-26-001')).toBeInTheDocument();
      expect(table.queryByText('W19-26-002')).not.toBeInTheDocument();
      expect(screen.getByText(/showing 1 of 2 routes with a property match/i)).toBeInTheDocument();
    });

    it('shows an amber no-results note when nothing matches', async () => {
      await renderWithRoutes();

      fireEvent.change(screen.getByLabelText(/property address, street, or suburb/i), {
        target: { value: 'nonexistent street' },
      });

      expect(screen.getByText(/no property matches/i)).toBeInTheDocument();
    });

    it('isolates a single route when its chip is clicked, and restores it via Show all routes', async () => {
      await renderWithRoutes();

      // "14 Cliff Rd" is on both mock routes, so both stay visible after the search.
      fireEvent.change(screen.getByLabelText(/property address, street, or suburb/i), {
        target: { value: 'cliff' },
      });

      const table = () => within(screen.getByRole('table'));
      expect(table().getByText('W19-26-001')).toBeInTheDocument();
      expect(table().getByText('W19-26-002')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Focus route W19-26-001' }));

      expect(screen.getByText(/showing w19-26-001 only/i)).toBeInTheDocument();
      expect(table().getByText('W19-26-001')).toBeInTheDocument();
      expect(table().queryByText('W19-26-002')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /show all routes/i }));

      expect(table().getByText('W19-26-001')).toBeInTheDocument();
      expect(table().getByText('W19-26-002')).toBeInTheDocument();
      expect(screen.queryByText(/showing w19-26-001 only/i)).not.toBeInTheDocument();
    });

    it('resets via Clear search in the property card', async () => {
      await renderWithRoutes();

      fireEvent.change(screen.getByLabelText(/property address, street, or suburb/i), {
        target: { value: 'ryedale' },
      });
      expect(screen.queryByText('W19-26-002')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /clear search/i }));

      expect(screen.getByLabelText(/property address, street, or suburb/i)).toHaveValue('');
      expect(screen.getByText('W19-26-001')).toBeInTheDocument();
      expect(screen.getByText('W19-26-002')).toBeInTheDocument();
    });

    it('composes with the status filter', async () => {
      await renderWithRoutes();

      // Both routes carry a stop at "14 Cliff Rd", so the property filter alone keeps both.
      fireEvent.change(screen.getByLabelText(/property address, street, or suburb/i), {
        target: { value: 'cliff' },
      });
      const table = () => within(screen.getByRole('table'));
      expect(table().getByText('W19-26-001')).toBeInTheDocument();
      expect(table().getByText('W19-26-002')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /^signs placed$/i }));

      expect(table().queryByText('W19-26-001')).not.toBeInTheDocument();
      expect(table().getByText('W19-26-002')).toBeInTheDocument();
    });
  });

  it('uses the admin-only guard on the routes page', () => {
    // Keep data requests pending so this assertion-only test does not race async state updates.
    (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: [], loading: true, error: null });
    (listAllCustomersModule.listAllCustomers as jest.Mock).mockReturnValue(new Promise(() => {}));

    render(<RoutesPage />);

    expect(operatorRouteMock).toHaveBeenCalled();
    expect(operatorRouteMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        requireAdmin: true,
      })
    );
  });
});
