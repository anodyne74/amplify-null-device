import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CustomerDashboard from '../page';
import {
  getCustomer,
  getCustomerPortalContext,
  updateCustomer,
} from '@/lib/queries';
import { listMyRoutes } from '@/lib/queries/ListMyRoutes';
import { listMyInvoices } from '@/lib/queries/ListMyInvoices';

jest.mock('@/app/dashboard.module.css', () => ({}));

jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({
    user: { userId: 'user-sub-1' },
  }),
}));

jest.mock('@/lib/amplify-config', () => ({
  getUserEmail: () => 'owner@example.com',
}));

jest.mock('@/lib/queries', () => ({
  getCustomer: jest.fn(),
  getCustomerPortalContext: jest.fn(),
  updateCustomer: jest.fn(),
}));

jest.mock('@/lib/queries/ListMyRoutes', () => ({
  listMyRoutes: jest.fn(),
}));

jest.mock('@/lib/queries/ListMyInvoices', () => ({
  listMyInvoices: jest.fn(),
}));

const mockStopList = jest.fn();
jest.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      Stop: {
        list: mockStopList,
      },
    },
  }),
}));

describe('Customer Dashboard standing instructions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCustomer as jest.Mock).mockResolvedValue({
      data: {
        id: 'cust-1',
        standingInstructions: 'Call before arrival',
        defaultNumberOfSigns: 3,
        defaultAgentName: 'Jamie Lee',
        defaultAgentInitials: 'JL',
        agentOptions: ['Jamie Lee', 'Pat Doe'],
      },
      errors: undefined,
    });
    (updateCustomer as jest.Mock).mockResolvedValue({
      data: { id: 'cust-1' },
      errors: undefined,
    });
    (listMyRoutes as jest.Mock).mockResolvedValue({
      data: [
        { id: 'route-1', status: 'signs_placed' },
        { id: 'route-2', status: 'completed' },
      ],
      errors: undefined,
    });
    (listMyInvoices as jest.Mock).mockResolvedValue({
      data: [
        { id: 'inv-1', totalAmount: 1200, status: 'paid' },
        { id: 'inv-2', totalAmount: 800, status: 'sent' },
      ],
      errors: undefined,
    });
    mockStopList.mockResolvedValue({
      data: [
        {
          id: 'stop-1',
          routeId: 'route-1',
          sequence: 1,
          numberOfSigns: 3,
          latitude: -37.8136,
          longitude: 144.9631,
        },
        {
          id: 'stop-2',
          routeId: 'route-1',
          sequence: 2,
          numberOfSigns: 2,
          latitude: -37.814,
          longitude: 144.9731,
        },
      ],
      errors: undefined,
    });
  });

  it('allows account owner to save standing instructions defaults', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'account_owner',
      customerId: 'cust-1',
    });

    render(<CustomerDashboard />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Call before arrival')).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: /customer portal/i })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Instructions operators should see by default'), {
      target: { value: 'Leave signs at side gate' },
    });
    fireEvent.change(screen.getByPlaceholderText('Default number of signs'), {
      target: { value: '5' },
    });
    fireEvent.change(screen.getByPlaceholderText('Default agent name'), {
      target: { value: 'Pat Doe' },
    });
    fireEvent.change(screen.getByPlaceholderText('Agent options, one per line'), {
      target: { value: 'Pat Doe\nAlex Roe' },
    });

    fireEvent.click(screen.getByRole('button', { name: /save standing instructions/i }));

    await waitFor(() => {
      expect(updateCustomer).toHaveBeenCalledWith(
        'cust-1',
        {
          standingInstructions: 'Leave signs at side gate',
          defaultNumberOfSigns: 5,
          defaultAgentName: 'Pat Doe',
          agentOptions: ['Pat Doe', 'Alex Roe'],
        }
      );
    });

    expect(await screen.findByText(/standing instructions updated/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /customer totals/i })).toBeInTheDocument();
    expect(screen.getByText(/total invoiced amount/i)).toBeInTheDocument();
    expect(screen.getByText(/outstanding amount/i)).toBeInTheDocument();
  });

  it('shows read-only standing instructions for reviewer role', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'read_only',
      customerId: 'cust-1',
    });

    render(<CustomerDashboard />);

    expect(await screen.findByText(/only the account owner can edit these defaults/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /customer portal/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save standing instructions/i })).not.toBeInTheDocument();
    expect(screen.getByText(/call before arrival/i)).toBeInTheDocument();
    expect(screen.getAllByText('Restricted').length).toBeGreaterThan(0);
  });

  it('validates non-negative default signs before save', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'account_owner',
      customerId: 'cust-1',
    });

    render(<CustomerDashboard />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Default number of signs')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Default number of signs'), {
      target: { value: '-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save standing instructions/i }));

    expect(await screen.findByText(/default number of signs must be 0 or greater/i)).toBeInTheDocument();
    expect(updateCustomer).not.toHaveBeenCalled();
  });
});
