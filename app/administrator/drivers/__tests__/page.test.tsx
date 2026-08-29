import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdministratorDriversPage from '../page';
import { listOperators } from '@/lib/queries/ListOperators';
import { updateOperator } from '@/lib/queries/UpdateOperator';
import { listAllCustomers } from '@/lib/queries/ListAllCustomers';

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

describe('Administrator Drivers page', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        users: [
          { id: 'sub-1', name: 'Jane Driver', email: 'jane@nulldevice.dev' },
          { id: 'sub-2', name: 'Amir Driver', email: 'amir@nulldevice.dev' },
        ],
      }),
    })) as jest.Mock;

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
  });

  it('lists drivers merged with their Operator profile fields', async () => {
    render(<AdministratorDriversPage />);

    expect(await screen.findByText('Van 1 · ABC123')).toBeInTheDocument();
    expect(screen.getByText('Ryde')).toBeInTheDocument();
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Onboarding').length).toBeGreaterThanOrEqual(1);
  });

  it('selects a driver and saves profile edits', async () => {
    render(<AdministratorDriversPage />);

    await screen.findByText('Van 1 · ABC123');
    fireEvent.click(screen.getByRole('button', { name: 'Jane Driver' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Jane Driver' }));

    fireEvent.change(screen.getByLabelText(/customer to assign/i), { target: { value: 'cust-2' } });
    fireEvent.click(screen.getByRole('button', { name: /assign customer/i }));

    await waitFor(() => {
      expect(updateOperator).toHaveBeenCalledWith('sub-1', { assignedCustomerIds: ['cust-1', 'cust-2'] });
    });
  });

  it('removes an assigned customer', async () => {
    render(<AdministratorDriversPage />);

    await screen.findByText('Van 1 · ABC123');
    fireEvent.click(screen.getByRole('button', { name: 'Jane Driver' }));

    await screen.findByText('Harcourts Epping');
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));

    await waitFor(() => {
      expect(updateOperator).toHaveBeenCalledWith('sub-1', { assignedCustomerIds: [] });
    });
  });

  it('deactivates the selected driver', async () => {
    render(<AdministratorDriversPage />);

    await screen.findByText('Van 1 · ABC123');
    fireEvent.click(screen.getByRole('button', { name: 'Jane Driver' }));
    fireEvent.click(screen.getByRole('button', { name: /deactivate/i }));

    await waitFor(() => {
      expect(updateOperator).toHaveBeenCalledWith('sub-1', { status: 'inactive' });
    });
  });

  it('shows an empty state when there are no drivers', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ users: [] }) })) as jest.Mock;
    (listOperators as jest.Mock).mockResolvedValue({ data: [], errors: undefined });

    render(<AdministratorDriversPage />);

    expect(await screen.findByText(/no drivers yet/i)).toBeInTheDocument();
  });
});
