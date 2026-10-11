import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Route } from '@/amplify/types';
import { AdministratorFinalisePanel } from '../AdministratorFinalisePanel';
import { finaliseRouteAsAdministrator } from '@/lib/administratorRouteActions';
import { getRouteEstimate } from '@/lib/routeEstimates';

jest.mock('@/lib/administratorRouteActions', () => ({ finaliseRouteAsAdministrator: jest.fn() }));
jest.mock('@/lib/routeEstimates', () => ({ getRouteEstimate: jest.fn().mockResolvedValue({ data: null }), formatKm: (m: number) => `${(m / 1000).toFixed(1)} km` }));

const finalise = finaliseRouteAsAdministrator as jest.Mock;

// Measured: load 0 (floored to 15m), placement 22 -> 20m, pickup 12 -> 10m, unload 18 -> 20m. Total 1h 5m.
const ROUTE = {
  id: 'route-1',
  customerId: 'cust-1',
  status: 'in_progress',
  executionPhase: 'unload',
  loadStartedAt: '2026-08-31T08:00:00.000Z',
  loadConfirmedAt: '2026-08-31T08:00:00.000Z',
  placementStartTime: '2026-08-31T08:15:00.000Z',
  placementEndTime: '2026-08-31T08:37:00.000Z',
  pickupStartTime: '2026-08-31T08:40:00.000Z',
  pickupEndTime: '2026-08-31T08:52:00.000Z',
  unloadStartedAt: '2026-08-31T08:52:00.000Z',
  unloadConfirmedAt: '2026-08-31T09:10:00.000Z',
} as Route;

function renderPanel() {
  const onFinalised = jest.fn();
  render(<AdministratorFinalisePanel route={ROUTE} stops={[]} onFinalised={onFinalised} />);
  fireEvent.click(screen.getByRole('button', { name: /round up to 1h 15m/i }));
  fireEvent.change(screen.getByLabelText('Distance (km)'), { target: { value: '37.5' } });
  return { onFinalised };
}

beforeEach(() => jest.clearAllMocks());

describe('AdministratorFinalisePanel', () => {
  it('finalises with the adjusted time and typed distance, then refreshes the Route', async () => {
    finalise.mockResolvedValue({ ok: true });
    const { onFinalised } = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Finalise route · 1h 15m' }));

    await waitFor(() => expect(onFinalised).toHaveBeenCalled());
    expect(finalise).toHaveBeenCalledWith(ROUTE, { billedMinutes: { load: 15, placement: 20, pickup: 10, unload: 30 }, distanceKm: 37.5 });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the panel and what was entered when the save fails', async () => {
    finalise.mockResolvedValue({ ok: false, error: 'Could not finalise the route. Nothing was changed.', saved: false });
    const { onFinalised } = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Finalise route · 1h 15m' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not finalise the route. Nothing was changed.');
    expect(screen.getByLabelText('Distance (km)')).toHaveValue('37.5');
    expect(onFinalised).not.toHaveBeenCalled();
  });

  it('refreshes the Route but shows the error when only the audit entry fails', async () => {
    finalise.mockResolvedValue({ ok: false, error: 'The route was finalised, but its audit entry could not be written.', saved: true });
    const { onFinalised } = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Finalise route · 1h 15m' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('its audit entry could not be written');
    expect(onFinalised).toHaveBeenCalled();
  });

  it('blocks finalising until the total lands on 15 minutes and the distance is valid', () => {
    render(<AdministratorFinalisePanel route={ROUTE} stops={[]} onFinalised={jest.fn()} />);
    expect(screen.getByRole('button', { name: /finalise route/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /round up to 1h 15m/i }));
    expect(screen.getByRole('button', { name: /finalise route/i })).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Distance (km)'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: /finalise route/i })).toBeDisabled();
    expect(finalise).not.toHaveBeenCalled();
  });

  describe('Route Estimate', () => {
    const estimate = {
      id: 'route-1',
      operatorSub: 'op-1',
      totalMeters: 13400,
      stopIds: ['s1', 's2'],
      stopPins: [
        { stopId: 's1', latitude: -37.8, longitude: 144.9 },
        { stopId: 's2', latitude: -37.9, longitude: 145.0 },
      ],
    };
    const route = { ...ROUTE, assignedOperatorSub: 'op-1' } as Route;
    const stops = [
      { id: 's1', sequence: 1, latitude: -37.8, longitude: 144.9 },
      { id: 's2', sequence: 2, latitude: -37.9, longitude: 145.0 },
    ];

    it('shows the estimate as it is while the Stops are as calculated', async () => {
      (getRouteEstimate as jest.Mock).mockResolvedValue({ data: estimate });
      render(<AdministratorFinalisePanel route={route} stops={stops as never} onFinalised={jest.fn()} />);

      expect(await screen.findByText(/Route Estimate 13\.4 km$/)).toBeInTheDocument();
    });

    it('says it is out of date once a Stop was removed on the day', async () => {
      (getRouteEstimate as jest.Mock).mockResolvedValue({ data: estimate });
      render(
        <AdministratorFinalisePanel
          route={route}
          stops={[stops[0], { ...stops[1], removed: true }] as never}
          onFinalised={jest.fn()}
        />
      );

      expect(await screen.findByText(/Route Estimate 13\.4 km \(out of date\)/)).toBeInTheDocument();
    });
  });
});
