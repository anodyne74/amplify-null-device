import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Route, Stop } from '@/amplify/types';
import RouteDetailContent from '../[id]/_RouteDetailContent';
import { getCustomerPortalContext, getRouteWithStops, updateRoute, updateRouteCustomerInstructions } from '@/lib/queries';

jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({
    authStatus: 'authenticated',
    user: {
      userId: 'viewer-sub-1',
      username: 'viewer-sub-1',
    },
  }),
}));

jest.mock('@/app/components/ProtectedRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/lib/queries/GetRouteDetail', () => ({
  getRouteDetail: jest.fn().mockResolvedValue({
    data: {
      id: 'route-1',
      routeCode: 'W19-26-001',
      customerId: 'cust-1',
      status: 'in_progress',
      executionPhase: 'placement',
      createdAt: '2024-01-15T10:00:00Z',
    },
    errors: undefined,
  }),
}));

jest.mock('@/lib/queries', () => ({
  getCustomerPortalContext: jest.fn(),
  getRouteWithStops: jest.fn(),
  updateRouteCustomerInstructions: jest.fn(),
  updateRoute: jest.fn(),
}));

jest.mock('@/app/operator/components/RouteStopsMap', () => ({
  RouteStopsMap: ({
    stops,
    activeStopId,
    upcomingStopIds,
    mapTheme,
  }: {
    stops: Stop[];
    activeStopId?: string | null;
    upcomingStopIds?: string[];
    mapTheme?: string;
  }) => (
    <div
      data-testid="customer-route-map"
      data-stop-count={stops.length}
      data-active-stop={activeStopId ?? ''}
      data-upcoming-stops={(upcomingStopIds ?? []).join(',')}
      data-map-theme={mapTheme ?? ''}
    />
  ),
}));

describe('Customer route detail tracker', () => {
  const route: Route = {
    id: 'route-1',
    routeCode: 'W19-26-001',
    customerId: 'cust-1',
    status: 'in_progress',
    executionPhase: 'placement',
    createdAt: '2024-01-15T10:00:00Z',
  } as Route;

  const stops: Stop[] = [
    {
      id: 'stop-1',
      routeId: 'route-1',
      sequence: 1,
      address: '100 First St',
      latitude: -37.8136,
      longitude: 144.9631,
      serviceType: 'delivery',
      numberOfSigns: 5,
      actualDepartureTime: '2024-01-15T11:00:00Z',
    },
    {
      id: 'stop-2',
      routeId: 'route-1',
      sequence: 2,
      address: '200 Second St',
      latitude: -37.8236,
      longitude: 144.9731,
      serviceType: 'delivery',
      numberOfSigns: 3,
    },
    {
      id: 'stop-3',
      routeId: 'route-1',
      sequence: 3,
      address: '300 Third St',
      latitude: -37.8336,
      longitude: 144.9831,
      serviceType: 'delivery',
      numberOfSigns: 4,
    },
  ] as Stop[];

  beforeEach(() => {
    jest.clearAllMocks();
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'read_only',
      customerId: 'cust-1',
    });
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route,
      stops,
      errors: [],
    });
    (updateRouteCustomerInstructions as jest.Mock).mockResolvedValue({ data: {}, errors: undefined });
    (updateRoute as jest.Mock).mockResolvedValue({ data: {}, errors: undefined });
  });

  it('lets a read-only customer user view their route tracker with map and stops', async () => {
    render(<RouteDetailContent params={{ id: 'route-1' }} />);

    expect(await screen.findByRole('heading', { name: /route w19-26-001/i })).toBeInTheDocument();

    const map = screen.getByTestId('customer-route-map');
    expect(map).toHaveAttribute('data-stop-count', '3');
    expect(map).toHaveAttribute('data-active-stop', 'stop-2');
    expect(map).toHaveAttribute('data-upcoming-stops', 'stop-3');
    expect(map).toHaveAttribute('data-map-theme', 'dark');
    expect(screen.getAllByText('200 Second St')).toHaveLength(2);

    await waitFor(() => {
      expect(getRouteWithStops).toHaveBeenCalledWith('route-1');
    });

    expect(screen.getByText('Signs out')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('lets a customer save special instructions for the route', async () => {
    render(<RouteDetailContent params={{ id: 'route-1' }} />);

    await screen.findByRole('heading', { name: /route w19-26-001/i });

    const instructionsField = screen.getByLabelText(/special instructions for this route/i);
    fireEvent.change(instructionsField, { target: { value: 'Leave signs at side gate' } });
    fireEvent.click(screen.getByRole('button', { name: /save instructions/i }));

    await waitFor(() => {
      expect(updateRouteCustomerInstructions).toHaveBeenCalledWith('route-1', 'Leave signs at side gate');
    });

    expect(await screen.findByText(/instructions saved/i)).toBeInTheDocument();
  });

  it('only shows the feedback card for a completed route, and lets a customer send it', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: { ...route, status: 'completed' },
      stops,
      errors: [],
    });

    render(<RouteDetailContent params={{ id: 'route-1' }} />);

    await screen.findByRole('heading', { name: /route w19-26-001/i });

    expect(screen.getByRole('heading', { name: /how did this route go\?/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^all good$/i }));
    fireEvent.click(screen.getByRole('button', { name: /send feedback/i }));

    await waitFor(() => {
      expect(updateRoute).toHaveBeenCalledWith('route-1', {
        customerFeedbackTone: 'good',
        customerFeedbackNote: '',
      });
    });

    expect(await screen.findByText(/feedback sent/i)).toBeInTheDocument();
  });

  it('hides the feedback card for a route that is not completed', async () => {
    render(<RouteDetailContent params={{ id: 'route-1' }} />);

    await screen.findByRole('heading', { name: /route w19-26-001/i });

    expect(screen.queryByRole('heading', { name: /how did this route go\?/i })).not.toBeInTheDocument();
  });
});
