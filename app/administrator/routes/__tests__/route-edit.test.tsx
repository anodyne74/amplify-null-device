import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RouteEditPage from '../edit/page';
import * as routeDetailModule from '@/lib/queries/GetRouteDetail';
import * as customersModule from '@/lib/queries/ListAllCustomers';
import * as queriesModule from '@/lib/queries';
import type { Route, Stop } from '@/amplify/types';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'id' ? 'route-test-id-1234' : null) }),
}));

jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({
    authStatus: 'authenticated',
    user: {
      userId: 'admin-1',
      signInUserSession: {
        idToken: { payload: { email: 'admin@example.com', 'cognito:groups': ['administrator'] } },
      },
    },
  }),
}));

jest.mock('@/app/components/OperatorRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/app/operator/components/StopForm', () => ({
  StopForm: () => <div data-testid="stop-form-mock">Stop form mock</div>,
}));

jest.mock('@/lib/googleMaps', () => ({
  geocodeAddress: jest.fn().mockResolvedValue({
    latitude: 38.8951,
    longitude: -77.0364,
    formattedAddress: 'Mock Address',
  }),
}));

jest.mock('@/app/operator/components/RouteStopsMap', () => ({
  RouteStopsMap: ({ activeStopId, onStopSelect }: { activeStopId?: string | null; onStopSelect?: (stopId: string) => void }) => (
    <div>
      <div data-testid="map-active-stop">{activeStopId ?? 'none'}</div>
      <button type="button" onClick={() => onStopSelect?.('stop-2')}>
        Select stop-2 from map
      </button>
    </div>
  ),
}));

jest.mock('@/lib/queries/GetRouteDetail');
jest.mock('@/lib/queries/ListAllCustomers');
jest.mock('@/lib/queries');
jest.mock('@/lib/queries/DeleteStop', () => ({
  deleteStop: jest.fn().mockResolvedValue({ data: {}, errors: undefined }),
}));
jest.mock('@/lib/queries/UpdateStop', () => ({
  updateStop: jest.fn().mockResolvedValue({ data: {}, errors: undefined }),
}));

let mockStopList: jest.Mock;

jest.mock('aws-amplify/data', () => {
  const stopList = jest.fn();
  return {
    generateClient: jest.fn(() => ({
      models: {
        Stop: { list: stopList },
      },
    })),
    __mocks: { stopList },
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
    latitude: 38.89,
    longitude: -77.03,
  },
  {
    id: 'stop-2',
    routeId: 'route-test-id-1234',
    sequence: 2,
    address: '200 Second Ave',
    serviceType: 'pickup',
    latitude: 38.9,
    longitude: -77.02,
  },
];

describe('Administrator Route Edit Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    const amplifyData = require('aws-amplify/data');
    const { __mocks } = amplifyData;
    mockStopList = __mocks.stopList;

    (routeDetailModule.getRouteDetail as jest.Mock).mockResolvedValue({
      data: mockRoute,
      errors: undefined,
    });

    (customersModule.listAllCustomers as jest.Mock).mockResolvedValue({
      data: [{ id: 'cust-abcd-5678', name: 'Acme Corp', email: 'ops@acme.com', addressLine1: '123 Main St' }],
      errors: undefined,
    });

    (queriesModule.getUserSettings as jest.Mock).mockResolvedValue({
      data: { mapTheme: 'light' },
      errors: undefined,
    });

    (queriesModule.createStop as jest.Mock).mockResolvedValue({ data: {}, errors: undefined });
    (queriesModule.updateRoute as jest.Mock).mockResolvedValue({ data: {}, errors: undefined });

    mockStopList.mockResolvedValue({
      data: mockStops,
      errors: undefined,
    });
  });

  it('syncs selected marker when a stop card is clicked', async () => {
    render(<RouteEditPage />);

    await waitFor(() => {
      expect(screen.getByText('100 First St')).toBeInTheDocument();
    });

    // Defaults to first stop when list loads.
    expect(screen.getByTestId('map-active-stop')).toHaveTextContent('stop-1');

    const secondAddress = screen.getByText('200 Second Ave');
    const secondRow = secondAddress.closest('.stopRow');
    expect(secondRow).toBeTruthy();

    fireEvent.click(secondAddress);

    await waitFor(() => {
      expect(screen.getByTestId('map-active-stop')).toHaveTextContent('stop-2');
    });

    expect(secondRow).toHaveClass('stopRowSelected');
  });

  it('syncs selected card when a map marker is clicked', async () => {
    render(<RouteEditPage />);

    await waitFor(() => {
      expect(screen.getByText('100 First St')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /select stop-2 from map/i }));

    await waitFor(() => {
      expect(screen.getByTestId('map-active-stop')).toHaveTextContent('stop-2');
    });

    const secondRow = screen.getByText('200 Second Ave').closest('.stopRow');
    expect(secondRow).toHaveClass('stopRowSelected');
  });
});
