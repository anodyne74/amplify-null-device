import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdministratorPaymentDetailsPage from '../page';
import { listAllCustomers } from '@/lib/queries/ListAllCustomers';
import { listRateLines } from '@/lib/queries/ListRateLines';
import { createRateLine } from '@/lib/queries/CreateRateLine';
import { deleteRateLine } from '@/lib/queries/DeleteRateLine';
import { getCustomer, updateCustomer } from '@/lib/queries';
import { computeDriverSplit } from '@/lib/driverSplit';
import { getOrganizationSettings, upsertOrganizationSettings } from '@/lib/queries/OrganizationSettings';

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null }),
}));

jest.mock('@/lib/queries/OrganizationSettings', () => ({
  getOrganizationSettings: jest.fn(),
  upsertOrganizationSettings: jest.fn(),
}));

jest.mock('@/app/components/OperatorRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/lib/queries/ListAllCustomers', () => ({
  listAllCustomers: jest.fn(),
}));

jest.mock('@/lib/queries/ListRateLines', () => ({
  listRateLines: jest.fn(),
}));

jest.mock('@/lib/queries/CreateRateLine', () => ({
  createRateLine: jest.fn(),
}));

jest.mock('@/lib/queries/DeleteRateLine', () => ({
  deleteRateLine: jest.fn(),
}));

jest.mock('@/lib/queries', () => ({
  getCustomer: jest.fn(),
  updateCustomer: jest.fn(),
}));

