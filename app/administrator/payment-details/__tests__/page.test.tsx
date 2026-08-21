import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdministratorPaymentDetailsPage from '../page';
import { listAllCustomers } from '@/lib/queries/ListAllCustomers';
import { getCustomer, updateCustomer } from '@/lib/queries';

jest.mock('@/app/components/OperatorRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/lib/queries/ListAllCustomers', () => ({
  listAllCustomers: jest.fn(),
}));

jest.mock('@/lib/queries', () => ({
  getCustomer: jest.fn(),
  updateCustomer: jest.fn(),
}));

describe('Administrator Payment Details page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listAllCustomers as jest.Mock).mockResolvedValue({
      data: [
        { id: 'cust-1', name: 'Harcourts Epping' },
        { id: 'cust-2', name: 'Ray White Eastwood' },
      ],
      errors: undefined,
    });
    (getCustomer as jest.Mock).mockResolvedValue({
      data: {
        id: 'cust-1',
        billingCycle: 'monthly',
        paymentTermsDays: 14,
        gstAbn: '48 221 604 992',
        gstRegistered: true,
        gstExclusive: true,
        groupLineItemsByAgent: false,
        autoSendInvoiceOnPeriodClose: false,
        directDebitAccountName: 'Harcourts Epping Pty Ltd',
        directDebitBsb: '062-217',
        directDebitAccountNumber: '4192',
        directDebitAuthorizedAt: '2026-07-04T00:00:00Z',
      },
      errors: undefined,
    });
    (updateCustomer as jest.Mock).mockResolvedValue({ data: { id: 'cust-1' }, errors: undefined });
  });

  it('loads the first customer and shows their billing cycle & tax settings', async () => {
    render(<AdministratorPaymentDetailsPage />);

    await waitFor(() => {
      expect(getCustomer).toHaveBeenCalledWith('cust-1');
    });

    expect(await screen.findByDisplayValue('48 221 604 992')).toBeInTheDocument();
    expect(screen.getByText(/mandate signed/i)).toBeInTheDocument();
  });

  it('saves billing cycle & tax settings', async () => {
    render(<AdministratorPaymentDetailsPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('48 221 604 992')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /save billing cycle & tax/i }));

    await waitFor(() => {
      expect(updateCustomer).toHaveBeenCalledWith('cust-1', {
        billingCycle: 'monthly',
        paymentTermsDays: 14,
        gstAbn: '48 221 604 992',
        gstRegistered: true,
        gstExclusive: true,
        groupLineItemsByAgent: false,
        autoSendInvoiceOnPeriodClose: false,
      });
    });

    expect(await screen.findByText(/billing cycle & tax settings saved/i)).toBeInTheDocument();
  });

  it('saves direct debit details', async () => {
    render(<AdministratorPaymentDetailsPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Harcourts Epping Pty Ltd')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /save payment details/i }));

    await waitFor(() => {
      expect(updateCustomer).toHaveBeenCalledWith(
        'cust-1',
        expect.objectContaining({
          directDebitAccountName: 'Harcourts Epping Pty Ltd',
          directDebitBsb: '062-217',
          directDebitAccountNumber: '4192',
        })
      );
    });

    expect(await screen.findByText(/direct debit details saved/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no customers', async () => {
    (listAllCustomers as jest.Mock).mockResolvedValue({ data: [], errors: undefined });

    render(<AdministratorPaymentDetailsPage />);

    expect(await screen.findByText(/no customers found/i)).toBeInTheDocument();
  });
});
