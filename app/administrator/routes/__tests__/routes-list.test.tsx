import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RoutesPage from '../page';
import * as listAllRoutesModule from '@/lib/queries/ListAllRoutes';
import * as listAllCustomersModule from '@/lib/queries/ListAllCustomers';
import type { Route } from '@/amplify/types';

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

jest.mock('@/lib/queries/ListAllRoutes');
jest.mock('@/lib/queries/ListAllCustomers');

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
  });

  it('renders loading spinner initially', async () => {
    // Never resolves during this check
    (listAllRoutesModule.listAllRoutes as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<RoutesPage />);
    expect(screen.getByText(/loading routes/i)).toBeInTheDocument();
  });

  it('renders routes list after data loads', async () => {
    (listAllRoutesModule.listAllRoutes as jest.Mock).mockResolvedValue({
      data: mockRoutes,
      errors: undefined,
    });

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
    (listAllRoutesModule.listAllRoutes as jest.Mock).mockResolvedValue({
      data: [],
      errors: undefined,
    });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.queryByText(/loading routes/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/create new route/i)).toBeInTheDocument();
  });

  it('shows empty state when no routes', async () => {
    (listAllRoutesModule.listAllRoutes as jest.Mock).mockResolvedValue({
      data: [],
      errors: undefined,
    });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.getByText(/no routes found/i)).toBeInTheDocument();
    });
  });

  it('shows error when fetch fails', async () => {
    (listAllRoutesModule.listAllRoutes as jest.Mock).mockResolvedValue({
      data: [],
      errors: [{ message: 'Network error' }],
    });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load routes/i)).toBeInTheDocument();
    });
  });

  it('shows a Retry button on fetch error and refetches when clicked', async () => {
    (listAllRoutesModule.listAllRoutes as jest.Mock)
      .mockResolvedValueOnce({
        data: [],
        errors: [{ message: 'Network error' }],
      })
      .mockResolvedValueOnce({
        data: mockRoutes,
        errors: undefined,
      });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load routes/i)).toBeInTheDocument();
    });

    const retryButton = screen.getByRole('button', { name: /retry/i });
    expect(retryButton).toBeInTheDocument();

    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText('W19-26-001')).toBeInTheDocument();
    });

    expect(listAllRoutesModule.listAllRoutes).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/failed to load routes/i)).not.toBeInTheDocument();
  });

  it('shows a create CTA in the empty state linking to the new route page', async () => {
    (listAllRoutesModule.listAllRoutes as jest.Mock).mockResolvedValue({
      data: [],
      errors: undefined,
    });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.getByText(/no routes found/i)).toBeInTheDocument();
    });

    const cta = screen.getByRole('link', { name: /create your first route/i });
    expect(cta).toHaveAttribute('href', '/administrator/routes/new');
  });

  it('keeps the status filter visible when a filtered status has no routes', async () => {
    (listAllRoutesModule.listAllRoutes as jest.Mock).mockResolvedValue({
      data: mockRoutes,
      errors: undefined,
    });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.getByText('W19-26-001')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^archived$/i }));

    expect(screen.getByText(/no routes found/i)).toBeInTheDocument();
    // The filter row stays so the user can switch back.
    expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument();
    // The full-page empty CTA is reserved for a truly empty route list.
    expect(screen.queryByRole('link', { name: /create your first route/i })).not.toBeInTheDocument();
  });

  describe('search and date filters', () => {
    async function renderWithRoutes() {
      (listAllRoutesModule.listAllRoutes as jest.Mock).mockResolvedValue({
        data: mockRoutes,
        errors: undefined,
      });

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

  it('uses the admin-only guard on the routes page', () => {
    // Keep data requests pending so this assertion-only test does not race async state updates.
    (listAllRoutesModule.listAllRoutes as jest.Mock).mockReturnValue(new Promise(() => {}));
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
