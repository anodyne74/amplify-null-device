import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RouteEstimateCard } from './RouteEstimateCard';
import { calculateRouteEstimate, getRouteEstimate } from '@/lib/routeEstimates';

jest.mock('@/lib/routeEstimates', () => ({
  ...jest.requireActual('@/lib/routeEstimates'),
  getRouteEstimate: jest.fn(),
  calculateRouteEstimate: jest.fn(),
}));

const stops = [
  { id: 's1', formattedAddress: '1 Alpha St' },
  { id: 's2', formattedAddress: '2 Beta St' },
];

const estimate = (totalMeters: number) => ({
  id: 'r1',
  totalMeters,
  calculatedAt: '2026-10-09T01:00:00Z',
  leftOutNoPin: 1,
  leftOutRemoved: 0,
  legs: [
    { order: 1, fromStopId: null, toStopId: 's1', distanceMeters: 4000 },
    { order: 2, fromStopId: 's1', toStopId: 's2', distanceMeters: 2500 },
    { order: 3, fromStopId: 's2', toStopId: null, distanceMeters: 3500 },
  ],
});

beforeEach(() => jest.clearAllMocks());

describe('RouteEstimateCard', () => {
  it('offers to calculate when there is no estimate, and shows it once calculated', async () => {
    (getRouteEstimate as jest.Mock).mockResolvedValue({ data: null });
    (calculateRouteEstimate as jest.Mock).mockResolvedValue({ ok: true, estimate: estimate(10000) });

    render(<RouteEstimateCard routeId="r1" stops={stops} />);

    expect(await screen.findByText(/no estimate yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /calculate estimate/i }));

    expect(await screen.findByText('10.0 km')).toBeInTheDocument();
    expect(screen.getByText(/Home base → 1 Alpha St: 4.0 km/)).toBeInTheDocument();
    expect(screen.getByText(/2 Beta St → Home base: 3.5 km/)).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('1 Stop with no pin');
  });

  it('shows the stored estimate on load without calculating', async () => {
    (getRouteEstimate as jest.Mock).mockResolvedValue({ data: estimate(10000) });

    render(<RouteEstimateCard routeId="r1" stops={stops} />);

    expect(await screen.findByText('10.0 km')).toBeInTheDocument();
    expect(calculateRouteEstimate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /recalculate estimate/i })).toBeInTheDocument();
  });

  it('keeps the previous estimate and offers a retry when a calculation fails', async () => {
    (getRouteEstimate as jest.Mock).mockResolvedValue({ data: estimate(10000) });
    (calculateRouteEstimate as jest.Mock)
      .mockResolvedValueOnce({ ok: false, error: 'Google Routes could not calculate the drive: quota' })
      .mockResolvedValueOnce({ ok: true, estimate: estimate(12000) });

    render(<RouteEstimateCard routeId="r1" stops={stops} />);
    await screen.findByText('10.0 km');
    fireEvent.click(screen.getByRole('button', { name: /recalculate estimate/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/quota/);
    expect(screen.getByText('10.0 km')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(screen.getByText('12.0 km')).toBeInTheDocument());
    expect(calculateRouteEstimate).toHaveBeenCalledTimes(2);
  });

  it('shows the reason when there is nothing to calculate from', async () => {
    (getRouteEstimate as jest.Mock).mockResolvedValue({ data: null });
    (calculateRouteEstimate as jest.Mock).mockResolvedValue({ ok: false, error: 'This Route has no Operator.' });

    render(<RouteEstimateCard routeId="r1" stops={stops} />);
    fireEvent.click(await screen.findByRole('button', { name: /calculate estimate/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This Route has no Operator.');
  });
});
