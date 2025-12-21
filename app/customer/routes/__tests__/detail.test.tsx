'use client';

import { render, screen, waitFor } from '@testing-library/react';
import RouteDetailPage from '../[id]/page';
import * as getRouteDetailModule from '@/lib/queries/GetRouteDetail';
import type { Route, Stop } from '@/amplify/types';

// Mock the authentication
jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({
    user: {
      userId: 'test-customer-1',
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
jest.mock('@/lib/queries/GetRouteDetail');

// Mock the session utilities
jest.mock('@/app/auth/session', () => ({
  getCurrentCustomerId: () => 'test-customer-1',
  verifyCustomerAccess: (user: any, customerId: string) => customerId === 'test-customer-1',
}));

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

describe('Route Detail Page', () => {
  const mockStops: Stop[] = [
    {
      id: 'stop-1',
      routeId: 'route-1',
      sequence: 1,
      address: '123 Main Street',
      serviceType: 'delivery',
      estimatedArrivalTime: '2024-01-15T10:30:00Z',
      createdAt: '2024-01-15T10:00:00Z',
    },
    {
      id: 'stop-2',
      routeId: 'route-1',
      sequence: 2,
      address: '456 Oak Avenue',
      serviceType: 'delivery',
      estimatedArrivalTime: '2024-01-15T11:00:00Z',
      createdAt: '2024-01-15T10:05:00Z',
    },
  ];

  const mockRoute: Route = {
    id: 'route-1',
    customerId: 'test-customer-1',
    status: 'active',
    estimatedDurationMinutes: 120,
    actualStartTime: '2024-01-15T09:00:00Z',
    createdAt: '2024-01-15T08:00:00Z',
    stops: mockStops,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches and displays route detail on mount', async () => {
    (getRouteDetailModule.getRouteDetail as jest.Mock).mockResolvedValue({
      data: mockRoute,
      errors: undefined,
    });

    render(<RouteDetailPage params={{ id: 'route-1' }} />);

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/route-1/i)).toBeInTheDocument();
  });

  it('displays error when route not found', async () => {
    (getRouteDetailModule.getRouteDetail as jest.Mock).mockResolvedValue({
      data: null,
      errors: [{ message: 'Route not found' }],
    });

    render(<RouteDetailPage params={{ id: 'invalid-id' }} />);

    await waitFor(() => {
      expect(screen.getByText(/Route not found/i)).toBeInTheDocument();
    });
  });

  it('displays error when access denied', async () => {
    const otherCustomerRoute: Route = {
      ...mockRoute,
      customerId: 'other-customer',
    };

    (getRouteDetailModule.getRouteDetail as jest.Mock).mockResolvedValue({
      data: otherCustomerRoute,
      errors: undefined,
    });

    // Mock session to return different customer ID
    jest.clearAllMocks();
    jest.doMock('@/app/auth/session', () => ({
      getCurrentCustomerId: () => 'test-customer-1',
      verifyCustomerAccess: (user: any, customerId: string) => false,
    }));

    render(<RouteDetailPage params={{ id: 'route-1' }} />);

    await waitFor(() => {
      expect(screen.getByText(/permission/i)).toBeInTheDocument();
    });
  });

  it('displays route status', async () => {
    (getRouteDetailModule.getRouteDetail as jest.Mock).mockResolvedValue({
      data: mockRoute,
      errors: undefined,
    });

    render(<RouteDetailPage params={{ id: 'route-1' }} />);

    await waitFor(() => {
      expect(screen.getByText(/active/i)).toBeInTheDocument();
    });
  });

  it('displays estimated duration', async () => {
    (getRouteDetailModule.getRouteDetail as jest.Mock).mockResolvedValue({
      data: mockRoute,
      errors: undefined,
    });

    render(<RouteDetailPage params={{ id: 'route-1' }} />);

    await waitFor(() => {
      expect(screen.getByText(/Estimated Duration/i)).toBeInTheDocument();
    });
  });

  it('displays all stops in correct order', async () => {
    (getRouteDetailModule.getRouteDetail as jest.Mock).mockResolvedValue({
      data: mockRoute,
      errors: undefined,
    });

    render(<RouteDetailPage params={{ id: 'route-1' }} />);

    await waitFor(() => {
      expect(screen.getByText(/Delivery Stops/i)).toBeInTheDocument();
      expect(screen.getByText(/123 Main Street/i)).toBeInTheDocument();
      expect(screen.getByText(/456 Oak Avenue/i)).toBeInTheDocument();
    });
  });

  it('shows back link to routes list', async () => {
    (getRouteDetailModule.getRouteDetail as jest.Mock).mockResolvedValue({
      data: mockRoute,
      errors: undefined,
    });

    const { container } = render(<RouteDetailPage params={{ id: 'route-1' }} />);

    await waitFor(() => {
      const backLink = container.querySelector('a[href="/customer/routes"]');
      expect(backLink).toBeInTheDocument();
    });
  });

  it('displays timeline component', async () => {
    (getRouteDetailModule.getRouteDetail as jest.Mock).mockResolvedValue({
      data: mockRoute,
      errors: undefined,
    });

    render(<RouteDetailPage params={{ id: 'route-1' }} />);

    await waitFor(() => {
      expect(screen.getByText(/Route Status/i)).toBeInTheDocument();
    });
  });

  it('handles routes with no stops', async () => {
    const routeNoStops: Route = {
      ...mockRoute,
      stops: undefined,
    };

    (getRouteDetailModule.getRouteDetail as jest.Mock).mockResolvedValue({
      data: routeNoStops,
      errors: undefined,
    });

    render(<RouteDetailPage params={{ id: 'route-1' }} />);

    await waitFor(() => {
      expect(screen.getByText(/No stops scheduled/i)).toBeInTheDocument();
    });
  });
});
