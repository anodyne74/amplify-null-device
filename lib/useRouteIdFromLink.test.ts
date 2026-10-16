import { renderHook, waitFor } from '@testing-library/react';
import { useRouteIdFromLink } from './useRouteIdFromLink';
import { getRouteIdByLinkCode } from '@/lib/routes';

jest.mock('@/lib/routes', () => ({ getRouteIdByLinkCode: jest.fn() }));

const lookup = getRouteIdByLinkCode as jest.Mock;

describe('useRouteIdFromLink', () => {
  beforeEach(() => lookup.mockReset());

  it('uses ?id= as it is, without a lookup', () => {
    const { result } = renderHook(() => useRouteIdFromLink('route-1', ''));

    expect(result.current).toEqual({ routeId: 'route-1', resolving: false });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('looks a code up and gives the Route it is on', async () => {
    lookup.mockResolvedValue('route-1');
    const { result } = renderHook(() => useRouteIdFromLink('', 'k7q2m9'));

    expect(result.current).toEqual({ routeId: '', resolving: true });
    await waitFor(() => expect(result.current).toEqual({ routeId: 'route-1', resolving: false }));
    expect(lookup).toHaveBeenCalledWith('k7q2m9');
  });

  it('gives no Route for an unknown code', async () => {
    lookup.mockResolvedValue(null);
    const { result } = renderHook(() => useRouteIdFromLink('', 'k7q2m9'));

    await waitFor(() => expect(result.current).toEqual({ routeId: '', resolving: false }));
  });

  it('gives no Route when the lookup fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    lookup.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useRouteIdFromLink('', 'k7q2m9'));

    await waitFor(() => expect(result.current).toEqual({ routeId: '', resolving: false }));
  });
});
