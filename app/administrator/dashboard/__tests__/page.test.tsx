import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import AdminHomePage from '../page';
import { listAllRoutes } from '@/lib/queries/ListAllRoutes';
import { listAllStops } from '@/lib/queries/ListAllStops';
import { listInvoices, listCustomerUsers } from '@/lib/queries';

jest.mock('@/app/components/OperatorRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/lib/queries/ListAllRoutes', () => ({
  listAllRoutes: jest.fn(),
}));

jest.mock('@/lib/queries/ListAllStops', () => ({
  listAllStops: jest.fn(),
}));

jest.mock('@/lib/queries', () => ({
  listInvoices: jest.fn(),
  listCustomerUsers: jest.fn(),
}));

const mockCustomerList = jest.fn();

jest.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      Customer: {
        list: mockCustomerList,
      },
    },
  }),
}));

describe('Administrator dashboard overview', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (listAllRoutes as jest.Mock).mockResolvedValue({
      data: [
        { id: 'route-1', customerId: 'customer-1', status: 'signs_placed', actualEndTime: new Date().toISOString() },
        { id: 'route-2', customerId: 'customer-2', status: 'completed', actualEndTime: new Date().toISOString() },
      ],
      nextToken: undefined,
      errors: undefined,
    });

    (listAllStops as jest.Mock).mockResolvedValue({
      data: [
        { id: 'stop-1', routeId: 'route-1', numberOfSigns: 5 },
        { id: 'stop-2', routeId: 'route-2', numberOfSigns: 2 },
      ],
      nextToken: undefined,
      errors: undefined,
    });

    (listInvoices as jest.Mock).mockResolvedValue({
      data: [
        { id: 'invoice-1', customerId: 'customer-1', totalAmount: 2000, invoiceDate: new Date().toISOString(), status: 'sent' },
        { id: 'invoice-2', customerId: 'customer-2', totalAmount: 500, invoiceDate: new Date().toISOString(), status: 'draft' },
      ],
      nextToken: undefined,
      errors: undefined,
    });

    (listCustomerUsers as jest.Mock).mockResolvedValue({
      data: [{ customerId: 'customer-1', role: 'account_owner' }],
      errors: undefined,
    });

    mockCustomerList.mockResolvedValue({
      data: [
        { id: 'customer-1', name: 'Acme Corp' },
        { id: 'customer-2', name: 'Beta Signs' },
      ],
      nextToken: undefined,
      errors: undefined,
    });
  });

  it('renders overview stat tiles, charts, customer volume, and needs-attention derived from live data', async () => {
    render(<AdminHomePage />);

    expect(screen.getByRole('heading', { name: /administrator portal/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Billed this month')).toBeInTheDocument();
    });

    expect(screen.getByText('Routes / stops')).toBeInTheDocument();
    expect(screen.getByText('Outstanding')).toBeInTheDocument();
    expect(screen.getByText('Signs in field')).toBeInTheDocument();

    // Only route-1 (signs_placed) contributes to "signs in field" — its stop carries 5 signs.
    await waitFor(() => {
      expect(screen.getAllByText('5').length).toBeGreaterThan(0);
    });

    expect(screen.getByRole('heading', { name: /billings by week/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /route status/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /customers by volume/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /needs attention/i })).toBeInTheDocument();

    // Beta Signs has no account owner (only customer-1 does) — surfaces in both the volume
    // table and as an access issue in "Needs attention".
    await waitFor(() => {
      expect(screen.getAllByText('Beta Signs').length).toBeGreaterThan(1);
    });
    expect(screen.getByText('No account owner set')).toBeInTheDocument();
  });

  it('shows an empty state when there is no recent customer activity', async () => {
    (listAllRoutes as jest.Mock).mockResolvedValue({ data: [], nextToken: undefined, errors: undefined });
    (listAllStops as jest.Mock).mockResolvedValue({ data: [], nextToken: undefined, errors: undefined });
    (listInvoices as jest.Mock).mockResolvedValue({ data: [], nextToken: undefined, errors: undefined });

    render(<AdminHomePage />);

    expect(await screen.findByText('No customer activity in the last 30 days.')).toBeInTheDocument();
    expect(screen.getByText('Nothing needs attention right now.')).toBeInTheDocument();
  });
});
