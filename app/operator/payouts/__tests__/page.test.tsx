import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import OperatorPayoutsPage from '../page';
import { useLiveAllRoutes } from '@/lib/useLiveRoutes';
import { useMyPayouts } from '@/lib/useMyPayouts';
import { listAllCustomers } from '@/lib/customers';
import type { OperatorPayout, Route } from '@/amplify/types';

jest.mock('@/lib/use-user-groups', () => ({ useCurrentUserId: () => 'operator-me' }));
jest.mock('@/lib/useLiveRoutes', () => ({ useLiveAllRoutes: jest.fn() }));
jest.mock('@/lib/useMyPayouts', () => ({ useMyPayouts: jest.fn() }));
jest.mock('@/lib/customers', () => ({ listAllCustomers: jest.fn() }));

const payout = (over: Partial<OperatorPayout>): OperatorPayout =>
  ({ id: 'p', operatorSub: 'operator-me', customerId: 'cust-1', amount: 100, status: 'paid', periodEndDate: '2024-03-09', ...over }) as OperatorPayout;
const route = (over: Partial<Route>): Route =>
  ({ id: 'r', customerId: 'cust-1', status: 'completed', assignedOperatorSub: 'operator-me', actualEndTime: '2024-03-09T00:00:00Z', ...over }) as Route;

function tile(label: string, section: string) {
  const card = screen.getByText(section).closest('.nd-card') as HTMLElement;
  return within(card).getByText(label).closest('.nd-stat') as HTMLElement;
}

describe('Operator payouts page', () => {
  beforeEach(() => {
    (listAllCustomers as jest.Mock).mockResolvedValue([{ id: 'cust-1', name: 'Beltline Group' }]);
    (useLiveAllRoutes as jest.Mock).mockReturnValue({
      routes: [
        route({ id: 'r1' }),
        route({ id: 'r2', actualEndTime: '2024-03-16T00:00:00Z' }),
        route({ id: 'other', assignedOperatorSub: 'someone-else' }),
        route({ id: 'unassigned', assignedOperatorSub: undefined }),
        route({ id: 'open', status: 'in_progress' }),
      ],
      loading: false,
    });
    (useMyPayouts as jest.Mock).mockReturnValue({
      payouts: [
        payout({ id: 'a', amount: 60, status: 'paid', paidAt: '2024-03-20T00:00:00Z' }),
        payout({ id: 'b', amount: 40, status: 'pending', periodEndDate: '2024-03-16' }),
      ],
      loading: false,
      error: null,
    });
  });

  it('summarises all time from this operator’s payouts and completed routes only', async () => {
    render(<OperatorPayoutsPage />);
    const allTime = tile('Paid', 'All time');
    expect(allTime).toHaveTextContent('$60.00');
    expect(tile('Outstanding', 'All time')).toHaveTextContent('$40.00');
    expect(tile('Routes completed', 'All time')).toHaveTextContent('2');
    expect(tile('Average per route', 'All time')).toHaveTextContent('$50.00');
    expect(tile('Largest payout', 'All time')).toHaveTextContent('$60.00');
  });

  it('shows nothing for the year to date when every payout is from earlier years', () => {
    render(<OperatorPayoutsPage />);
    expect(tile('Paid', 'Year to date')).toHaveTextContent('$0.00');
    expect(tile('Average per route', 'Year to date')).toHaveTextContent('—');
  });

  it('lists the months and every payout with its customer and status', async () => {
    render(<OperatorPayoutsPage />);
    expect(screen.getByText('March 2024')).toBeInTheDocument();
    expect(await screen.findAllByText('Beltline Group')).toHaveLength(2);
    expect(screen.getByText('Paid', { selector: '.nd-badge, .nd-badge *' })).toBeInTheDocument();
    expect(screen.getByText('Pending', { selector: '.nd-badge, .nd-badge *' })).toBeInTheDocument();
  });

  it('flags a payout dated from when it was raised', () => {
    (useMyPayouts as jest.Mock).mockReturnValue({
      payouts: [payout({ periodEndDate: null, createdAt: '2024-05-02T00:00:00Z' })],
      loading: false,
      error: null,
    });
    render(<OperatorPayoutsPage />);
    expect(screen.getByText(/date estimated/)).toBeInTheDocument();
  });

  it('shows empty states and an error', () => {
    (useLiveAllRoutes as jest.Mock).mockReturnValue({ routes: [], loading: false });
    (useMyPayouts as jest.Mock).mockReturnValue({ payouts: [], loading: false, error: 'Failed to load payouts.' });
    render(<OperatorPayoutsPage />);
    expect(screen.getByText('No payouts yet')).toBeInTheDocument();
    expect(screen.getByText(/Could not load payouts/)).toBeInTheDocument();
  });
});
