import { planRouteEstimate, readRoadLegs } from './routeEstimate';

const home = { latitude: -33.8, longitude: 151.1 };
const stop = (id: string, sequence: number, extra: Record<string, unknown> = {}) => ({
  id,
  sequence,
  latitude: -33.7 - sequence / 100,
  longitude: 151.2,
  formattedAddress: `${id} St`,
  ...extra,
});

describe('planRouteEstimate', () => {
  it('goes home base, then pinned Stops in sequence order, then home base', () => {
    const plan = planRouteEstimate({ assignedOperatorSub: 'op-1' }, { homeBase: home }, [stop('b', 2), stop('a', 1)]);

    expect(plan).toMatchObject({ ok: true, stopIds: ['a', 'b'], leftOut: { noPin: 0, removed: 0 } });
    if (plan.ok) {
      expect(plan.points).toHaveLength(4);
      expect(plan.points[0]).toEqual(home);
      expect(plan.points[3]).toEqual(home);
    }
  });

  it('leaves out Removed Stops and Stops with no pin, and counts them', () => {
    const plan = planRouteEstimate({ assignedOperatorSub: 'op-1' }, { homeBase: home }, [
      stop('a', 1),
      stop('b', 2, { removed: true }),
      stop('c', 3, { latitude: null, longitude: null }),
    ]);

    expect(plan).toMatchObject({ ok: true, stopIds: ['a'], leftOut: { noPin: 1, removed: 1 } });
  });

  it('says so when the Route has no Operator', () => {
    const plan = planRouteEstimate({ assignedOperatorSub: null }, null, [stop('a', 1)]);
    expect(plan).toEqual({ ok: false, reason: expect.stringMatching(/no operator/i) });
  });

  it('says so when the Operator has no pin', () => {
    const plan = planRouteEstimate({ assignedOperatorSub: 'op-1' }, { homeBase: null }, [stop('a', 1)]);
    expect(plan).toEqual({ ok: false, reason: expect.stringMatching(/start point/i) });
  });

  it('says so when no Stop has a pin', () => {
    const plan = planRouteEstimate({ assignedOperatorSub: 'op-1' }, { homeBase: home }, [
      stop('a', 1, { latitude: null, longitude: null }),
    ]);
    expect(plan).toEqual({ ok: false, reason: expect.stringMatching(/no stop/i) });
  });
});

describe('readRoadLegs', () => {
  it('reads each Leg distance and path, and the total', () => {
    const legs = readRoadLegs(
      { routes: [{ legs: [{ distanceMeters: 1200, polyline: { encodedPolyline: 'abc' } }, { distanceMeters: 800, polyline: { encodedPolyline: 'def' } }] }] },
      2
    );
    expect(legs).toEqual([
      { distanceMeters: 1200, path: 'abc' },
      { distanceMeters: 800, path: 'def' },
    ]);
  });

  it('throws when Google returns no route or the wrong number of Legs', () => {
    expect(() => readRoadLegs({}, 2)).toThrow(/no route/i);
    expect(() => readRoadLegs({ routes: [{ legs: [{ distanceMeters: 1 }] }] }, 2)).toThrow(/legs/i);
  });

  it('throws when a Leg has no distance', () => {
    expect(() => readRoadLegs({ routes: [{ legs: [{}] }] }, 1)).toThrow(/distance/i);
  });
});
