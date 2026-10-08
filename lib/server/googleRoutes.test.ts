/**
 * @jest-environment node
 */
import { computeRoadLegs, ROUTES_KEY_MISSING } from './googleRoutes';

const points = [
  { latitude: 1, longitude: 2 },
  { latitude: 3, longitude: 4 },
  { latitude: 1, longitude: 2 },
];

describe('computeRoadLegs', () => {
  const originalKey = process.env.GOOGLE_ROUTES_API_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.GOOGLE_ROUTES_API_KEY = 'routes-key';
  });
  afterEach(() => {
    process.env.GOOGLE_ROUTES_API_KEY = originalKey;
    global.fetch = originalFetch;
  });

  it('asks for a traffic-unaware drive through the points with the dedicated key', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [{ legs: [{ distanceMeters: 10, polyline: { encodedPolyline: 'a' } }, { distanceMeters: 20, polyline: { encodedPolyline: 'b' } }] }],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const legs = await computeRoadLegs(points);

    expect(legs.map((leg) => leg.distanceMeters)).toEqual([10, 20]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
    expect(init.headers['X-Goog-Api-Key']).toBe('routes-key');
    const body = JSON.parse(init.body);
    expect(body.travelMode).toBe('DRIVE');
    expect(body.routingPreference).toBe('TRAFFIC_UNAWARE');
    expect(body.intermediates).toHaveLength(1);
    expect(body.origin.location.latLng).toEqual({ latitude: 1, longitude: 2 });
  });

  it('fails with a clear message while the key is missing, without calling Google', async () => {
    delete process.env.GOOGLE_ROUTES_API_KEY;
    global.fetch = jest.fn() as unknown as typeof fetch;

    await expect(computeRoadLegs(points)).rejects.toThrow(ROUTES_KEY_MISSING);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("surfaces Google's reason when the call fails", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'Routes API has not been enabled' } }),
    }) as unknown as typeof fetch;

    await expect(computeRoadLegs(points)).rejects.toThrow(/not been enabled/);
  });
});
