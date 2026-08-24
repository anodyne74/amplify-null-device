import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AdministratorPayoutsPage from '../page';
import { listAllCustomers } from '@/lib/queries/ListAllCustomers';
import { listOperatorPayouts } from '@/lib/queries/ListOperatorPayouts';
import { createOperatorPayout } from '@/lib/queries/CreateOperatorPayout';
import { updateOperatorPayout } from '@/lib/queries/UpdateOperatorPayout';
import { getCustomer } from '@/lib/queries';
import { computeDriverSplit } from '@/lib/driverSplit';

jest.mock('@/app/components/OperatorRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/lib/queries/ListAllCustomers', () => ({
  listAllCustomers: jest.fn(),
}));

jest.mock('@/lib/queries/ListOperatorPayouts', () => ({
  listOperatorPayouts: jest.fn(),
}));

jest.mock('@/lib/queries/CreateOperatorPayout', () => ({
  createOperatorPayout: jest.fn(),
}));

jest.mock('@/lib/queries/UpdateOperatorPayout', () => ({
  updateOperatorPayout: jest.fn(),
}));

jest.mock('@/lib/queries', () => ({
  getCustomer: jest.fn(),
}));

jest.mock('@/lib/driverSplit', () => ({
  computeDriverSplit: jest.fn(),
}));

describe('Administrator Payouts page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listAllCustomers as jest.Mock).mockResolvedValue({
      data: [
        { id: 'cust-1', name: 'Harcourts Epping' },
        { id: 'cust-2', name: 'Ray White Eastwood' },
      ],
      errors: undefined,
    });
    (listOperatorPayouts as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 'payout-1',
          operatorSub: 'op-1',
          customerId: 'cust-1',
          periodStartDate: '2026-08-01',
          periodEndDate: '2026-08-20',
          amount: 120,
          status: 'pending',
        },
        {
          id: 'payout-2',
          operatorSub: 'op-2',
          customerId: 'cust-1',
          periodStartDate: '2026-07-01',
          periodEndDate: '2026-07-31',
          amount: 80,
          status: 'paid',
        },
      ],
      errors: undefined,
    });
    (getCustomer as jest.Mock).mockResolvedValue({
      data: { id: 'cust-1', billingRatePerHour: 30, driverSplitPercent: 40, paySplitOnCompletedStopsOnly: false },
      errors: undefined,
    });
    (createOperatorPayout as jest.Mock).mockResolvedValue({ data: { id: 'payout-new' }, errors: undefined });
    (updateOperatorPayout as jest.Mock).mockResolvedValue({ data: { id: 'payout-1' }, errors: undefined });
    (computeDriverSplit as jest.Mock).mockResolvedValue({
      periodStartDate: '2026-08-01',
      periodEndDate: '2026-08-20',
      totalBilled: 300,
      totalStopCount: 10,
      totalDriverShare: 120,
      retained: 180,
      byOperator: [{ operatorSub: 'op-1', billedAmount: 300, stopCount: 10, driverShare: 120 }],
    });
  });

  it('lists existing payouts for both customers', async () => {
    render(<AdministratorPayoutsPage />);

    expect(await screen.findByText('$120.00')).toBeInTheDocument();
    expect(screen.getAllByText('Harcourts Epping').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('$80.00')).toBeInTheDocument();
    expect(screen.getAllByText('Pending').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Paid').length).toBeGreaterThanOrEqual(1);
  });

  it('filters the payout list by status', async () => {
    const { container } = render(<AdministratorPayoutsPage />);

    await screen.findByText('$120.00');

    const filters = container.querySelector('.filters') as HTMLElement;
    fireEvent.click(within(filters).getByText('Paid'));

    expect(screen.queryByText('$120.00')).not.toBeInTheDocument();
    expect(screen.getByText('$80.00')).toBeInTheDocument();
  });

  it('previews and creates payouts for a customer period', async () => {
    const { container } = render(<AdministratorPayoutsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /preview split/i })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /preview split/i }));

    await waitFor(() => {
      expect(computeDriverSplit).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'cust-1', driverSplitPercent: 40 })
      );
    });

    await waitFor(() => {
      expect(container.querySelector('.previewRowAmount')?.textContent).toBe('$120.00');
    });

    fireEvent.click(screen.getByRole('button', { name: /create 1 payout/i }));

    await waitFor(() => {
      expect(createOperatorPayout).toHaveBeenCalledWith({
        operatorSub: 'op-1',
        customerId: 'cust-1',
        periodStartDate: expect.any(String),
        periodEndDate: expect.any(String),
        amount: 120,
        status: 'pending',
      });
    });
  });

  it('marks a pending payout as paid', async () => {
    render(<AdministratorPayoutsPage />);

    await screen.findByText('$120.00');
    fireEvent.click(screen.getByRole('button', { name: /mark paid/i }));

    await waitFor(() => {
      expect(updateOperatorPayout).toHaveBeenCalledWith('payout-1', {
        status: 'paid',
        paidAt: expect.any(String),
      });
    });
  });

  it('shows an empty state when there are no payouts', async () => {
    (listOperatorPayouts as jest.Mock).mockResolvedValue({ data: [], errors: undefined });

    render(<AdministratorPayoutsPage />);

    expect(await screen.findByText(/no payouts yet/i)).toBeInTheDocument();
  });
});
