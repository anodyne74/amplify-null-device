import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdministratorPaymentDetailsPage from '../page';
import { listRateLines } from '@/lib/queries/ListRateLines';
import { createRateLine } from '@/lib/queries/CreateRateLine';
import { deleteRateLine } from '@/lib/queries/DeleteRateLine';
import { computeDriverSplit } from '@/lib/driverSplit';
import { getOrganizationSettings, upsertOrganizationSettings } from '@/lib/queries/OrganizationSettings';
import { listAllCustomers, getCustomer, updateCustomer } from '@/lib/customers';

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

jest.mock('@/lib/customers', () => ({
  listAllCustomers: jest.fn(),
  getCustomer: jest.fn(),
  updateCustomer: jest.fn(),
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

jest.mock('@/lib/driverSplit', () => ({
  computeDriverSplit: jest.fn(),
}));

describe('Administrator Payment Details page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listAllCustomers as jest.Mock).mockResolvedValue([
      { id: 'cust-1', name: 'Harcourts Epping' },
      { id: 'cust-2', name: 'Ray White Eastwood' },
    ]);
    (getCustomer as jest.Mock).mockResolvedValue({
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
    });
    (updateCustomer as jest.Mock).mockResolvedValue({ id: 'cust-1' });
    (listRateLines as jest.Mock).mockResolvedValue([]);
    (createRateLine as jest.Mock).mockResolvedValue({ id: 'line-new' });
    (deleteRateLine as jest.Mock).mockResolvedValue({});
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
      id: 'organization',
      companyName: 'Null Device',
      abn: 'ABN 93 374 916 783',
      phone: '+61 406 199 785',
      address: '31 Chester Street, Epping NSW 2121',
      paymentAccountName: 'Null Device',
      bsb: '000-000',
      accountNumber: '00000000',
    });
    (upsertOrganizationSettings as jest.Mock).mockResolvedValue({ id: 'organization' });
  });

  it('loads the first customer and shows their billing cycle & tax settings', async () => {
    render(<AdministratorPaymentDetailsPage />);

    await waitFor(() => {
      expect(getCustomer).toHaveBeenCalledWith('cust-1');
    });

    expect(await screen.findByDisplayValue('48 221 604 992')).toBeInTheDocument();
    expect(screen.getByText(/mandate signed/i)).toBeInTheDocument();
  });

  it('shows a load error and no save panels when the customer cannot be read', async () => {
    (getCustomer as jest.Mock).mockRejectedValue(new Error('customer read failed'));

    render(<AdministratorPaymentDetailsPage />);

    expect(await screen.findByText("Couldn't load this customer. Reload to try again.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save billing cycle & tax/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save payment details/i })).not.toBeInTheDocument();
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
    (listAllCustomers as jest.Mock).mockResolvedValue([]);

    render(<AdministratorPaymentDetailsPage />);

    expect(await screen.findByText(/no customers found/i)).toBeInTheDocument();
  });

  it('loads and displays the org-wide pay-to details, even with no customers', async () => {
    (listAllCustomers as jest.Mock).mockResolvedValue([]);

    render(<AdministratorPaymentDetailsPage />);

    expect(await screen.findByDisplayValue('ABN 93 374 916 783')).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('Null Device').length).toBe(2);
    expect(screen.getByLabelText('Pay-To Account Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Pay-To BSB')).toBeInTheDocument();
    expect(screen.getByLabelText('Pay-To Account Number')).toBeInTheDocument();
  });

  it('shows a load error and no pay-to form when the pay-to details cannot be read', async () => {
    (getOrganizationSettings as jest.Mock).mockRejectedValue(new Error('read failed'));

    render(<AdministratorPaymentDetailsPage />);

    expect(await screen.findByText("Couldn't load the pay-to details. Reload to try again.")).toBeInTheDocument();
    expect(screen.queryByLabelText('Pay-To Account Name')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save pay-to details/i })).not.toBeInTheDocument();
  });

  it('shows an empty pay-to form when none has been saved yet', async () => {
    (getOrganizationSettings as jest.Mock).mockResolvedValue(null);

    render(<AdministratorPaymentDetailsPage />);

    expect(await screen.findByLabelText('Pay-To Account Name')).toHaveValue('');
    expect(screen.getByRole('button', { name: /save pay-to details/i })).toBeInTheDocument();
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
    (listRateLines as jest.Mock).mockResolvedValue([{ id: 'line-1', customerId: 'cust-1', label: 'Placement', unit: 'per_hour', ratePerUnit: 30 }]);

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
    (listRateLines as jest.Mock).mockResolvedValue([{ id: 'line-1', customerId: 'cust-1', label: 'Placement', unit: 'per_hour', ratePerUnit: 30 }]);

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
    (listAllCustomers as jest.Mock).mockResolvedValue([
      { id: 'cust-1', name: 'Harcourts Epping' },
      { id: 'cust-2', name: 'Ray White Eastwood' },
    ]);

    (listRateLines as jest.Mock).mockImplementation((customerId: string) => {
      if (customerId === 'cust-2') {
        return Promise.resolve([
          { id: 'line-src', customerId: 'cust-2', label: 'Placement', unit: 'per_hour', ratePerUnit: 30 },
        ]);
      }
      return Promise.resolve([]);
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

  it('shows a load error and holds off adding or copying when rate lines cannot be read', async () => {
    (listAllCustomers as jest.Mock).mockResolvedValue([
      { id: 'cust-1', name: 'Harcourts Epping' },
      { id: 'cust-2', name: 'Ray White Eastwood' },
    ]);
    (listRateLines as jest.Mock).mockRejectedValue(new Error('read failed'));

    render(<AdministratorPaymentDetailsPage />);

    expect(await screen.findByText("Couldn't load rate lines. Reload to try again.")).toBeInTheDocument();
    expect(screen.queryByText(/this customer uses the flat billing rate/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'After-hours surcharge' } });
    fireEvent.change(screen.getByLabelText('Rate'), { target: { value: '95' } });
    fireEvent.change(screen.getByLabelText('Copy from another customer'), { target: { value: 'cust-2' } });
    expect(screen.getByRole('button', { name: /add rate line/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /copy rate lines/i })).toBeDisabled();
  });

  it("says so, and copies nothing, when the other customer's rate lines cannot be read", async () => {
    (listAllCustomers as jest.Mock).mockResolvedValue([
      { id: 'cust-1', name: 'Harcourts Epping' },
      { id: 'cust-2', name: 'Ray White Eastwood' },
    ]);
    (listRateLines as jest.Mock).mockImplementation((customerId: string) =>
      customerId === 'cust-2' ? Promise.reject(new Error('read failed')) : Promise.resolve([])
    );

    render(<AdministratorPaymentDetailsPage />);

    await screen.findByText(/this customer uses the flat billing rate/i);
    fireEvent.change(screen.getByLabelText('Copy from another customer'), { target: { value: 'cust-2' } });
    fireEvent.click(screen.getByRole('button', { name: /copy rate lines/i }));

    expect(await screen.findByText("Couldn't load that customer's rate lines.")).toBeInTheDocument();
    expect(createRateLine).not.toHaveBeenCalled();
  });

  it('shows an error when a rate line cannot be added', async () => {
    (createRateLine as jest.Mock).mockRejectedValue(new Error('write failed'));

    render(<AdministratorPaymentDetailsPage />);

    await screen.findByText(/this customer uses the flat billing rate/i);
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'After-hours surcharge' } });
    fireEvent.change(screen.getByLabelText('Rate'), { target: { value: '95' } });
    fireEvent.click(screen.getByRole('button', { name: /add rate line/i }));

    expect(await screen.findByText('Could not add rate line.')).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: /save operator split/i }));

    await waitFor(() => {
      expect(updateCustomer).toHaveBeenCalledWith('cust-1', {
        driverSplitPercent: 40,
        driverSplitBasis: 'percentage_of_line_rate',
        hideDriverSplitFromCustomer: false,
        paySplitOnCompletedStopsOnly: false,
      });
    });

    expect(await screen.findByText(/operator split settings saved/i)).toBeInTheDocument();
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
