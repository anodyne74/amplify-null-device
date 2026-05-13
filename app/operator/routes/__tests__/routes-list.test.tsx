import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RoutesPage from '../page';
import * as listAllRoutesModule from '@/lib/queries/ListAllRoutes';
import * as listAllCustomersModule from '@/lib/queries/ListAllCustomers';
import * as amplifyConfigModule from '@/lib/amplify-config';
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
  isOperator: jest.fn(() => true),
  isCustomer: jest.fn(() => false),
  isAdmin: jest.fn(() => true),
}));

jest.mock('@/app/components/OperatorRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
    (amplifyConfigModule.isAdmin as jest.Mock).mockReturnValue(true);
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

  it('hides "Create New Route" link for non-admin operators', async () => {
    (amplifyConfigModule.isAdmin as jest.Mock).mockReturnValue(false);
    (listAllRoutesModule.listAllRoutes as jest.Mock).mockResolvedValue({
      data: [],
      errors: undefined,
    });

    render(<RoutesPage />);

    await waitFor(() => {
      expect(screen.queryByText(/loading routes/i)).not.toBeInTheDocument();
    });

    expect(screen.queryByText(/create new route/i)).not.toBeInTheDocument();
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
});
