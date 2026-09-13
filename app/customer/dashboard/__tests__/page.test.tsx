import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
        { id: 'route-1', routeCode: 'W19-26-001', status: 'signs_placed', createdAt: '2024-01-16T11:00:00Z' },
        {
          id: 'route-2',
          routeCode: 'W19-26-002',
          status: 'completed',
          createdAt: '2026-01-14T09:00:00Z',
          actualEndTime: '2026-01-14T12:00:00Z',
          actualDurationMinutes: 120,
          signsPlacedDistanceKm: 12.5,
          signsPickedUpDistanceKm: 10,
          overrideDurationMinutes: 150,
          overrideDistanceKm: 30,
          stops: 2,
          signsPlaced: 5,
          signsPickedUp: 5,
        },
      ],
      errors: undefined,
    });
    (listMyInvoices as jest.Mock).mockResolvedValue({
      data: [
        { id: 'inv-1', totalAmount: 1200, status: 'paid', invoiceDate: '2026-01-20T00:00:00Z' },
        { id: 'inv-2', totalAmount: 800, status: 'sent', invoiceDate: '2026-01-21T00:00:00Z' },
      ],
      errors: undefined,
    });
    mockStopList.mockResolvedValue({
      data: [
        {
          id: 'stop-1',
          routeId: 'route-1',
          sequence: 1,
          numberOfSigns: 3,
          latitude: -37.8136,
          longitude: 144.9631,
        },
        {
          id: 'stop-2',
          routeId: 'route-1',
          sequence: 2,
          numberOfSigns: 2,
          latitude: -37.814,
          longitude: 144.9731,
        },
        {
          id: 'stop-3',
          routeId: 'route-2',
          sequence: 1,
          numberOfSigns: 4,
          latitude: -37.82,
          longitude: 144.97,
        },
      ],
      errors: undefined,
    });
  });

  it('shows customer totals and performance metrics for account owner', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'account_owner',
      customerId: 'cust-1',
    });

    render(<CustomerDashboard />);

    expect(await screen.findByText(/welcome, owner name · owner/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^dashboard$/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /customer totals/i })).toBeInTheDocument();
    });

    expect(screen.getByText(/total invoiced amount/i)).toBeInTheDocument();
    expect(screen.getByText(/outstanding amount/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /performance metrics/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /revenue trend/i })).toBeInTheDocument();

    expect(screen.queryByText(/average signs per hour/i)).not.toBeInTheDocument();
  });

  it('calculates Total distance and Total hours from the route finalisation (override) values when present', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'account_owner',
      customerId: 'cust-1',
    });

    render(<CustomerDashboard />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /customer totals/i })).toBeInTheDocument();
    });

    // route-2 (the only completed route) has overrideDistanceKm: 30 and
    // overrideDurationMinutes: 150, which should win over the raw
    // signsPlaced/signsPickedUp distance sum (22.5) and actualDurationMinutes (120).
    await waitFor(() => {
      expect(screen.getByText(/^total distance$/i).closest('.nd-stat')).toHaveTextContent('30.0 km');
    });
    expect(screen.getByText(/^total hours$/i).closest('.nd-stat')).toHaveTextContent('2:30:00');
  });

  it('hides financial dashboard surfaces for reviewer role', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'read_only',
      customerId: 'cust-1',
    });

    render(<CustomerDashboard />);

    expect(await screen.findByText(/welcome, owner name · reviewer/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /route tracker/i })).toBeInTheDocument();
    });

    expect(screen.queryByText(/pending invoices/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/outstanding balance/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/total invoiced amount/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/outstanding amount/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/total revenue/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/average revenue/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /revenue trend/i })).not.toBeInTheDocument();
  });

  it('shows a route-first tracker for reviewer users without fetching invoices', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'read_only',
      customerId: 'cust-1',
    });

    render(<CustomerDashboard />);

    expect(await screen.findByRole('heading', { name: /route tracker/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /review route w19-26-001/i })).toHaveAttribute(
        'href',
        '/customer/routes/route-1'
      );
    });

    expect(screen.getByRole('link', { name: /review route w19-26-002/i })).toHaveAttribute(
      'href',
      '/customer/routes/route-2'
    );
    expect(listMyInvoices).not.toHaveBeenCalled();
    expect(screen.queryByText(/pending invoices/i)).not.toBeInTheDocument();
  });

  it('renames "Route stops" to "Active Route Stops" and counts only stops on active routes', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'read_only',
      customerId: 'cust-1',
    });

    render(<CustomerDashboard />);

    // route-1 is signs_placed (active) with 2 stops; route-2 is completed
    // with 1 stop — only the active route's stops should be counted.
    await waitFor(() => {
      expect(screen.getByText(/active route stops/i).closest('.nd-stat')).toHaveTextContent('2');
    });

    expect(screen.queryByText(/^route stops$/i)).not.toBeInTheDocument();
  });

  it('shows the stop count under the phase badge and drops the "Review route..." action label', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'read_only',
      customerId: 'cust-1',
    });

    render(<CustomerDashboard />);

    const routeLink = await screen.findByRole('link', { name: /review route w19-26-001/i });

    await waitFor(() => {
      expect(routeLink).toHaveTextContent('2 stops');
    });
    expect(routeLink).not.toHaveTextContent(/review route w19-26-001/i);
  });

});
