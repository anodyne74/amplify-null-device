import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import RouteDetailPage from '../detail/page';
import * as getRouteDetailModule from '@/lib/queries/GetRouteDetail';
import * as deleteStopModule from '@/lib/queries/DeleteStop';
import type { Route, Stop } from '@/amplify/types';

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
jest.mock('@/app/components/OperatorRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock query modules
jest.mock('@/lib/queries/GetRouteDetail');
jest.mock('@/lib/queries/DeleteStop');
jest.mock('@/lib/queries', () => ({
  getCustomer: jest.fn().mockResolvedValue({ data: { id: 'cust-abcd-5678', name: 'Acme Corp' }, errors: undefined }),
  createStop: jest.fn().mockResolvedValue({ data: { id: 'new-stop' }, errors: undefined }),
  deleteRoute: jest.fn().mockResolvedValue({ data: {}, errors: undefined }),
}));
jest.mock('@/lib/queries/UpdateStop', () => ({
  updateStop: jest.fn().mockResolvedValue({ data: {}, errors: undefined }),
}));

// Mock generateClient from aws-amplify/data
// Note: factory is hoisted, so we define mocks inside and expose via module variable
let mockStopList: jest.Mock;
let mockRouteUpdate: jest.Mock;
let mockStopUpdate: jest.Mock;

jest.mock('aws-amplify/data', () => {
  const stopList = jest.fn();
  const routeUpdate = jest.fn();
  const stopUpdate = jest.fn();
  return {
    generateClient: jest.fn(() => ({
      models: {
        Stop: { list: stopList, update: stopUpdate },
        Route: { update: routeUpdate },
      },
    })),
    // expose for assignment below
    __mocks: { stopList, routeUpdate, stopUpdate },
  };
});

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
    serviceType: 'delivery',
  },
  {
    id: 'stop-2',
    routeId: 'route-test-id-1234',
    sequence: 2,
    address: '200 Second Ave',
    serviceType: 'pickup',
  },
];

describe('Operator Route Detail Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Grab the mocks from inside the factory
    const amplifyData = require('aws-amplify/data');
    const { __mocks } = amplifyData;
    mockStopList = __mocks.stopList;
    mockRouteUpdate = __mocks.routeUpdate;
    mockStopUpdate = __mocks.stopUpdate;

    (getRouteDetailModule.getRouteDetail as jest.Mock).mockResolvedValue({
      data: mockRoute,
      errors: undefined,
    });

    mockStopList.mockResolvedValue({
      data: mockStops,
      errors: undefined,
    });

    mockRouteUpdate.mockResolvedValue({ errors: undefined });
    mockStopUpdate.mockResolvedValue({ errors: undefined });

    (deleteStopModule.deleteStop as jest.Mock).mockResolvedValue({
      data: {},
      errors: undefined,
    });
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

  it('renders stops list', async () => {
    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('100 First St')).toBeInTheDocument();
    });

    expect(screen.getByText('200 Second Ave')).toBeInTheDocument();
  });

  it('shows "Add Stop" button', async () => {
    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.queryByText(/loading route/i)).not.toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /add stop/i })).toBeInTheDocument();
  });

  it('calls deleteStop when delete is confirmed', async () => {
    window.confirm = jest.fn(() => true);

    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /delete/i }).length).toBeGreaterThan(0);
    });

    const stopDeleteButtons = screen.getAllByRole('button', { name: /^delete$/i });
    fireEvent.click(stopDeleteButtons[0]);

    await waitFor(() => {
      expect(deleteStopModule.deleteStop).toHaveBeenCalledWith('stop-1');
    });
  });

  it('shows "Start Route" button for planned routes', async () => {
    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.queryByText(/loading route/i)).not.toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /start route/i })).toBeInTheDocument();
  });

  it('shows back link to routes list', async () => {
    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.queryByText(/loading route/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/← back to routes/i)).toBeInTheDocument();
  });

  it('shows "Signs Placed" action label for active placement stops', async () => {
    (getRouteDetailModule.getRouteDetail as jest.Mock).mockResolvedValue({
      data: {
        ...mockRoute,
        status: 'signs_placed',
        actualStartTime: '2024-03-01T10:00:00Z',
      },
      errors: undefined,
    });

    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /signs placed/i })).toBeInTheDocument();
    });
  });
});
