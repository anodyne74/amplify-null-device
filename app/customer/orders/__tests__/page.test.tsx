import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CustomerStandingOrdersPage from '../page';
import { getCustomer, getCustomerPortalContext, updateCustomer } from '@/lib/queries';

jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({
    user: { userId: 'user-sub-1' },
  }),
}));

jest.mock('@/lib/queries', () => ({
  getCustomer: jest.fn(),
  getCustomerPortalContext: jest.fn(),
  updateCustomer: jest.fn(),
}));

describe('Customer Standing Orders page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCustomer as jest.Mock).mockResolvedValue({
      data: {
        id: 'cust-1',
        standingInstructions: 'Call before arrival',
        defaultNumberOfSigns: 3,
        standingPickupDay: 'saturday',
        notifyOnLowSigns: true,
        sendMissingSignsReport: true,
        agentOptions: ['Jamie Lee', 'Pat Doe'],
        updatedAt: '2026-08-12T00:00:00Z',
      },
      errors: undefined,
    });
    (updateCustomer as jest.Mock).mockResolvedValue({ data: { id: 'cust-1' }, errors: undefined });
  });

  it('allows the account owner to save standing order preferences', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'account_owner', customerId: 'cust-1' });

    render(<CustomerStandingOrdersPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Call before arrival')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Default signs per stop'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('Standing pickup day'), { target: { value: 'sunday' } });
    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));

    await waitFor(() => {
      expect(updateCustomer).toHaveBeenCalledWith('cust-1', {
        standingInstructions: 'Call before arrival',
        defaultNumberOfSigns: 6,
        standingPickupDay: 'sunday',
        notifyOnLowSigns: true,
        sendMissingSignsReport: true,
      });
    });

    expect(await screen.findByText(/preferences saved/i)).toBeInTheDocument();
  });

  it('validates non-negative default signs before save', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'account_owner', customerId: 'cust-1' });

    render(<CustomerStandingOrdersPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('Default signs per stop')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Default signs per stop'), { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));

    expect(await screen.findByText(/default signs per stop must be 0 or greater/i)).toBeInTheDocument();
    expect(updateCustomer).not.toHaveBeenCalled();
  });

  it('shows a read-only summary for the read_only role', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'read_only', customerId: 'cust-1' });

    render(<CustomerStandingOrdersPage />);

    expect(await screen.findByText(/call before arrival/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save preferences/i })).not.toBeInTheDocument();
    expect(screen.getByText(/only your account owner can change these/i)).toBeInTheDocument();
  });

  it('shows agents on the account', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'account_owner', customerId: 'cust-1' });

    render(<CustomerStandingOrdersPage />);

    expect(await screen.findByText('Jamie Lee')).toBeInTheDocument();
    expect(screen.getByText('Pat Doe')).toBeInTheDocument();
  });
});
