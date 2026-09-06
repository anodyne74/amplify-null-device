import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdministratorDriversPage from '../page';
import { listOperators } from '@/lib/queries/ListOperators';
import { updateOperator } from '@/lib/queries/UpdateOperator';
import { listAllCustomers } from '@/lib/queries/ListAllCustomers';
import { listAllRoutes } from '@/lib/queries/ListAllRoutes';
import { listAllStops } from '@/lib/queries/ListAllStops';

jest.mock('@/app/components/OperatorRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: jest.fn(async () => ({
    tokens: { idToken: { toString: () => 'test-token' } },
  })),
}));

jest.mock('@/lib/queries/ListOperators', () => ({
  listOperators: jest.fn(),
}));

jest.mock('@/lib/queries/UpdateOperator', () => ({
  updateOperator: jest.fn(),
}));

jest.mock('@/lib/queries/ListAllCustomers', () => ({
  listAllCustomers: jest.fn(),
}));

jest.mock('@/lib/queries/ListAllRoutes', () => ({
  listAllRoutes: jest.fn(),
}));

jest.mock('@/lib/queries/ListAllStops', () => ({
  listAllStops: jest.fn(),
}));

describe('Administrator Drivers page', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      const action = init?.body ? JSON.parse(init.body as string).action : undefined;

      if (action === 'createUser') {
        return {
          ok: true,
          json: async () => ({ user: { sub: 'new-sub' }, created: true, emailSent: true }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          users: [
            { id: 'sub-1', name: 'Jane Driver', email: 'jane@nulldevice.dev' },
            { id: 'sub-2', name: 'Amir Driver', email: 'amir@nulldevice.dev' },
          ],
        }),
      };
    }) as jest.Mock;

    (listOperators as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 'sub-1',
          name: 'Jane Driver',
          email: 'jane@nulldevice.dev',
          status: 'active',
          vehicleAndRego: 'Van 1 · ABC123',
          homeBase: 'Ryde',
          driverSplitPercent: 30,
          payCycle: 'fortnightly',
          paySplitOnCompletedStopsOnly: true,
          assignedCustomerIds: ['cust-1'],
        },
        {
          id: 'sub-2',
          name: 'Amir Driver',
          email: 'amir@nulldevice.dev',
          status: 'onboarding',
          assignedCustomerIds: [],
        },
      ],
      errors: undefined,
    });

    (listAllCustomers as jest.Mock).mockResolvedValue({
      data: [
        { id: 'cust-1', name: 'Harcourts Epping' },
        { id: 'cust-2', name: 'Ray White Eastwood' },
      ],
      errors: undefined,
    });

    (updateOperator as jest.Mock).mockResolvedValue({ data: { id: 'sub-1' }, errors: undefined });
    (listAllRoutes as jest.Mock).mockResolvedValue({ data: [], errors: undefined, nextToken: undefined });
    (listAllStops as jest.Mock).mockResolvedValue({ data: [], errors: undefined, nextToken: undefined });
  });

  it('lists drivers merged with their Operator profile fields', async () => {
    render(<AdministratorDriversPage />);

    expect(await screen.findByText('Van 1 · ABC123')).toBeInTheDocument();
    expect(screen.getByText('based Ryde')).toBeInTheDocument();
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Onboarding').length).toBeGreaterThanOrEqual(1);
  });

  it('computes the route-based stat tiles and the per-driver monthly route count', async () => {
    const now = new Date();
    const isoThisMonth = new Date(now.getFullYear(), now.getMonth(), 10).toISOString();

    (listAllRoutes as jest.Mock).mockResolvedValue({
      data: [
        { id: 'r1', assignedOperatorSub: 'sub-1', actualEndTime: isoThisMonth, actualDurationMinutes: 240 },
        { id: 'r2', assignedOperatorSub: 'sub-1', actualEndTime: isoThisMonth, actualDurationMinutes: 300 },
      ],
      errors: undefined,
      nextToken: undefined,
    });
    (listAllStops as jest.Mock).mockResolvedValue({
      data: [
        { id: 's1', routeId: 'r1' },
        { id: 's2', routeId: 'r2' },
        { id: 's3', routeId: 'r2' },
      ],
      errors: undefined,
      nextToken: undefined,
    });

    render(<AdministratorDriversPage />);

    await screen.findByText('Van 1 · ABC123');

    expect(screen.getByText('3 stops serviced')).toBeInTheDocument();
    expect(screen.getByText('4h 30m')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Configure Jane Driver' }));
    expect(screen.getByText(/2 routes this month/)).toBeInTheDocument();
  });

  it('selects a driver and saves profile edits', async () => {
    render(<AdministratorDriversPage />);

    await screen.findByText('Van 1 · ABC123');
    fireEvent.click(screen.getByRole('button', { name: 'Configure Jane Driver' }));

    fireEvent.change(screen.getByLabelText(/vehicle and rego/i), { target: { value: 'Van 1 · XYZ999' } });
    fireEvent.click(screen.getByRole('button', { name: /save driver/i }));

    await waitFor(() => {
      expect(updateOperator).toHaveBeenCalledWith(
        'sub-1',
        expect.objectContaining({ vehicleAndRego: 'Van 1 · XYZ999' })
      );
    });
  });

  it('assigns a new customer to the selected driver', async () => {
    render(<AdministratorDriversPage />);

    await screen.findByText('Van 1 · ABC123');
    fireEvent.click(screen.getByRole('button', { name: 'Configure Jane Driver' }));

    fireEvent.change(screen.getByLabelText(/customer to assign/i), { target: { value: 'cust-2' } });
    fireEvent.click(screen.getByRole('button', { name: /assign customer/i }));

    await waitFor(() => {
      expect(updateOperator).toHaveBeenCalledWith('sub-1', { assignedCustomerIds: ['cust-1', 'cust-2'] });
    });
  });

  it('removes an assigned customer', async () => {
    render(<AdministratorDriversPage />);

    await screen.findByText('Van 1 · ABC123');
    fireEvent.click(screen.getByRole('button', { name: 'Configure Jane Driver' }));

    await screen.findByText('Harcourts Epping');
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));

    await waitFor(() => {
      expect(updateOperator).toHaveBeenCalledWith('sub-1', { assignedCustomerIds: [] });
    });
  });

  it('deactivates the selected driver', async () => {
    render(<AdministratorDriversPage />);

    await screen.findByText('Van 1 · ABC123');
    fireEvent.click(screen.getByRole('button', { name: 'Configure Jane Driver' }));
    fireEvent.click(screen.getByRole('button', { name: /deactivate/i }));

    await waitFor(() => {
      expect(updateOperator).toHaveBeenCalledWith('sub-1', { status: 'inactive' });
    });
  });

  it('resends the invite for an onboarding driver', async () => {
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      const action = init?.body ? JSON.parse(init.body as string).action : undefined;

      if (action === 'resendInvite') {
        return { ok: true, json: async () => ({ emailSent: true }) };
      }

      return {
        ok: true,
        json: async () => ({
          users: [
            { id: 'sub-1', name: 'Jane Driver', email: 'jane@nulldevice.dev' },
            { id: 'sub-2', name: 'Amir Driver', email: 'amir@nulldevice.dev' },
          ],
        }),
      };
    }) as jest.Mock;

    render(<AdministratorDriversPage />);

    await screen.findByText('Van 1 · ABC123');
    fireEvent.click(screen.getByRole('button', { name: 'Configure Amir Driver' }));
    fireEvent.click(screen.getByRole('button', { name: /resend invite/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/users',
        expect.objectContaining({
          body: JSON.stringify({
            action: 'resendInvite',
            email: 'amir@nulldevice.dev',
            groupName: 'operator',
            name: 'Amir Driver',
          }),
        })
      );
    });

    expect(await screen.findByText(/invitation resent to amir@nulldevice.dev/i)).toBeInTheDocument();
  });

  it('does not offer a resend invite action for an active driver', async () => {
    render(<AdministratorDriversPage />);

    await screen.findByText('Van 1 · ABC123');
    fireEvent.click(screen.getByRole('button', { name: 'Configure Jane Driver' }));

    expect(screen.queryByRole('button', { name: /resend invite/i })).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no drivers', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ users: [] }) })) as jest.Mock;
    (listOperators as jest.Mock).mockResolvedValue({ data: [], errors: undefined });

    render(<AdministratorDriversPage />);

    expect(await screen.findByText(/no drivers yet/i)).toBeInTheDocument();
  });

  it('invites a new driver via the operator group', async () => {
    render(<AdministratorDriversPage />);

    await screen.findByText('Van 1 · ABC123');

    fireEvent.change(screen.getByLabelText(/email for new driver/i), {
      target: { value: 'new-driver@nulldevice.dev' },
    });
    fireEvent.change(screen.getByLabelText(/optional display name for new driver/i), {
      target: { value: 'New Driver' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send invite$/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/users',
        expect.objectContaining({
          body: JSON.stringify({
            action: 'createUser',
            email: 'new-driver@nulldevice.dev',
            name: 'New Driver',
            groupName: 'operator',
          }),
        })
      );
    });

    expect(await screen.findByText(/they’ll get an email with a temporary password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email for new driver/i)).toHaveValue('');
  });

  it('tells the admin when the login was created but the invitation email failed to send', async () => {
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      const action = init?.body ? JSON.parse(init.body as string).action : undefined;

      if (action === 'createUser') {
        return {
          ok: true,
          json: async () => ({ user: { sub: 'new-sub' }, created: true, emailSent: false }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          users: [
            { id: 'sub-1', name: 'Jane Driver', email: 'jane@nulldevice.dev' },
            { id: 'sub-2', name: 'Amir Driver', email: 'amir@nulldevice.dev' },
          ],
        }),
      };
    }) as jest.Mock;

    render(<AdministratorDriversPage />);

    await screen.findByText('Van 1 · ABC123');

    fireEvent.change(screen.getByLabelText(/email for new driver/i), {
      target: { value: 'new-driver@nulldevice.dev' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send invite$/i }));

    expect(await screen.findByText(/invitation email could not be sent/i)).toBeInTheDocument();
  });

  it('shows an error and keeps the form filled in when inviting a driver fails', async () => {
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      const action = init?.body ? JSON.parse(init.body as string).action : undefined;

      if (action === 'createUser') {
        return { ok: false, json: async () => ({ error: 'Could not create a login for this email.' }) };
      }

      return {
        ok: true,
        json: async () => ({
          users: [{ id: 'sub-1', name: 'Jane Driver', email: 'jane@nulldevice.dev' }],
        }),
      };
    }) as jest.Mock;

    render(<AdministratorDriversPage />);

    await screen.findByText('Van 1 · ABC123');

    fireEvent.change(screen.getByLabelText(/email for new driver/i), {
      target: { value: 'broken@nulldevice.dev' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send invite$/i }));

    expect(await screen.findByText('Could not create a login for this email.')).toBeInTheDocument();
    expect(screen.getByLabelText(/email for new driver/i)).toHaveValue('broken@nulldevice.dev');
  });
});
