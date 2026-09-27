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
    delete (window as any).gm_authFailure;
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
    (window as any).__nullDeviceMapsReady();

    const assertion = expect(promise).rejects.toThrow(/timed out/i);
    await jest.advanceTimersByTimeAsync(15000);
    await assertion;
  });
});

describe('loading the Maps script', () => {
  const originalEnv = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const geocode = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key';
    geocode.mockReset();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = originalEnv;
    delete (window as any).google;
    delete (window as any).gm_authFailure;
    document.head.innerHTML = '';
  });

  function mapsReady() {
    (window as any).google = {
      maps: { Geocoder: class { geocode = geocode; }, GeocoderStatus: { OK: 'OK' }, places: {} },
    };
    (window as any).__nullDeviceMapsReady();
  }

  it("waits for Maps' ready callback, not the script's onload, which fires before the geocoder exists", async () => {
    const { loadGoogleMapsScript } = await import('./googleMaps');
    const loaded = jest.fn();

    void loadGoogleMapsScript().then(loaded);
    const script = document.head.querySelector('script');
    expect(script?.src).toContain('callback=__nullDeviceMapsReady');
    script?.dispatchEvent(new Event('load'));
    await Promise.resolve();
    expect(loaded).not.toHaveBeenCalled();

    mapsReady();
    await Promise.resolve();
    expect(loaded).toHaveBeenCalled();
  });

  it("says the site isn't allowed as soon as Google rejects the key, instead of timing out", async () => {
    geocode.mockImplementation(() => {
      // Google never answers once it has rejected the key.
    });
    const { geocodeAddress, MAPS_SITE_NOT_ALLOWED } = await import('./googleMaps');

    const pending = geocodeAddress('10 Brush Road, Eastwood');
    mapsReady();
    await new Promise((resolve) => setTimeout(resolve, 0));
    (window as any).gm_authFailure();

    await expect(pending).rejects.toThrow(MAPS_SITE_NOT_ALLOWED);
    await expect(geocodeAddress('58 Brush Road, Eastwood')).rejects.toThrow(MAPS_SITE_NOT_ALLOWED);
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
    expect(geocode).toHaveBeenCalledWith(
      { address: '12 Smith St Fitzroy', componentRestrictions: { country: 'AU' } },
      expect.any(Function)
    );
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
