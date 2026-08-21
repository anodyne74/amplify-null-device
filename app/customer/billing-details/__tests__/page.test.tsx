import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CustomerBillingDetailsPage from '../page';
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

jest.mock('@/app/operator/components/AddressAutocompleteInput', () => ({
  AddressAutocompleteInput: ({
    value,
    onChange,
    placeholder,
    disabled,
  }: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
  }) => (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      disabled={disabled}
    />
  ),
}));

describe('Customer Billing Details page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCustomer as jest.Mock).mockResolvedValue({
      data: {
        id: 'cust-1',
        email: 'accounts@harcourtsepping.com.au',
        billingCcEmails: ['prue@harcourtsepping.com.au'],
        attachAgentBreakdown: true,
        sendPaymentReminder: false,
        companyName: 'Harcourts Epping Pty Ltd',
        gstAbn: '48 221 604 992',
        addressLine1: 'Suite 3, 52 Beecroft Rd',
        billingRatePerHour: 65,
        gstRegistered: true,
        directDebitAccountName: 'Harcourts Epping Pty Ltd',
      },
      errors: undefined,
    });
    (updateCustomer as jest.Mock).mockResolvedValue({ data: { id: 'cust-1' }, errors: undefined });
  });

  it('allows the account owner to save the billing email', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'account_owner', customerId: 'cust-1' });

    render(<CustomerBillingDetailsPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('accounts@harcourtsepping.com.au')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/billing email/i), {
      target: { value: 'billing@harcourtsepping.com.au' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save billing email/i }));

    await waitFor(() => {
      expect(updateCustomer).toHaveBeenCalledWith('cust-1', {
        email: 'billing@harcourtsepping.com.au',
        billingCcEmails: ['prue@harcourtsepping.com.au'],
        attachAgentBreakdown: true,
        sendPaymentReminder: false,
      });
    });

    expect(await screen.findByText(/billing email saved/i)).toBeInTheDocument();
  });

  it('allows the account owner to save the billing address', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'account_owner', customerId: 'cust-1' });

    render(<CustomerBillingDetailsPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Harcourts Epping Pty Ltd')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /save address/i }));

    await waitFor(() => {
      expect(updateCustomer).toHaveBeenCalledWith('cust-1', {
        companyName: 'Harcourts Epping Pty Ltd',
        gstAbn: '48 221 604 992',
        addressLine1: 'Suite 3, 52 Beecroft Rd',
      });
    });

    expect(await screen.findByText(/billing address saved/i)).toBeInTheDocument();
  });

  it('shows how-you-pay details read-only', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'account_owner', customerId: 'cust-1' });

    render(<CustomerBillingDetailsPage />);

    expect(await screen.findByText('$65.00/hr')).toBeInTheDocument();
  });

  it('blocks editing for the read_only role', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({ role: 'read_only', customerId: 'cust-1' });

    render(<CustomerBillingDetailsPage />);

    expect(await screen.findByText(/only your account owner can edit billing details/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Billing email')).not.toBeInTheDocument();
  });
});
