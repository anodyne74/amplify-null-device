import { renderHook, waitFor } from '@testing-library/react';
import { useStoredRouteEstimate } from './useStoredRouteEstimate';
import { getRouteEstimate } from '@/lib/routeEstimates';

jest.mock('@/lib/routeEstimates');
const read = getRouteEstimate as jest.Mock;

const route = { id: 'route-1', assignedOperatorSub: 'op-1' };
const stops = [
  { id: 's1', sequence: 1, latitude: -37.8, longitude: 144.9 },
  { id: 's2', sequence: 2, latitude: -37.9, longitude: 145.0 },
];
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

describe('useStoredRouteEstimate', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    read.mockResolvedValue({ data: estimate });
  });

  it('gives the stored estimate, current while the Stops and Operator are as calculated', async () => {
    const { result } = renderHook(() => useStoredRouteEstimate(route, stops));

    await waitFor(() => expect(result.current.estimate).toEqual(estimate));
    expect(result.current.outOfDate).toBe(false);
  });

  it('is out of date once a Stop has been removed', async () => {
    const { result } = renderHook(() =>
      useStoredRouteEstimate(route, [stops[0], { ...stops[1], removed: true }])
    );

    await waitFor(() => expect(result.current.estimate).not.toBeNull());
    expect(result.current.outOfDate).toBe(true);
  });

  it('is out of date once the Route has another Operator', async () => {
    const { result } = renderHook(() => useStoredRouteEstimate({ ...route, assignedOperatorSub: 'op-2' }, stops));

    await waitFor(() => expect(result.current.estimate).not.toBeNull());
    expect(result.current.outOfDate).toBe(true);
  });

  it('has no estimate, and is not out of date, when there is none or it cannot be read', async () => {
    read.mockResolvedValue({ data: null, error: 'Could not load the Route Estimate.' });

    const { result } = renderHook(() => useStoredRouteEstimate(route, stops));

    await waitFor(() => expect(read).toHaveBeenCalled());
    expect(result.current).toEqual({ estimate: null, outOfDate: false });
  });

  it('reads nothing until there is a Route', () => {
    const { result } = renderHook(() => useStoredRouteEstimate(null, []));

    expect(read).not.toHaveBeenCalled();
    expect(result.current).toEqual({ estimate: null, outOfDate: false });
  });
});
