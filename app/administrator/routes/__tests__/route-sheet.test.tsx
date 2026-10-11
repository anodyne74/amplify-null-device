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

const mockGetRouteEstimate = jest.fn();
jest.mock('@/lib/routeEstimates', () => ({
  ...jest.requireActual('@/lib/routeEstimates'),
  getRouteEstimate: (id: string) => mockGetRouteEstimate(id),
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
  mockGetRouteEstimate.mockResolvedValue({ data: null });
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
    const rows = within(screen.getAllByRole('table')[0]).getAllByRole('row').slice(1);
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

  it('shows the Route notes and Customer instructions, and no block when both are empty', async () => {
    mockUseRouteWithStops.mockReturnValue({
      route: { ...route, notes: 'Gate code 1234', customerInstructions: 'Board on the left' },
      stops,
      loading: false,
      error: null,
    });
    const { unmount } = render(<RouteSheetPage />);
    const block = await screen.findByLabelText('Instructions');
    expect(block).toHaveTextContent('Gate code 1234');
    expect(block).toHaveTextContent('Board on the left');
    unmount();

    mockUseRouteWithStops.mockReturnValue({ route, stops, loading: false, error: null });
    render(<RouteSheetPage />);
    await screen.findByText('Ray White Epping');
    expect(screen.queryByLabelText('Instructions')).not.toBeInTheDocument();
  });

  it('has blank Start and End boxes for Load, Placement, Pickup and Unload', async () => {
    render(<RouteSheetPage />);
    await screen.findByText('Ray White Epping');
    const grid = screen.getByRole('table', { name: 'Times' });
    const rows = within(grid).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual([
      'Load',
      'Placement',
      'Pickup',
      'Unload',
    ]);
    rows.forEach((row) => within(row).getAllByRole('cell').forEach((cell) => expect(cell).toBeEmptyDOMElement()));
  });

  it('shows the Signs Placed total without the Removed Stops', async () => {
    render(<RouteSheetPage />);
    await screen.findByText('Ray White Epping');
    expect(screen.getByText('Signs Placed:').parentElement).toHaveTextContent('Signs Placed: 7');
  });

  it('shows the distance of a current Route Estimate', async () => {
    mockUseRouteWithStops.mockReturnValue({
      route: { ...route, assignedOperatorSub: 'op-1' },
      stops: [{ id: 's1', sequence: 1, address: '20 Gloucester Road', latitude: -33.8, longitude: 151.1 }],
      loading: false,
      error: null,
    });
    mockGetRouteEstimate.mockResolvedValue({
      data: {
        operatorSub: 'op-1',
        stopIds: ['s1'],
        stopPins: [{ stopId: 's1', latitude: -33.8, longitude: 151.1 }],
        totalMeters: 12345,
      },
    });
    render(<RouteSheetPage />);
    expect(await screen.findByText('12.3 km')).toBeInTheDocument();
    expect(screen.queryByLabelText('Distance blank')).not.toBeInTheDocument();
  });

  it('leaves a blank Distance box when the Route Estimate is out of date or missing', async () => {
    mockGetRouteEstimate.mockResolvedValue({
      data: { operatorSub: 'op-1', stopIds: ['gone'], stopPins: [], totalMeters: 99000 },
    });
    render(<RouteSheetPage />);
    await screen.findByText('Ray White Epping');
    expect(screen.getByLabelText('Distance blank')).toBeInTheDocument();
    expect(screen.queryByText(/km/)).not.toBeInTheDocument();
  });
});
