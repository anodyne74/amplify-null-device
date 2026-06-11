import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import type { Route, Stop } from '@/amplify/types';
import RouteDetailContent from '../[id]/_RouteDetailContent';
import { getCustomerPortalContext, getRouteWithStops } from '@/lib/queries';

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
      actualDepartureTime: '2024-01-15T11:00:00Z',
    },
    {
      id: 'stop-2',
      routeId: 'route-1',
      sequence: 2,
      address: '200 Second St',
      latitude: -37.8236,
      longitude: 144.9731,
    },
    {
      id: 'stop-3',
      routeId: 'route-1',
      sequence: 3,
      address: '300 Third St',
      latitude: -37.8336,
      longitude: 144.9831,
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
  });
});
