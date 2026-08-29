import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ServiceCalendar } from '../ServiceCalendar';
import { listOperatorAvailabilityBlocks } from '@/lib/queries/ListOperatorAvailabilityBlocks';
import { createOperatorAvailabilityBlock } from '@/lib/queries/CreateOperatorAvailabilityBlock';
import { deleteOperatorAvailabilityBlock } from '@/lib/queries/DeleteOperatorAvailabilityBlock';
import { listCustomerClosureBlocks } from '@/lib/queries/ListCustomerClosureBlocks';
import { createCustomerClosureBlock } from '@/lib/queries/CreateCustomerClosureBlock';
import { deleteCustomerClosureBlock } from '@/lib/queries/DeleteCustomerClosureBlock';
import { listAllCustomers } from '@/lib/queries/ListAllCustomers';
import { listMyRoutes } from '@/lib/queries/ListMyRoutes';

jest.mock('@/lib/queries/ListOperatorAvailabilityBlocks', () => ({
  listOperatorAvailabilityBlocks: jest.fn(),
}));
jest.mock('@/lib/queries/CreateOperatorAvailabilityBlock', () => ({
  createOperatorAvailabilityBlock: jest.fn(),
}));
jest.mock('@/lib/queries/DeleteOperatorAvailabilityBlock', () => ({
  deleteOperatorAvailabilityBlock: jest.fn(),
}));
jest.mock('@/lib/queries/ListCustomerClosureBlocks', () => ({
  listCustomerClosureBlocks: jest.fn(),
}));
jest.mock('@/lib/queries/CreateCustomerClosureBlock', () => ({
  createCustomerClosureBlock: jest.fn(),
}));
jest.mock('@/lib/queries/DeleteCustomerClosureBlock', () => ({
  deleteCustomerClosureBlock: jest.fn(),
}));
jest.mock('@/lib/queries/ListAllCustomers', () => ({
  listAllCustomers: jest.fn(),
}));
jest.mock('@/lib/queries/ListMyRoutes', () => ({
  listMyRoutes: jest.fn(),
}));

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

