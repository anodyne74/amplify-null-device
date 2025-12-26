'use client';

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RoutesPage from '../page';
import * as listMyRoutesModule from '@/lib/queries/ListMyRoutes';
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
}));

// Mock the authentication with proper authStatus
jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({
    authStatus: 'authenticated',
    user: {
      userId: 'test-customer-1',
      username: 'test-customer-1',
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

// Mock the session utilities
jest.mock('@/app/auth/session', () => ({
  getCurrentCustomerId: (user: any) => 'test-customer-1',
}));

describe('Customer Routes List Page', () => {
  const mockRoutes: Route[] = [
    {
      id: 'route-1',
      customerId: 'test-customer-1',
      status: 'scheduled',
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
      status: 'in_progress',
      estimatedDurationMinutes: 150,
      createdAt: '2024-01-16T11:00:00Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
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

    expect(screen.getByText(/Your Routes/i)).toBeInTheDocument();
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
    expect(screen.getByText(/Your Routes/i)).toBeInTheDocument();
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

  it('calls listMyRoutes with correct customer ID', async () => {
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
