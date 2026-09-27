/**
 * GitHub issue #58: a stuck Google Maps script load (e.g. blocked by an
 * ad-blocker) could leave geocodeAddress's promise unsettled forever,
 * which hung the caller's `await` chain indefinitely. These tests confirm
 * geocodeAddress always settles within its timeout.
 */
describe('geocodeAddress timeout handling (#58)', () => {
  const originalEnv = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key';
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = originalEnv;
    delete (window as any).google;
    document.head.innerHTML = '';
  });

  it('rejects instead of hanging forever when the maps script never fires onload/onerror', async () => {
    const { geocodeAddress } = await import('./googleMaps');

    const promise = geocodeAddress('123 Main St');
    // Intentionally never invoke the injected <script>'s onload/onerror —
    // simulates an ad-blocker silently dropping the request.

    const assertion = expect(promise).rejects.toThrow(/timed out/i);
    await jest.advanceTimersByTimeAsync(15000);
    await assertion;
  });

  it('rejects instead of hanging forever when the geocoder callback never fires', async () => {
    const { geocodeAddress } = await import('./googleMaps');

    (window as any).google = {
      maps: {
        Geocoder: class {
          geocode() {
            // Never calls back — simulates a stuck request to Google's API.
          }
        },
        GeocoderStatus: { OK: 'OK' },
        places: {},
      },
    };

    const promise = geocodeAddress('123 Main St');
    const scriptEl = document.head.querySelector('script');
    scriptEl?.dispatchEvent(new Event('load'));

    const assertion = expect(promise).rejects.toThrow(/timed out/i);
    await jest.advanceTimersByTimeAsync(15000);
    await assertion;
  });
});

describe('geocode precision signals (#283)', () => {
  const originalEnv = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const geocode = jest.fn();

  function googleResult(overrides: Record<string, unknown> = {}) {
    return {
      formatted_address: '12 Smith St, Fitzroy VIC 3065, Australia',
      geometry: { location: { lat: () => -37.8, lng: () => 144.98 }, location_type: 'RANGE_INTERPOLATED' },
      types: ['street_address'],
      address_components: [
        { long_name: '12', types: ['street_number'] },
        { long_name: 'Smith Street', types: ['route'] },
        { long_name: 'Fitzroy', types: ['locality', 'political'] },
        { long_name: '3065', types: ['postal_code'] },
      ],
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.resetModules();
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key';
    geocode.mockReset();
    (window as any).google = {
      maps: {
        Geocoder: class {
          geocode = geocode;
        },
        GeocoderStatus: { OK: 'OK' },
        places: {},
      },
    };
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = originalEnv;
    delete (window as any).google;
  });

  it('returns the top result classified, with its signals and address components', async () => {
    geocode.mockImplementation((_request, callback) => callback([googleResult()], 'OK'));
    const { geocodeAddress } = await import('./googleMaps');

    await expect(geocodeAddress('12 Smith St Fitzroy')).resolves.toEqual({
      formattedAddress: '12 Smith St, Fitzroy VIC 3065, Australia',
      latitude: -37.8,
      longitude: 144.98,
      locationPrecision: 'interpolated',
      locationType: 'RANGE_INTERPOLATED',
      resultTypes: ['street_address'],
      partialMatch: false,
      addressComponents: { streetNumber: '12', street: 'Smith Street', suburb: 'Fitzroy', postcode: '3065' },
    });
    expect(geocode).toHaveBeenCalledWith({ address: '12 Smith St Fitzroy' }, expect.any(Function));
  });

  it('classifies a partial match as Approximate', async () => {
    geocode.mockImplementation((_request, callback) =>
      callback([googleResult({ partial_match: true })], 'OK')
    );
    const { geocodeAddress } = await import('./googleMaps');

    await expect(geocodeAddress('12 Smith St')).resolves.toMatchObject({
      locationPrecision: 'approximate',
      partialMatch: true,
    });
  });

  it('geocodes a place ID from autocomplete the same way', async () => {
    geocode.mockImplementation((_request, callback) => callback([googleResult()], 'OK'));
    const { geocodePlaceId } = await import('./googleMaps');

    await expect(geocodePlaceId('place-123')).resolves.toMatchObject({
      latitude: -37.8,
      locationPrecision: 'interpolated',
    });
    expect(geocode).toHaveBeenCalledWith({ placeId: 'place-123' }, expect.any(Function));
  });
});
