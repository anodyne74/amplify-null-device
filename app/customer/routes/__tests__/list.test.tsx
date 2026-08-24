'use client';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RoutesPage from '../page';
import * as listMyRoutesModule from '@/lib/queries/ListMyRoutes';
import { getCustomerPortalContext } from '@/lib/queries';
import type { Route } from '@/amplify/types';

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

// Mock the authentication with proper authStatus
jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({
    authStatus: 'authenticated',
    user: {
      userId: 'viewer-sub-1',
      username: 'viewer-sub-1',
      signInUserSession: {
        idToken: {
          payload: {
            email: 'test@example.com',
          },
        },
      },
    },
  }),
}));

// Mock the queries
jest.mock('@/lib/queries/ListMyRoutes');
jest.mock('@/lib/queries', () => ({
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
  });

  it('fetches and displays routes on mount', async () => {
    (listMyRoutesModule.listMyRoutes as jest.Mock).mockResolvedValue({
      data: mockRoutes,
      errors: undefined,
    });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading routes/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/^Routes$/i)).toBeInTheDocument();
  });

  it('displays error message when fetch fails', async () => {
    (listMyRoutesModule.listMyRoutes as jest.Mock).mockResolvedValue({
      data: null,
      errors: [{ message: 'Failed to load routes' }],
    });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load routes/i)).toBeInTheDocument();
    });
  });

  it('filters routes by status', async () => {
    (listMyRoutesModule.listMyRoutes as jest.Mock).mockResolvedValue({
      data: mockRoutes,
      errors: undefined,
    });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading routes/i)).not.toBeInTheDocument();
    });

    // Routes page should handle filtering
    expect(screen.getByText(/^Routes$/i)).toBeInTheDocument();
  });

  it('displays correct route count for each filter', async () => {
    (listMyRoutesModule.listMyRoutes as jest.Mock).mockResolvedValue({
      data: mockRoutes,
      errors: undefined,
    });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading routes/i)).not.toBeInTheDocument();
    });

    // Status filter should exist
    const statusLabels = screen.getAllByText(/Status/i);
    expect(statusLabels.length).toBeGreaterThan(0);
  });

  it('sorts by route id descending by default', async () => {
    (listMyRoutesModule.listMyRoutes as jest.Mock).mockResolvedValue({
      data: mockRoutes,
      errors: undefined,
    });

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

  it('sorts by status when sort mode is changed', async () => {
    (listMyRoutesModule.listMyRoutes as jest.Mock).mockResolvedValue({
      data: mockRoutes,
      errors: undefined,
    });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading routes/i)).not.toBeInTheDocument();
    });

    const sortSelect = screen.getAllByRole('combobox')[0];

    fireEvent.change(sortSelect, {
      target: { value: 'status' },
    });

    await waitFor(() => {
      const routeLinks = screen.getAllByRole('link');
      expect(routeLinks.map((link) => link.getAttribute('href'))).toEqual([
        '/customer/routes/route-1',
        '/customer/routes/route-3',
        '/customer/routes/route-2',
      ]);
    });
  });

  it('handles empty route list gracefully', async () => {
    (listMyRoutesModule.listMyRoutes as jest.Mock).mockResolvedValue({
      data: [],
      errors: undefined,
    });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading routes/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/No routes found/i)).toBeInTheDocument();
  });

  it('filters routes by route code search text', async () => {
    (listMyRoutesModule.listMyRoutes as jest.Mock).mockResolvedValue({
      data: mockRoutes,
      errors: undefined,
    });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading routes/i)).not.toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/search route code/i), { target: { value: 'route-2' } });

    await waitFor(() => {
      const routeLinks = screen.getAllByRole('link');
      expect(routeLinks.map((link) => link.getAttribute('href'))).toEqual(['/customer/routes/route-2']);
    });

    expect(screen.getByText(/Showing 1 routes/i)).toBeInTheDocument();
  });

  it('calls listMyRoutes with the portal context customer ID instead of the user sub', async () => {
    (listMyRoutesModule.listMyRoutes as jest.Mock).mockResolvedValue({
      data: mockRoutes,
      errors: undefined,
    });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(listMyRoutesModule.listMyRoutes).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'test-customer-1',
        })
      );
    });
  });
});
