import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import RouteDetailPage from '../detail/page';
import { getCustomer } from '@/lib/queries';
import type { RouteWithStopsFeedHandlers } from '@/lib/routeWithStopsFeed';
import type { Route } from '@/amplify/types';

// GitHub issue #57: opening a route from the operator portal could hang on the
// loading spinner forever if `id` was missing on first render, or if anything
// after the initial route fetch threw — neither case ever flipped `loading`
// back to false or surfaced an error.

let searchParamId: string | null = 'route-test-id-1234';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'id' ? searchParamId : null) }),
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

jest.mock('@/app/components/OperatorRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/app/components/ToastProvider', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useToast: () => ({ showToast: jest.fn() }),
}));

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
  deleteStop: jest.fn().mockResolvedValue({ data: {}, errors: undefined }),
  getRouteWithStops: jest.fn(() => Promise.resolve({ ...mockFetched, errors: [] })),
  createStop: jest.fn().mockResolvedValue({ data: { id: 'new-stop' }, errors: undefined }),
  deleteRoute: jest.fn().mockResolvedValue({ data: {}, errors: undefined }),
  updateStopExecution: jest.fn().mockResolvedValue({ data: {}, errors: undefined }),
  updateRoute: jest.fn().mockResolvedValue({ data: {}, errors: undefined }),
  updateStop: jest.fn().mockResolvedValue({ data: {}, errors: undefined }),
}));

jest.mock('@/lib/queries', () => ({
  getCustomer: jest.fn(),
}));

const mockRoute: Route = {
  id: 'route-test-id-1234',
  routeCode: 'W19-26-001',
  customerId: 'cust-abcd-5678',
  status: 'planned',
  createdAt: '2024-03-01T10:00:00Z',
  notes: 'Test route notes',
};

describe('Operator Route Detail Page — load-failure handling (#57)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchParamId = 'route-test-id-1234';
    mockFetched.route = mockRoute;
    (getCustomer as jest.Mock).mockResolvedValue({ data: { id: 'cust-abcd-5678', name: 'Acme Corp' }, errors: undefined });
  });

  it('shows an error instead of an infinite spinner when no route id is present', async () => {
    searchParamId = null;

    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.queryByText(/loading route/i)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/no route was specified/i)).toBeInTheDocument();
  });

  it('shows an error instead of an infinite spinner when loading throws partway through', async () => {
    (getCustomer as jest.Mock).mockRejectedValue(new Error('network blip'));

    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.queryByText(/loading route/i)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/failed to load route/i)).toBeInTheDocument();
  });
});
