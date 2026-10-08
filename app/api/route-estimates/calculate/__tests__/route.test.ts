/**
 * @jest-environment node
 */
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => body }),
  },
}));

const authorizeMock = jest.fn();
jest.mock('@/lib/server/authorizeIamRequest', () => ({ authorizeIamRequest: (...args: unknown[]) => authorizeMock(...args) }));

const computeMock = jest.fn();
jest.mock('@/lib/server/googleRoutes', () => ({ computeRoadLegs: (...args: unknown[]) => computeMock(...args) }));

import { POST } from '../route';

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;

function model(name: string) {
  const rows = () => (tables[name] ??= []);
  return {
    list: async () => ({ data: rows() }),
    get: async ({ id }: { id: string }) => ({ data: rows().find((row) => row.id === id) ?? null }),
    create: async (input: Row) => {
      rows().push(input);
      return { data: input };
    },
    update: async ({ id, ...changes }: Row) => {
      Object.assign(rows().find((row) => row.id === id)!, changes);
      return { data: {} };
    },
  };
}

const client = {
  models: new Proxy({}, { get: (_t, name: string) => model(name) }),
};

const request = (body: unknown) => ({ json: async () => body }) as never;

beforeEach(() => {
  tables = {
    Route: [{ id: 'r1', customerId: 'c1', assignedOperatorSub: 'op-1' }],
    Operator: [{ id: 'op-1', homeBaseLatitude: -33.8, homeBaseLongitude: 151.1 }],
    Stop: [
      { id: 's1', routeId: 'r1', sequence: 1, latitude: -33.7, longitude: 151.2 },
      { id: 's2', routeId: 'r1', sequence: 2, latitude: -33.6, longitude: 151.3 },
    ],
  };
  authorizeMock.mockResolvedValue({ ok: true, caller: { audience: 'staff' }, claims: { sub: 'admin-1' }, client });
  computeMock.mockReset();
});

describe('POST /api/route-estimates/calculate', () => {
  it('only lets administrators in', async () => {
    authorizeMock.mockResolvedValue({ ok: false, status: 403, error: 'Forbidden' });
    const response = await POST(request({ routeId: 'r1' }));
    expect(response.status).toBe(403);
    expect(authorizeMock).toHaveBeenCalledWith(expect.anything(), 'administrator');
  });

  it('stores the total and each Leg, and writes an audit entry', async () => {
    computeMock.mockResolvedValue([
      { distanceMeters: 1000, path: 'a' },
      { distanceMeters: 2000, path: 'b' },
      { distanceMeters: 3000, path: 'c' },
    ]);

    const response = await POST(request({ routeId: 'r1' }));

    expect(response.status).toBe(200);
    const stored = tables.RouteEstimate[0];
    expect(stored).toMatchObject({ id: 'r1', totalMeters: 6000, stopIds: ['s1', 's2'], calculatedBySub: 'admin-1' });
    expect(stored.stopPins).toEqual([
      { stopId: 's1', latitude: -33.7, longitude: 151.2 },
      { stopId: 's2', latitude: -33.6, longitude: 151.3 },
    ]);
    expect((stored.legs as Row[]).map((leg) => [leg.fromStopId, leg.toStopId])).toEqual([
      [null, 's1'],
      ['s1', 's2'],
      ['s2', null],
    ]);
    expect(tables.AuditLog[0]).toMatchObject({ resourceType: 'route_estimate', resourceId: 'r1', customerId: 'c1', status: 'success' });
  });

  it('replaces the stored estimate on recalculation', async () => {
    computeMock.mockResolvedValue([{ distanceMeters: 1, path: '' }, { distanceMeters: 1, path: '' }, { distanceMeters: 1, path: '' }]);
    await POST(request({ routeId: 'r1' }));
    computeMock.mockResolvedValue([{ distanceMeters: 5, path: '' }, { distanceMeters: 5, path: '' }, { distanceMeters: 5, path: '' }]);
    await POST(request({ routeId: 'r1' }));

    expect(tables.RouteEstimate).toHaveLength(1);
    expect(tables.RouteEstimate[0].totalMeters).toBe(15);
  });

  it('stores nothing, keeps the previous estimate and audits the failure when Google fails', async () => {
    tables.RouteEstimate = [{ id: 'r1', totalMeters: 42 }];
    computeMock.mockRejectedValue(new Error('Routes API has not been enabled'));

    const response = await POST(request({ routeId: 'r1' }));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Routes API has not been enabled' });
    expect(tables.RouteEstimate[0].totalMeters).toBe(42);
    expect(tables.AuditLog[0]).toMatchObject({ status: 'failure', reason: 'Routes API has not been enabled' });
  });

  it.each([
    ['no Operator', () => (tables.Route[0].assignedOperatorSub = null), /no operator/i],
    ['no Operator pin', () => (tables.Operator[0].homeBaseLatitude = null), /start point/i],
    ['no pinned Stop', () => tables.Stop.forEach((stop) => (stop.latitude = null)), /no stop/i],
  ])('says so with %s, without calling Google', async (_name, arrange, message) => {
    arrange();

    const response = await POST(request({ routeId: 'r1' }));

    expect(response.status).toBe(422);
    expect((await response.json()).error).toMatch(message);
    expect(computeMock).not.toHaveBeenCalled();
    expect(tables.RouteEstimate).toBeUndefined();
  });

  it('shows the missing-key message from the Routes call', async () => {
    computeMock.mockRejectedValue(new Error('Route Estimates are not set up yet: the Google Routes API key is missing.'));
    const response = await POST(request({ routeId: 'r1' }));
    expect((await response.json()).error).toMatch(/key is missing/i);
  });
});
