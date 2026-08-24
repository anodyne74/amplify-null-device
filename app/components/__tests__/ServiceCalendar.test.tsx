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
});
