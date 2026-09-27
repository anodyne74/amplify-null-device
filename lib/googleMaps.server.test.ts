/**
 * @jest-environment node
 */
/** geocodeAddress's REST path, used where there is no browser (API routes). */
describe('geocodeAddress on the server', () => {
  const originalEnv = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        results: [
          {
            formatted_address: '58 Brush Rd, Eastwood NSW 2122, Australia',
            geometry: { location: { lat: -33.79, lng: 151.08 }, location_type: 'ROOFTOP' },
            types: ['street_address'],
          },
        ],
      }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = originalEnv;
    global.fetch = originalFetch;
  });

  it('only matches Australian addresses', async () => {
    const { geocodeAddress } = await import('./googleMaps');

    await geocodeAddress('58 Brush Road');

    const url = new URL((global.fetch as jest.Mock).mock.calls[0][0]);
    expect(url.searchParams.get('address')).toBe('58 Brush Road');
    expect(url.searchParams.get('components')).toBe('country:AU');
  });

  it('looks up an autocomplete pick by place ID alone', async () => {
    const { geocodePlaceId } = await import('./googleMaps');

    await geocodePlaceId('place-123');

    const url = new URL((global.fetch as jest.Mock).mock.calls[0][0]);
    expect(url.searchParams.get('place_id')).toBe('place-123');
    expect(url.searchParams.has('components')).toBe(false);
  });
});
