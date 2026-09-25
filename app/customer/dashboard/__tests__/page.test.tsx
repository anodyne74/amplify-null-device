import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import CustomerDashboard from '../page';
import {
  getCustomer,
  getCustomerPortalContext,
} from '@/lib/queries';
import { listMyRoutes } from '@/lib/queries/ListMyRoutes';
import { listMyInvoices } from '@/lib/queries/ListMyInvoices';

jest.mock('@/app/dashboard.module.css', () => ({}));

jest.mock('@/lib/use-user-groups', () => ({
  useCurrentUserId: () => 'user-sub-1',
}));

jest.mock('@/lib/amplify-config', () => ({
  fetchUserDisplayName: () => Promise.resolve('Owner Name'),
  getUserEmail: () => 'owner@example.com',
}));

jest.mock('@/lib/queries', () => ({
  getCustomer: jest.fn(),
  getCustomerPortalContext: jest.fn(),
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

const NOW = new Date();
// Day 1 of the current month is guaranteed to be earlier than NOW (whatever
// day the suite happens to run on), so this reliably sorts before NOW_ISO.
const CURRENT_MONTH_DATE = new Date(NOW.getFullYear(), NOW.getMonth(), 1, 9, 0, 0).toISOString();
const NOW_ISO = NOW.toISOString();

describe('Customer Dashboard', () => {
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
    (listMyRoutes as jest.Mock).mockResolvedValue({
      data: [
        { id: 'route-1', routeCode: 'W19-26-001', status: 'signs_placed', createdAt: NOW_ISO },
        {
          id: 'route-2',
          routeCode: 'W19-26-002',
          status: 'completed',
          createdAt: CURRENT_MONTH_DATE,
          actualEndTime: CURRENT_MONTH_DATE,
        },
      ],
      errors: undefined,
    });
    (listMyInvoices as jest.Mock).mockResolvedValue({
      data: [
        { id: 'inv-1', totalAmount: 1200, status: 'paid', invoiceDate: CURRENT_MONTH_DATE },
        { id: 'inv-2', totalAmount: 800, status: 'sent', invoiceDate: NOW_ISO },
      ],
      errors: undefined,
    });
    mockStopList.mockResolvedValue({
      data: [
        {
          id: 'stop-1',
          routeId: 'route-1',
          numberOfSigns: 3,
          agent: 'Jamie Lee',
          address: '1 Example St',
          actualArrivalTime: NOW_ISO,
        },
        {
          id: 'stop-2',
          routeId: 'route-1',
          numberOfSigns: 2,
          agent: 'Jamie Lee',
          address: '2 Example St',
          actualArrivalTime: NOW_ISO,
        },
        {
          id: 'stop-3',
          routeId: 'route-2',
          numberOfSigns: 4,
          agent: 'Pat Doe',
          address: '3 Example St',
          actualArrivalTime: NOW_ISO,
        },
      ],
      errors: undefined,
    });
  });

  it('shows month-to-date financial stats, spend chart, latest invoice, and spend-by-agent table for the account owner', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'account_owner',
      customerId: 'cust-1',
    });

    render(<CustomerDashboard />);

    expect(await screen.findByText(/welcome, owner name · owner/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^dashboard$/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/invoiced this month/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/^outstanding$/i)).toBeInTheDocument();
    expect(screen.getByText(/routes completed/i)).toBeInTheDocument();
    expect(screen.getByText(/avg cost per stop/i)).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: /spend by week/i })).toBeInTheDocument();

    const latestInvoiceHeading = await screen.findByRole('heading', { name: /latest invoice/i });
    const latestInvoiceCard = latestInvoiceHeading.closest('.nd-card') as HTMLElement;
    // The most recently dated invoice (inv-2, $800, sent) should win over inv-1.
    // ($800 also appears in "Outstanding" and the spend chart, so scope to the card.)
    expect(within(latestInvoiceCard).getByText(/\$800\.00/)).toBeInTheDocument();
    expect(within(latestInvoiceCard).getByText(/^sent$/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /see billing history/i })).toHaveAttribute('href', '/customer/invoices');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /spend by agent/i })).toBeInTheDocument();
    });
    expect(screen.getByText('Jamie Lee')).toBeInTheDocument();
    expect(screen.getByText('Pat Doe')).toBeInTheDocument();

    // Reachable via horizontal scroll on narrow viewports (issue #264) rather
    // than overflowing the card with no way to reach the off-screen columns.
    expect(screen.getByRole('table').closest('.nd-table-scroll')).toBeInTheDocument();

    expect(screen.queryByRole('heading', { name: /recent routes/i })).not.toBeInTheDocument();
  });

  it('hides financial dashboard surfaces for reviewer role and does not fetch invoices', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'read_only',
      customerId: 'cust-1',
    });

    render(<CustomerDashboard />);

    expect(await screen.findByText(/welcome, owner name · reviewer/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/current route/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/invoiced this month/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^outstanding$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /latest invoice/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /spend by agent/i })).not.toBeInTheDocument();
    expect(listMyInvoices).not.toHaveBeenCalled();
  });

  it('shows the earliest active route as "Current route", signs in field, and stops this week for the reviewer', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'read_only',
      customerId: 'cust-1',
    });

    render(<CustomerDashboard />);

    // route-1 (signs_placed) is still active, route-2 is completed — the
    // active route should win the "Current route" tile. The route code also
    // appears in the "Recent routes" table below, so scope to the stat tile.
    const currentRouteTile = (await screen.findByText(/current route/i)).closest('.nd-stat') as HTMLElement;
    await waitFor(() => {
      expect(within(currentRouteTile).getByText('W19-26-001')).toBeInTheDocument();
    });
    expect(within(currentRouteTile).getByText(/signs placed/i)).toBeInTheDocument();

    expect(screen.getByText(/signs in field/i)).toBeInTheDocument();
    // Signs on route-1's stops (3 + 2) count as "in field" since that route is signs_placed.
    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    expect(screen.getByText(/stops this week/i)).toBeInTheDocument();
  });

  it('lists recent routes with status badge, stop count, and a view link for the reviewer', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'read_only',
      customerId: 'cust-1',
    });

    render(<CustomerDashboard />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /recent routes/i })).toBeInTheDocument();
    });

    const viewLinks = await screen.findAllByRole('link', { name: /view/i });
    expect(viewLinks).toHaveLength(2);
    expect(viewLinks[0]).toHaveAttribute('href', expect.stringMatching(/\/customer\/routes\/route-1|\/customer\/routes\/route-2/));

    // The route code also appears in the "Current route" stat tile, so scope to the table.
    const table = screen.getByRole('table');
    expect(within(table).getByText('W19-26-001')).toBeInTheDocument();
    expect(within(table).getByText('W19-26-002')).toBeInTheDocument();

    // Reachable via horizontal scroll on narrow viewports (issue #264) rather
    // than overflowing the card with no way to reach the off-screen columns.
    expect(table.closest('.nd-table-scroll')).toBeInTheDocument();
  });

  it('shows a "This week" activity list with route-phase badges for the reviewer', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'read_only',
      customerId: 'cust-1',
    });

    render(<CustomerDashboard />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /this week/i })).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('1 Example St')).toBeInTheDocument();
    });
  });
});