describe('ServiceCalendar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listOperatorAvailabilityBlocks as jest.Mock).mockResolvedValue({ data: [], errors: undefined });
    (listCustomerClosureBlocks as jest.Mock).mockResolvedValue({ data: [], errors: undefined });
    (createOperatorAvailabilityBlock as jest.Mock).mockResolvedValue({ data: { id: 'block-1' }, errors: undefined });
    (deleteOperatorAvailabilityBlock as jest.Mock).mockResolvedValue({ data: {}, errors: undefined });
    (createCustomerClosureBlock as jest.Mock).mockResolvedValue({ data: { id: 'block-2' }, errors: undefined });
    (deleteCustomerClosureBlock as jest.Mock).mockResolvedValue({ data: {}, errors: undefined });
    (listAllCustomers as jest.Mock).mockResolvedValue({ data: [], errors: undefined });
    (listMyRoutes as jest.Mock).mockResolvedValue({ data: [], errors: undefined });
  });

  it('renders the month grid with weekday headers', async () => {
    render(
      <ServiceCalendar customerId="cust-1" role="staff" currentUserSub="sub-1" viewerSubs={['sub-1', 'sub-2']} />
    );

    await waitFor(() => {
      expect(listOperatorAvailabilityBlocks).toHaveBeenCalledWith('cust-1');
    });

    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Sun')).toBeInTheDocument();
  });

  it('lets staff block the selected day and stamps viewerSubs', async () => {
    render(
      <ServiceCalendar customerId="cust-1" role="staff" currentUserSub="sub-1" viewerSubs={['sub-1', 'sub-2']} />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /block this day/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /block this day/i }));

    await waitFor(() => {
      expect(createOperatorAvailabilityBlock).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'cust-1',
          date: todayKey(),
          createdByOperatorId: 'sub-1',
          viewerSubs: ['sub-1', 'sub-2'],
        })
      );
    });
  });

  it('lets staff remove an existing block', async () => {
    (listOperatorAvailabilityBlocks as jest.Mock).mockResolvedValue({
      data: [{ id: 'existing-block', customerId: 'cust-1', date: todayKey(), reason: 'Driver vacation' }],
      errors: undefined,
    });

    render(
      <ServiceCalendar customerId="cust-1" role="staff" currentUserSub="sub-1" viewerSubs={['sub-1']} />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /remove block/i })).toBeInTheDocument();
    });

    expect(screen.getAllByText('Driver vacation').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /remove block/i }));

    await waitFor(() => {
      expect(deleteOperatorAvailabilityBlock).toHaveBeenCalledWith('existing-block');
    });
  });

  it('lets a customer admin mark the day closed, stamping accountOwnerSub', async () => {
    render(
      <ServiceCalendar customerId="cust-1" role="customer-admin" currentUserSub="owner-sub" viewerSubs={['owner-sub', 'reviewer-sub']} />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /mark closed/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /mark closed/i }));

    await waitFor(() => {
      expect(createCustomerClosureBlock).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'cust-1',
          date: todayKey(),
          createdByUserSub: 'owner-sub',
          accountOwnerSub: 'owner-sub',
          viewerSubs: ['owner-sub', 'reviewer-sub'],
        })
      );
    });
  });

  it('shows no write controls for a read-only customer user', async () => {
    render(
      <ServiceCalendar customerId="cust-1" role="customer-readonly" currentUserSub="reviewer-sub" viewerSubs={['owner-sub', 'reviewer-sub']} />
    );

    await waitFor(() => {
      expect(screen.getByText(/your account owner marks office closures/i)).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /mark closed/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /block this day/i })).not.toBeInTheDocument();
  });

  it('lists upcoming blocked days from both sources', async () => {
    const future = new Date();
    future.setDate(future.getDate() + 3);
    const futureKey = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;

    (listOperatorAvailabilityBlocks as jest.Mock).mockResolvedValue({
      data: [{ id: 'b1', customerId: 'cust-1', date: futureKey, reason: 'Public holiday' }],
      errors: undefined,
    });

    render(
      <ServiceCalendar customerId="cust-1" role="customer-readonly" currentUserSub="reviewer-sub" viewerSubs={['reviewer-sub']} />
    );

    expect(await screen.findByText('Public holiday')).toBeInTheDocument();
    expect(screen.getByText('No drivers')).toBeInTheDocument();
  });

  it('shows a deliveries count for the selected day, derived from route timestamps', async () => {
    const [year, month, day] = todayKey().split('-').map(Number);
    // Midday local time, well clear of the UTC day boundary in either direction.
    const middayLocalIso = new Date(year, month - 1, day, 12, 0, 0).toISOString();

    (listMyRoutes as jest.Mock).mockResolvedValue({
      data: [
        { actualEndTime: middayLocalIso },
        { actualStartTime: middayLocalIso },
        { createdAt: '2020-01-01T00:00:00Z' },
      ],
      errors: undefined,
    });

    render(
      <ServiceCalendar customerId="cust-1" role="customer-readonly" currentUserSub="reviewer-sub" viewerSubs={['reviewer-sub']} />
    );

    expect(await screen.findByText('Deliveries')).toBeInTheDocument();
    const deliveriesRow = screen.getByText('Deliveries').closest('div');
    expect(deliveriesRow).toHaveTextContent('2');
  });

  it('prefers scheduledDate over the timestamp fallback chain when counting deliveries', async () => {
    const today = todayKey();

    (listMyRoutes as jest.Mock).mockResolvedValue({
      data: [
        { scheduledDate: today },
        { scheduledDate: today },
        { actualEndTime: '2020-01-01T00:00:00Z' }, // no scheduledDate — falls back, lands on a different day
      ],
      errors: undefined,
    });

    render(
      <ServiceCalendar customerId="cust-1" role="customer-readonly" currentUserSub="reviewer-sub" viewerSubs={['reviewer-sub']} />
    );

    expect(await screen.findByText('Deliveries')).toBeInTheDocument();
    const deliveriesRow = screen.getByText('Deliveries').closest('div');
    expect(deliveriesRow).toHaveTextContent('2');
  });

  it('lets staff apply a block to every active customer', async () => {
    (listAllCustomers as jest.Mock).mockResolvedValue({
      data: [
        { id: 'cust-1', name: 'Harcourts Epping', status: 'active', viewerSubs: ['sub-1'] },
        { id: 'cust-2', name: 'Ray White Eastwood', status: 'active', viewerSubs: ['sub-2'] },
        { id: 'cust-3', name: 'Retired Agency', status: 'inactive', viewerSubs: ['sub-3'] },
      ],
      errors: undefined,
    });

    render(
      <ServiceCalendar customerId="cust-1" role="staff" currentUserSub="sub-1" viewerSubs={['sub-1']} />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /block this day/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Apply to every customer'));
    fireEvent.click(screen.getByRole('button', { name: /block this day for every customer/i }));

    await waitFor(() => {
      expect(createOperatorAvailabilityBlock).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'cust-1', date: todayKey(), viewerSubs: ['sub-1'] })
      );
      expect(createOperatorAvailabilityBlock).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'cust-2', date: todayKey(), viewerSubs: ['sub-2'] })
      );
    });

    expect(createOperatorAvailabilityBlock).not.toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cust-3' })
    );
  });

  it('skips customers that already have a block for that day when applying to everyone', async () => {
    (listAllCustomers as jest.Mock).mockResolvedValue({
      data: [
        { id: 'cust-1', name: 'Harcourts Epping', status: 'active', viewerSubs: ['sub-1'] },
        { id: 'cust-2', name: 'Ray White Eastwood', status: 'active', viewerSubs: ['sub-2'] },
      ],
      errors: undefined,
    });
    (listOperatorAvailabilityBlocks as jest.Mock).mockImplementation((customerId: string) => {
      if (customerId === 'cust-2') {
        return Promise.resolve({
          data: [{ id: 'existing', customerId: 'cust-2', date: todayKey() }],
          errors: undefined,
        });
      }
      return Promise.resolve({ data: [], errors: undefined });
    });

    render(
      <ServiceCalendar customerId="cust-1" role="staff" currentUserSub="sub-1" viewerSubs={['sub-1']} />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /block this day/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Apply to every customer'));
    fireEvent.click(screen.getByRole('button', { name: /block this day for every customer/i }));

    await waitFor(() => {
      expect(createOperatorAvailabilityBlock).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'cust-1' })
      );
    });

    expect(createOperatorAvailabilityBlock).not.toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cust-2' })
    );
  });

  it('shows a disabled "close a date range" stub for a customer admin, matching the design mockup', async () => {
    render(
      <ServiceCalendar customerId="cust-1" role="customer-admin" currentUserSub="owner-sub" viewerSubs={['owner-sub']} />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /close a date range/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /close a date range/i })).toBeDisabled();
  });
});
