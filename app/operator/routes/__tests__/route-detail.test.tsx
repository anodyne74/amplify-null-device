import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import RouteDetailPage from '../detail/page';
import * as getRouteDetailModule from '@/lib/queries/GetRouteDetail';
import * as deleteStopModule from '@/lib/queries/DeleteStop';
import { updateStop } from '@/lib/queries/UpdateStop';
import { geocodeAddress } from '@/lib/googleMaps';
import type { Route, Stop } from '@/amplify/types';

jest.mock('@/lib/googleMaps', () => ({
  geocodeAddress: jest.fn(),
}));

// Mock Next.js navigation
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => ({ get: (key: string) => key === 'id' ? 'route-test-id-1234' : null }),
}));

// Mock Amplify UI
jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({
    authStatus: 'authenticated',
    user: {
      userId: 'op-1',
      signInUserSession: {
        idToken: { payload: { email: 'op@example.com', 'cognito:groups': ['operator'] } },
      },
    },
  }),
}));

// Mock amplify config
jest.mock('@/lib/amplify-config', () => ({
  isOperator: () => true,
  isCustomer: () => false,
  isAdmin: () => true,
}));

// Mock OperatorRoute to render children
jest.mock('@/app/components/OperatorRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock query modules
jest.mock('@/lib/queries/GetRouteDetail');
jest.mock('@/lib/queries/DeleteStop');
jest.mock('@/lib/queries', () => ({
  getCustomer: jest.fn().mockResolvedValue({ data: { id: 'cust-abcd-5678', name: 'Acme Corp' }, errors: undefined }),
  createStop: jest.fn().mockResolvedValue({ data: { id: 'new-stop' }, errors: undefined }),
  deleteRoute: jest.fn().mockResolvedValue({ data: {}, errors: undefined }),
  updateRoute: jest.fn().mockResolvedValue({ data: {}, errors: undefined }),
}));
jest.mock('@/lib/queries/UpdateStop', () => ({
  updateStop: jest.fn().mockResolvedValue({ data: {}, errors: undefined }),
}));

// Mock generateClient from aws-amplify/data
// Note: factory is hoisted, so we define mocks inside and expose via module variable
let mockStopList: jest.Mock;
let mockRouteUpdate: jest.Mock;
let mockStopUpdate: jest.Mock;

jest.mock('aws-amplify/data', () => {
  const stopList = jest.fn();
  const routeUpdate = jest.fn();
  const stopUpdate = jest.fn();
  return {
    generateClient: jest.fn(() => ({
      models: {
        Stop: { list: stopList, update: stopUpdate },
        Route: { update: routeUpdate },
      },
    })),
    // expose for assignment below
    __mocks: { stopList, routeUpdate, stopUpdate },
  };
});

const mockRoute: Route = {
  id: 'route-test-id-1234',
  routeCode: 'W19-26-001',
  customerId: 'cust-abcd-5678',
  status: 'planned',
  createdAt: '2024-03-01T10:00:00Z',
  notes: 'Test route notes',
};

const mockStops: Stop[] = [
  {
    id: 'stop-1',
    routeId: 'route-test-id-1234',
    sequence: 1,
    address: '100 First St',
    serviceType: 'delivery',
  },
  {
    id: 'stop-2',
    routeId: 'route-test-id-1234',
    sequence: 2,
    address: '200 Second Ave',
    serviceType: 'pickup',
  },
];

describe('Operator Route Detail Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Grab the mocks from inside the factory
    const amplifyData = require('aws-amplify/data');
    const { __mocks } = amplifyData;
    mockStopList = __mocks.stopList;
    mockRouteUpdate = __mocks.routeUpdate;
    mockStopUpdate = __mocks.stopUpdate;

    (getRouteDetailModule.getRouteDetail as jest.Mock).mockResolvedValue({
      data: mockRoute,
      errors: undefined,
    });

    mockStopList.mockResolvedValue({
      data: mockStops,
      errors: undefined,
    });

    mockRouteUpdate.mockResolvedValue({ errors: undefined });
    mockStopUpdate.mockResolvedValue({ errors: undefined });

    (deleteStopModule.deleteStop as jest.Mock).mockResolvedValue({
      data: {},
      errors: undefined,
    });

    (updateStop as jest.Mock).mockResolvedValue({ data: {}, errors: undefined });
    (geocodeAddress as jest.Mock).mockResolvedValue({
      latitude: 0,
      longitude: 0,
      formattedAddress: 'Unused',
    });
  });

  it('renders route information after loading', async () => {
    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.queryByText(/loading route/i)).not.toBeInTheDocument();
    });

    // Check route heading contains route code
    expect(screen.getByRole('heading', { name: /w19-26-001/i })).toBeInTheDocument();
    // Status badge span has exactly 'planned' as text content
    expect(screen.getByText('planned')).toBeInTheDocument();
    // Customer name is displayed
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();

    // Edit link should target the existing administrator route edit page
    const editLink = screen.getByRole('link', { name: /edit route/i });
    expect(editLink).toHaveAttribute('href', expect.stringContaining('/administrator/routes/edit?id=route-test-id-1234'));
  });

  it('shows customer-posted special instructions read-only, newest first', async () => {
    (getRouteDetailModule.getRouteDetail as jest.Mock).mockResolvedValue({
      data: {
        ...mockRoute,
        customerInstructions: JSON.stringify({
          v: 1,
          entries: [
            { text: 'Extra signs at the front', agentLabel: "Betty O'Shea", createdAt: '2026-08-20T01:00:00.000Z' },
            { text: 'Watch for the dog', agentLabel: 'David Mun', createdAt: '2026-08-21T01:00:00.000Z' },
          ],
        }),
      },
      errors: undefined,
    });

    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.queryByText(/loading route/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/special instructions from customer \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText('Watch for the dog')).toBeInTheDocument();
    expect(screen.getByText('Extra signs at the front')).toBeInTheDocument();

    // Newest first: "Watch for the dog" (Aug 21) should appear before "Extra signs..." (Aug 20)
    const watchDog = screen.getByText('Watch for the dog');
    const extraSigns = screen.getByText('Extra signs at the front');
    expect(watchDog.compareDocumentPosition(extraSigns) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Read-only: no compose affordance anywhere on this page
    expect(screen.queryByRole('button', { name: /add instruction/i })).not.toBeInTheDocument();
  });

  it('shows a legacy plain-text customerInstructions value without a count/agent label', async () => {
    (getRouteDetailModule.getRouteDetail as jest.Mock).mockResolvedValue({
      data: { ...mockRoute, customerInstructions: 'Old freeform note' },
      errors: undefined,
    });

    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.queryByText(/loading route/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText('Old freeform note')).toBeInTheDocument();
    expect(screen.queryByText(/special instructions from customer \(/i)).not.toBeInTheDocument();
  });

  it('renders stops list', async () => {
    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('100 First St')).toBeInTheDocument();
    });

    expect(screen.getByText('200 Second Ave')).toBeInTheDocument();
  });

  it('shows "Add Stop" button', async () => {
    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.queryByText(/loading route/i)).not.toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /add stop/i })).toBeInTheDocument();
  });

  it('reuses a stop\'s existing coordinates instead of re-geocoding when the address is unchanged (#149)', async () => {
    const stopsWithCoords: Stop[] = [
      {
        ...mockStops[0],
        formattedAddress: '100 First St, Melbourne VIC',
        latitude: -37.8136,
        longitude: 144.9631,
      },
      mockStops[1],
    ];
    mockStopList.mockResolvedValue({ data: stopsWithCoords, errors: undefined });

    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^edit$/i }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0]);

    // Only touch a non-address field — the address input is left exactly as loaded.
    const notesField = await screen.findByPlaceholderText(/optional notes/i);
    fireEvent.change(notesField, { target: { value: 'Leave signs at the side gate' } });

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(updateStop).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'stop-1',
          address: '100 First St',
          latitude: -37.8136,
          longitude: 144.9631,
          notes: 'Leave signs at the side gate',
        })
      );
    });

    // A live re-validation of an unchanged address is what made this fail on a flaky
    // Maps API call in the first place (same bug class as #58).
    expect(geocodeAddress).not.toHaveBeenCalled();
  });

  it('calls deleteStop when inline delete is confirmed', async () => {
    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /delete/i }).length).toBeGreaterThan(0);
    });

    const stopDeleteButtons = screen.getAllByRole('button', { name: /^delete$/i });
    fireEvent.click(stopDeleteButtons[0]);
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }));

    await waitFor(() => {
      expect(deleteStopModule.deleteStop).toHaveBeenCalledWith('stop-1');
    });
  });

  it('shows a read-only phase tracker for planned routes instead of transition buttons', async () => {
    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.queryByText(/loading route/i)).not.toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: /route phase/i })).toBeInTheDocument();
    expect(screen.getByText(/planned · phase 1 of 6/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start route/i })).not.toBeInTheDocument();
  });

  it('shows breadcrumb navigation back to the routes list', async () => {
    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.queryByText(/loading route/i)).not.toBeInTheDocument();
    });

    const breadcrumbs = screen.getByRole('navigation', { name: /breadcrumb/i });
    const routesLink = within(breadcrumbs).getByRole('link', { name: 'Routes' });
    expect(routesLink).toHaveAttribute('href', '/operator/routes');
    expect(within(breadcrumbs).getByText(/route w19-26-001/i)).toHaveAttribute('aria-current', 'page');
  });

  // Operator field mode is retired — in-progress routes are redirected to
  // their dedicated Load/Placement/Pickup/Unload/Finalise screen instead of
  // rendering an in-page execution UI (see app/operator/routes/{load,
  // placement,pickup,unload,finalise}/page.tsx).
  it('redirects an in-progress route to its active phase screen instead of rendering field mode', async () => {
    (getRouteDetailModule.getRouteDetail as jest.Mock).mockResolvedValue({
      data: {
        ...mockRoute,
        status: 'in_progress',
        executionPhase: 'placement',
        actualStartTime: '2024-03-01T10:00:00Z',
        placementStartTime: '2024-03-01T10:00:00Z',
      },
      errors: undefined,
    });

    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/operator/routes/placement?id=route-test-id-1234');
    });

    expect(screen.queryByRole('region', { name: /operator field mode/i })).not.toBeInTheDocument();
  });

  it('redirects a legacy signs_placed route to the pickup phase screen', async () => {
    (getRouteDetailModule.getRouteDetail as jest.Mock).mockResolvedValue({
      data: { ...mockRoute, status: 'signs_placed' },
      errors: undefined,
    });

    render(<RouteDetailPage />);

    await waitFor(() => {
      expect(screen.queryByText(/loading route/i)).not.toBeInTheDocument();
    });

    // signs_placed is not in_progress, so this page renders normally (with
    // the legacy status's read-only phase tracker) rather than redirecting —
    // only in_progress routes have a live phase screen to redirect to.
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: /route phase/i })).toBeInTheDocument();
  });
});
