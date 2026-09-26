import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RouteEditPage from '../edit/page';
import * as customersModule from '@/lib/customers';
import * as queriesModule from '@/lib/queries';
import * as routesModule from '@/lib/routes';
import { callApi } from '@/lib/apiClient';
import type { Route, Stop } from '@/amplify/types';

const mockRouterPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  useSearchParams: () => ({ get: (key: string) => (key === 'id' ? 'route-test-id-1234' : null) }),
}));

jest.mock('@/lib/apiClient', () => ({
  callApi: jest.fn(),
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

jest.mock('@/lib/customers');
jest.mock('@/lib/queries');
jest.mock('@/lib/routes');

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

const mockOperators = [
  { sub: 'op-sub-1', name: 'Operator One', email: 'operator-one@example.com' },
  { sub: 'op-sub-2', name: 'Operator Two', email: 'operator-two@example.com' },
];

describe('Administrator Route Edit Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (callApi as jest.Mock).mockImplementation(async (path: string) => {
      if (path === '/api/admin/users') return { users: mockOperators };
      if (path === '/api/admin/send-job-assigned-email') return { sentTo: 'operator-one@example.com' };
      return {};
    });

    (customersModule.listAllCustomers as jest.Mock).mockResolvedValue({
      data: [{ id: 'cust-abcd-5678', name: 'Acme Corp', email: 'ops@acme.com', addressLine1: '123 Main St' }],
      errors: undefined,
    });

    (queriesModule.getUserSettings as jest.Mock).mockResolvedValue({
      data: { mapTheme: 'light' },
      errors: undefined,
    });

    (routesModule.getRouteWithStops as jest.Mock).mockResolvedValue({
      route: mockRoute,
      stops: mockStops,
      errors: undefined,
    });

    (routesModule.createStop as jest.Mock).mockResolvedValue({ data: {}, errors: undefined });
    (routesModule.updateRoute as jest.Mock).mockResolvedValue({ data: {}, errors: undefined });
  });

  it('syncs selected marker when a stop card is clicked', async () => {
    render(<RouteEditPage />);

    await waitFor(() => {
      expect(screen.getByText('100 First St')).toBeInTheDocument();
    });

    // Defaults to first stop when list loads.
    await waitFor(() => {
      expect(screen.getByTestId('map-active-stop')).toHaveTextContent('stop-1');
    });

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

  it('allows editing and saving the route code (#61)', async () => {
    render(<RouteEditPage />);

    const routeCodeInput = await screen.findByLabelText(/route code/i);
    expect(routeCodeInput).toHaveValue('W19-26-001');

    fireEvent.change(routeCodeInput, { target: { value: 'W19-26-999' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(routesModule.updateRoute).toHaveBeenCalledWith(
        'route-test-id-1234',
        expect.objectContaining({ routeCode: 'W19-26-999' })
      );
    });
  });

  it('rejects saving with an empty route code', async () => {
    render(<RouteEditPage />);

    const routeCodeInput = await screen.findByLabelText(/route code/i);
    fireEvent.change(routeCodeInput, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText('Route code is required.')).toBeInTheDocument();
    expect(routesModule.updateRoute).not.toHaveBeenCalled();
  });

  it('enables Notify Operator after assigning a previously-unassigned route and saving, without navigating away (#267)', async () => {
    render(<RouteEditPage />);

    await screen.findByLabelText(/route code/i);
    const notifyButton = screen.getByRole('button', { name: /notify operator/i });
    expect(notifyButton).toBeDisabled();

    fireEvent.change(await screen.findByLabelText(/assigned operator/i), {
      target: { value: 'op-sub-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(routesModule.updateRoute).toHaveBeenCalledWith(
        'route-test-id-1234',
        expect.objectContaining({ assignedOperatorEmail: 'operator-one@example.com' })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /notify operator/i })).toBeEnabled();
    });
    expect(mockRouterPush).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /notify operator/i }));

    await waitFor(() => {
      expect(callApi).toHaveBeenCalledWith('/api/admin/send-job-assigned-email', { routeId: 'route-test-id-1234' });
    });
  });

  it('enables Notify Operator for the new operator after reassigning an already-assigned route and saving', async () => {
    (routesModule.getRouteWithStops as jest.Mock).mockResolvedValue({
      route: {
        ...mockRoute,
        assignedOperatorSub: 'op-sub-1',
        assignedOperatorEmail: 'operator-one@example.com',
      },
      stops: mockStops,
      errors: undefined,
    });

    render(<RouteEditPage />);

    const operatorSelect = await screen.findByLabelText(/assigned operator/i);
    expect(operatorSelect).toHaveValue('op-sub-1');
    expect(screen.getByRole('button', { name: /notify operator/i })).toBeEnabled();

    fireEvent.change(operatorSelect, { target: { value: 'op-sub-2' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(routesModule.updateRoute).toHaveBeenCalledWith(
        'route-test-id-1234',
        expect.objectContaining({ assignedOperatorEmail: 'operator-two@example.com' })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /notify operator/i })).toBeEnabled();
    });
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('keeps Notify Operator disabled when saving a route with no assigned operator', async () => {
    (routesModule.getRouteWithStops as jest.Mock).mockResolvedValue({
      route: {
        ...mockRoute,
        assignedOperatorSub: 'op-sub-1',
        assignedOperatorEmail: 'operator-one@example.com',
      },
      stops: mockStops,
      errors: undefined,
    });

    render(<RouteEditPage />);

    const operatorSelect = await screen.findByLabelText(/assigned operator/i);
    expect(screen.getByRole('button', { name: /notify operator/i })).toBeEnabled();

    fireEvent.change(operatorSelect, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(routesModule.updateRoute).toHaveBeenCalledWith(
        'route-test-id-1234',
        expect.objectContaining({ assignedOperatorEmail: null })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /notify operator/i })).toBeDisabled();
    });
  });

  it('starts with Notify Operator enabled when re-opening the edit page for an already-assigned route (regression)', async () => {
    (routesModule.getRouteWithStops as jest.Mock).mockResolvedValue({
      route: {
        ...mockRoute,
        assignedOperatorSub: 'op-sub-1',
        assignedOperatorEmail: 'operator-one@example.com',
      },
      stops: mockStops,
      errors: undefined,
    });

    render(<RouteEditPage />);

    await screen.findByLabelText(/route code/i);
    expect(screen.getByRole('button', { name: /notify operator/i })).toBeEnabled();
  });
});
