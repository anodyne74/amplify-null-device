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

describe('computeRoadLegs over 25 Stops', () => {
  const originalKey = process.env.GOOGLE_ROUTES_API_KEY;
  const originalFetch = global.fetch;
  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ latitude: i, longitude: 0 }));

  beforeEach(() => {
    process.env.GOOGLE_ROUTES_API_KEY = 'routes-key';
  });
  afterEach(() => {
    process.env.GOOGLE_ROUTES_API_KEY = originalKey;
    global.fetch = originalFetch;
  });

  /** Answers each request with one Leg per consecutive pair, its distance the pair's starting latitude. */
  const answerByPair = () =>
    jest.fn().mockImplementation(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      const lats = [body.origin, ...body.intermediates, body.destination].map((w) => w.location.latLng.latitude);
      return {
        ok: true,
        json: async () => ({
          routes: [{ legs: lats.slice(1).map((_lat: number, i: number) => ({ distanceMeters: lats[i] + 1, polyline: { encodedPolyline: String(lats[i]) } })) }],
        }),
      };
    });

  it('chains requests of at most 25 intermediate points and joins the Legs in order without duplicates', async () => {
    const fetchMock = answerByPair();
    global.fetch = fetchMock as unknown as typeof fetch;

    const legs = await computeRoadLegs(many(60));

    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    fetchMock.mock.calls.forEach(([, init]) => expect(JSON.parse(init.body).intermediates.length).toBeLessThanOrEqual(25));
    expect(legs.map((leg) => leg.path)).toEqual(Array.from({ length: 59 }, (_, i) => String(i)));
  });

  it('sends the requests together, so a long Route stays inside the server time limit', async () => {
    let inFlight = 0;
    let peak = 0;
    global.fetch = jest.fn().mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return { ok: true, json: async () => ({ routes: [{ legs: Array.from({ length: 26 }, () => ({ distanceMeters: 1 })) }] }) };
    }) as unknown as typeof fetch;

    await computeRoadLegs(many(79)).catch(() => undefined);

    expect(peak).toBeGreaterThan(1);
  });

  it('fails the whole calculation when any request fails', async () => {
    let calls = 0;
    global.fetch = jest.fn().mockImplementation(async (_url: string, init: { body: string }) => {
      calls++;
      if (calls === 2) return { ok: false, status: 500, json: async () => ({ error: { message: 'boom' } }) };
      return answerByPair()(_url, init);
    }) as unknown as typeof fetch;

    await expect(computeRoadLegs(many(60))).rejects.toThrow(/boom/);
  });
});
