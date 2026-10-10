import { renderHook, waitFor } from '@testing-library/react';
import { useCustomerAddressOrigin } from './useCustomerAddressOrigin';
import { geocodeAddress } from '@/lib/googleMaps';

jest.mock('@/lib/googleMaps');
const geocode = geocodeAddress as jest.Mock;

describe('useCustomerAddressOrigin', () => {
  beforeEach(() => jest.resetAllMocks());

  it("resolves the Customer's address to a pin", async () => {
    geocode.mockResolvedValue({ latitude: -37.8, longitude: 144.9, formattedAddress: 'x' });

    const { result } = renderHook(() => useCustomerAddressOrigin('1 Main St'));

    await waitFor(() => expect(result.current).toEqual({ latitude: -37.8, longitude: 144.9 }));
    expect(geocode).toHaveBeenCalledWith('1 Main St');
  });

  it('is null without an address, and looks nothing up', () => {
    const { result } = renderHook(() => useCustomerAddressOrigin(null));

    expect(result.current).toBeNull();
    expect(geocode).not.toHaveBeenCalled();
  });

  it('is null when the lookup fails', async () => {
    geocode.mockRejectedValue(new Error('timed out'));

    const { result } = renderHook(() => useCustomerAddressOrigin('1 Main St'));

    await waitFor(() => expect(geocode).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('follows the address and drops the old pin when it is cleared', async () => {
    geocode.mockResolvedValue({ latitude: 1, longitude: 2 });
    const { result, rerender } = renderHook(({ address }) => useCustomerAddressOrigin(address), {
      initialProps: { address: '1 Main St' as string | null },
    });
    await waitFor(() => expect(result.current).toEqual({ latitude: 1, longitude: 2 }));

    rerender({ address: null });

    await waitFor(() => expect(result.current).toBeNull());
  });
});
