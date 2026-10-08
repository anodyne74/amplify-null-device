import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RouteEstimateCard } from './RouteEstimateCard';
import { calculateRouteEstimate, getRouteEstimate } from '@/lib/routeEstimates';

jest.mock('@/lib/routeEstimates', () => ({
  ...jest.requireActual('@/lib/routeEstimates'),
  getRouteEstimate: jest.fn(),
  calculateRouteEstimate: jest.fn(),
}));

const stops = [
  { id: 's1', sequence: 1, latitude: -33.7, longitude: 151.2, formattedAddress: '1 Alpha St' },
  { id: 's2', sequence: 2, latitude: -33.6, longitude: 151.3, formattedAddress: '2 Beta St' },
];
const noPinStop = { id: 's3', sequence: 3, latitude: null, longitude: null, formattedAddress: '3 Gamma St' };
const removedStop = { id: 's4', sequence: 4, latitude: -33.5, longitude: 151.4, removed: true, formattedAddress: '4 Delta St' };

const estimate = (totalMeters: number) => ({
  id: 'r1',
  operatorSub: 'op-1',
  stopIds: ['s1', 's2'],
  stopPins: [
    { stopId: 's1', latitude: -33.7, longitude: 151.2 },
    { stopId: 's2', latitude: -33.6, longitude: 151.3 },
  ],
  totalMeters,
  calculatedAt: '2026-10-09T01:00:00Z',
  leftOutNoPin: 0,
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

    render(<RouteEstimateCard routeId="r1" assignedOperatorSub="op-1" stops={stops} />);

    expect(await screen.findByText(/no estimate yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /calculate estimate/i }));

    expect(await screen.findByText('10.0 km')).toBeInTheDocument();
    expect(screen.getByText(/Home base → 1 Alpha St: 4.0 km/)).toBeInTheDocument();
    expect(screen.getByText(/2 Beta St → Home base: 3.5 km/)).toBeInTheDocument();
    expect(screen.queryByText(/out of date/i)).not.toBeInTheDocument();
    expect(screen.queryByText('partial')).not.toBeInTheDocument();
  });

  it('shows the stored estimate on load without calculating', async () => {
    (getRouteEstimate as jest.Mock).mockResolvedValue({ data: estimate(10000) });

    render(<RouteEstimateCard routeId="r1" assignedOperatorSub="op-1" stops={stops} />);

    expect(await screen.findByText('10.0 km')).toBeInTheDocument();
    expect(calculateRouteEstimate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /recalculate estimate/i })).toBeInTheDocument();
  });

  it('hands the stored and each newly calculated estimate to the map', async () => {
    const onEstimateChange = jest.fn();
    (getRouteEstimate as jest.Mock).mockResolvedValue({ data: estimate(10000) });
    (calculateRouteEstimate as jest.Mock).mockResolvedValue({ ok: true, estimate: estimate(12000) });

    render(<RouteEstimateCard routeId="r1" assignedOperatorSub="op-1" stops={stops} onEstimateChange={onEstimateChange} />);
    await screen.findByText('10.0 km');
    expect(onEstimateChange).toHaveBeenLastCalledWith(expect.objectContaining({ totalMeters: 10000 }));

    fireEvent.click(screen.getByRole('button', { name: /recalculate estimate/i }));
    await screen.findByText('12.0 km');
    expect(onEstimateChange).toHaveBeenLastCalledWith(expect.objectContaining({ totalMeters: 12000 }));
  });

  it('lists left-out Stops with the reason, reads partial, and links no-pin Stops to Location review', async () => {
    (getRouteEstimate as jest.Mock).mockResolvedValue({ data: { ...estimate(10000), leftOutNoPin: 1, leftOutRemoved: 1 } });

    render(<RouteEstimateCard routeId="r1" assignedOperatorSub="op-1" stops={[...stops, noPinStop, removedStop]} />);

    const list = await screen.findByRole('list', { name: /left out stops/i });
    expect(within(list).getByText(/3 Gamma St/)).toHaveTextContent('no pin');
    expect(within(list).getByRole('link', { name: /location review/i })).toHaveAttribute('href', '/administrator/locations');
    const removed = within(list).getByText(/4 Delta St/);
    expect(removed).toHaveTextContent('removed');
    expect(within(removed).queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('partial')).toBeInTheDocument();
  });

  it.each([
    ['a Stop is added', { stops: [...stops, { ...stops[0], id: 's9', sequence: 9 }], operator: 'op-1' }],
    ['the Stops are reordered', { stops: [{ ...stops[0], sequence: 2 }, { ...stops[1], sequence: 1 }], operator: 'op-1' }],
    ['a pin moves', { stops: [stops[0], { ...stops[1], latitude: -30 }], operator: 'op-1' }],
    ['the Operator is reassigned', { stops, operator: 'op-2' }],
  ])('shows out of date when %s, without recalculating', async (_name, change) => {
    (getRouteEstimate as jest.Mock).mockResolvedValue({ data: estimate(10000) });

    render(<RouteEstimateCard routeId="r1" assignedOperatorSub={change.operator} stops={change.stops} />);

    expect(await screen.findByText('out of date')).toBeInTheDocument();
    expect(calculateRouteEstimate).not.toHaveBeenCalled();
  });

  it('clears out of date once recalculated', async () => {
    (getRouteEstimate as jest.Mock).mockResolvedValue({ data: estimate(10000) });
    (calculateRouteEstimate as jest.Mock).mockResolvedValue({
      ok: true,
      estimate: { ...estimate(11000), operatorSub: 'op-2' },
    });

    render(<RouteEstimateCard routeId="r1" assignedOperatorSub="op-2" stops={stops} />);
    await screen.findByText('out of date');
    fireEvent.click(screen.getByRole('button', { name: /recalculate estimate/i }));

    await screen.findByText('11.0 km');
    expect(screen.queryByText('out of date')).not.toBeInTheDocument();
  });

  it('keeps the previous estimate and offers a retry when a calculation fails', async () => {
    (getRouteEstimate as jest.Mock).mockResolvedValue({ data: estimate(10000) });
    (calculateRouteEstimate as jest.Mock)
      .mockResolvedValueOnce({ ok: false, error: 'Google Routes could not calculate the drive: quota' })
      .mockResolvedValueOnce({ ok: true, estimate: estimate(12000) });

    render(<RouteEstimateCard routeId="r1" assignedOperatorSub="op-1" stops={stops} />);
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

    render(<RouteEstimateCard routeId="r1" assignedOperatorSub="op-1" stops={stops} />);
    fireEvent.click(await screen.findByRole('button', { name: /calculate estimate/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This Route has no Operator.');
  });
});
