import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import RouteSheetPage from '../sheet/page';

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'id' ? 'abcdef123456' : null) }),
}));

const mockOperatorRoute = jest.fn(({ children }: { children: React.ReactNode; requireAdmin?: boolean }) => <>{children}</>);
jest.mock('@/app/components/OperatorRoute', () => ({
  __esModule: true,
  default: (props: { children: React.ReactNode; requireAdmin?: boolean }) => mockOperatorRoute(props),
}));

jest.mock('@/lib/customers', () => ({
  getCustomer: jest.fn().mockResolvedValue({ id: 'cust-1', name: 'Ray White Epping' }),
}));

const mockUseRouteWithStops = jest.fn();
jest.mock('@/lib/useRouteWithStops', () => ({
  useRouteWithStops: (id: string | null) => mockUseRouteWithStops(id),
}));

const route = {
  id: 'abcdef123456',
  customerId: 'cust-1',
  assignedOperatorName: 'Sam Operator',
  scheduledDate: '2026-10-16',
  pickupDate: '2026-10-17',
};

const stops = [
  { id: 's2', sequence: 2, address: '9 Grayson Road', agent: 'DM', numberOfSigns: 2, isAuction: true, notes: 'Side gate' },
  { id: 's1', sequence: 1, address: '20 Gloucester Road', agent: 'JB', numberOfSigns: 5 },
  { id: 's3', sequence: 3, address: '55 Boundary Road', numberOfSigns: 1, removed: true },
];

beforeEach(() => {
  mockUseRouteWithStops.mockReturnValue({ route, stops, loading: false, error: null });
});

describe('Route Sheet page', () => {
  it('requires an administrator', async () => {
    render(<RouteSheetPage />);
    await screen.findByText('Ray White Epping');
    expect(mockOperatorRoute).toHaveBeenCalledWith(expect.objectContaining({ requireAdmin: true }));
  });

  it('shows the Route reference, Customer, Operator and dates', async () => {
    render(<RouteSheetPage />);
    expect(screen.getByRole('heading', { name: 'Route abcdef12' })).toBeInTheDocument();
    expect(await screen.findByText('Ray White Epping')).toBeInTheDocument();
    expect(screen.getByText('Sam Operator')).toBeInTheDocument();
  });

  it('lists Stops in order, leaves out Removed Stops, and gives each Place and Pickup boxes', async () => {
    render(<RouteSheetPage />);
    await screen.findByText('Ray White Epping');
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('20 Gloucester Road')).toBeInTheDocument();
    expect(within(rows[1]).getByText('9 Grayson Road')).toBeInTheDocument();
    expect(screen.queryByText('55 Boundary Road')).not.toBeInTheDocument();
    expect(within(rows[1]).getByLabelText('Place 2')).toBeInTheDocument();
    expect(within(rows[1]).getByLabelText('Pickup 2')).toBeInTheDocument();
  });

  it('marks only auction Stops, and shows agent, notes and signs', async () => {
    render(<RouteSheetPage />);
    await screen.findByText('Ray White Epping');
    expect(screen.getAllByText('AUCTION')).toHaveLength(1);
    const auctionRow = screen.getByText('9 Grayson Road').closest('tr') as HTMLElement;
    expect(within(auctionRow).getByText('AUCTION')).toBeInTheDocument();
    expect(within(auctionRow).getByText('DM')).toBeInTheDocument();
    expect(within(auctionRow).getByText('Side gate')).toBeInTheDocument();
    expect(within(auctionRow).getAllByRole('cell')[3]).toHaveTextContent('2');
  });
});
