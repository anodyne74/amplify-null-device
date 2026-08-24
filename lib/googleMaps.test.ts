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
