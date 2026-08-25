import { renderHook, waitFor } from '@testing-library/react';
import { useRouteStopsPreview } from './useRouteStopsPreview';
import { getRouteWithStops } from '@/lib/queries';

jest.mock('@/lib/queries', () => ({
  getRouteWithStops: jest.fn(),
}));

describe('useRouteStopsPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns an empty list without querying when routeId is empty', () => {
    const { result } = renderHook(() => useRouteStopsPreview(''));
    expect(result.current.stops).toEqual([]);
    expect(getRouteWithStops).not.toHaveBeenCalled();
  });

  it('fetches and returns stops for the given route', async () => {
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      route: { id: 'route-1' },
      stops: [{ address: '1 Test St', agent: 'BO', numberOfSigns: 3 }],
      errors: undefined,
    });

    const { result } = renderHook(() => useRouteStopsPreview('route-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getRouteWithStops).toHaveBeenCalledWith('route-1');
    expect(result.current.stops).toEqual([{ address: '1 Test St', agent: 'BO', numberOfSigns: 3 }]);
  });
});