jest.mock('@/lib/driverSplit', () => ({
  computeDriverSplit: jest.fn(),
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
        billingRatePerHour: 30,
        driverSplitPercent: 40,
        hideDriverSplitFromCustomer: false,
        paySplitOnCompletedStopsOnly: false,
      },
      errors: undefined,
    });
    (updateCustomer as jest.Mock).mockResolvedValue({ data: { id: 'cust-1' }, errors: undefined });
    (listRateLines as jest.Mock).mockResolvedValue({ data: [], errors: undefined });
    (createRateLine as jest.Mock).mockResolvedValue({ data: { id: 'line-new' }, errors: undefined });
    (deleteRateLine as jest.Mock).mockResolvedValue({ data: {}, errors: undefined });
    (computeDriverSplit as jest.Mock).mockResolvedValue({
      periodStartDate: '2026-08-01',
      periodEndDate: '2026-08-20',
      totalBilled: 100,
      totalStopCount: 4,
      totalDriverShare: 40,
      retained: 60,
      byOperator: [],
    });
    (getOrganizationSettings as jest.Mock).mockResolvedValue({
      data: {
        id: 'organization',
        companyName: 'Null Device',
        abn: 'ABN 93 374 916 783',
        phone: '+61 406 199 785',
        address: '31 Chester Street, Epping NSW 2121',
        paymentAccountName: 'Null Device',
        bsb: '000-000',
        accountNumber: '00000000',
      },
      errors: undefined,
    });
    (upsertOrganizationSettings as jest.Mock).mockResolvedValue({ data: { id: 'organization' }, errors: undefined });
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

  it('loads and displays the org-wide pay-to details, even with no customers', async () => {
    (listAllCustomers as jest.Mock).mockResolvedValue({ data: [], errors: undefined });

    render(<AdministratorPaymentDetailsPage />);

    expect(await screen.findByDisplayValue('ABN 93 374 916 783')).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('Null Device').length).toBe(2);
    expect(screen.getByLabelText('Pay-To Account Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Pay-To BSB')).toBeInTheDocument();
    expect(screen.getByLabelText('Pay-To Account Number')).toBeInTheDocument();
  });

  it('saves pay-to details as an org-wide singleton, unrelated to the selected customer', async () => {
    render(<AdministratorPaymentDetailsPage />);

    await screen.findByDisplayValue('ABN 93 374 916 783');

    fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'Null Device Pty Ltd' } });
    fireEvent.click(screen.getByRole('button', { name: /save pay-to details/i }));

    await waitFor(() => {
      expect(upsertOrganizationSettings).toHaveBeenCalledWith({
        companyName: 'Null Device Pty Ltd',
        abn: 'ABN 93 374 916 783',
        phone: '+61 406 199 785',
        address: '31 Chester Street, Epping NSW 2121',
        paymentAccountName: 'Null Device',
        bsb: '000-000',
        accountNumber: '00000000',
      });
    });

    expect(await screen.findByText(/pay-to details saved/i)).toBeInTheDocument();
  });

  it('shows a message when the customer has no rate lines yet', async () => {
    render(<AdministratorPaymentDetailsPage />);

    await waitFor(() => {
      expect(getCustomer).toHaveBeenCalled();
    });

    expect(await screen.findByText(/this customer uses the flat billing rate/i)).toBeInTheDocument();
  });

  it('renders rate lines for the selected customer', async () => {
    (listRateLines as jest.Mock).mockResolvedValue({
      data: [{ id: 'line-1', customerId: 'cust-1', label: 'Placement', unit: 'per_hour', ratePerUnit: 30 }],
      errors: undefined,
    });

    render(<AdministratorPaymentDetailsPage />);

    await waitFor(() => {
      expect(getCustomer).toHaveBeenCalled();
    });

    expect(await screen.findByText('Placement')).toBeInTheDocument();
    expect(screen.getByText('$30.00')).toBeInTheDocument();
    expect(screen.getAllByText('per hour')[0]).toBeInTheDocument();
  });

  it('adds a new rate line', async () => {
    render(<AdministratorPaymentDetailsPage />);

    await waitFor(() => {
      expect(getCustomer).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Label')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'After-hours surcharge' } });
    fireEvent.change(screen.getByLabelText('Rate'), { target: { value: '95' } });
    fireEvent.click(screen.getByRole('button', { name: /add rate line/i }));

    await waitFor(() => {
      expect(createRateLine).toHaveBeenCalledWith({
        customerId: 'cust-1',
        label: 'After-hours surcharge',
        unit: 'per_hour',
        ratePerUnit: 95,
        sortOrder: 0,
      });
    });
  });

  it('removes a rate line', async () => {
    (listRateLines as jest.Mock).mockResolvedValue({
      data: [{ id: 'line-1', customerId: 'cust-1', label: 'Placement', unit: 'per_hour', ratePerUnit: 30 }],
      errors: undefined,
    });

    render(<AdministratorPaymentDetailsPage />);

    await waitFor(() => {
      expect(getCustomer).toHaveBeenCalled();
    });

    await screen.findByText('Placement');
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));

    await waitFor(() => {
      expect(deleteRateLine).toHaveBeenCalledWith('line-1');
    });
  });

  it('copies rate lines from another customer', async () => {
    (listAllCustomers as jest.Mock).mockResolvedValue({
      data: [
        { id: 'cust-1', name: 'Harcourts Epping' },
        { id: 'cust-2', name: 'Ray White Eastwood' },
      ],
      errors: undefined,
    });

    (listRateLines as jest.Mock).mockImplementation((customerId: string) => {
      if (customerId === 'cust-2') {
        return Promise.resolve({
          data: [{ id: 'line-src', customerId: 'cust-2', label: 'Placement', unit: 'per_hour', ratePerUnit: 30 }],
          errors: undefined,
        });
      }
      return Promise.resolve({ data: [], errors: undefined });
    });

    render(<AdministratorPaymentDetailsPage />);

    await waitFor(() => {
      expect(getCustomer).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Copy from another customer')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Copy from another customer'), { target: { value: 'cust-2' } });
    fireEvent.click(screen.getByRole('button', { name: /copy rate lines/i }));

    await waitFor(() => {
      expect(createRateLine).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'cust-1', label: 'Placement', ratePerUnit: 30 })
      );
    });
  });

  it('loads the driver split percent and shows the computed period preview', async () => {
    render(<AdministratorPaymentDetailsPage />);

    await waitFor(() => {
      expect(getCustomer).toHaveBeenCalled();
    });

    expect(await screen.findByDisplayValue('40')).toBeInTheDocument();

    await waitFor(() => {
      expect(computeDriverSplit).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'cust-1', driverSplitPercent: 40, billingRatePerHour: 30 })
      );
    });

    expect(await screen.findByText('$40.00')).toBeInTheDocument();
    expect(screen.getByText('$60.00')).toBeInTheDocument();
  });

  it('saves driver split settings', async () => {
    render(<AdministratorPaymentDetailsPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('40')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /save driver split/i }));

    await waitFor(() => {
      expect(updateCustomer).toHaveBeenCalledWith('cust-1', {
        driverSplitPercent: 40,
        driverSplitBasis: 'percentage_of_line_rate',
        hideDriverSplitFromCustomer: false,
        paySplitOnCompletedStopsOnly: false,
      });
    });

    expect(await screen.findByText(/driver split settings saved/i)).toBeInTheDocument();
  });

  it('scrolls back to the top when switching customers (#66)', async () => {
    const scrollToMock = jest.fn();
    window.scrollTo = scrollToMock;

    render(<AdministratorPaymentDetailsPage />);

    await waitFor(() => {
      expect(getCustomer).toHaveBeenCalledWith('cust-1');
    });
    scrollToMock.mockClear();

    fireEvent.change(screen.getByLabelText('Customer'), { target: { value: 'cust-2' } });

    await waitFor(() => {
      expect(getCustomer).toHaveBeenCalledWith('cust-2');
    });
    expect(scrollToMock).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
  });
});
