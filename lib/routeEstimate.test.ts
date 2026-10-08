import { chunkPoints, estimateStaleness, leftOutStops, planRouteEstimate, readRoadLegs } from './routeEstimate';

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

describe('estimateStaleness', () => {
  const pin = (stopId: string, latitude: number, longitude = 151.2) => ({ stopId, latitude, longitude });
  const estimate = { operatorSub: 'op-1', stopIds: ['a', 'b'], stopPins: [pin('a', -33.7), pin('b', -33.6)] };
  const stops = [stop('a', 1, { latitude: -33.7 }), stop('b', 2, { latitude: -33.6 })];
  const route = { assignedOperatorSub: 'op-1' };

  it('is current when nothing has changed', () => {
    expect(estimateStaleness(estimate, route, stops)).toBe(false);
  });

  it('is out of date when a Stop is added', () => {
    expect(estimateStaleness(estimate, route, [...stops, stop('c', 3)])).toBe(true);
  });

  it('is out of date when a Stop is removed, or set aside', () => {
    expect(estimateStaleness(estimate, route, [stops[0]])).toBe(true);
    expect(estimateStaleness(estimate, route, [stops[0], { ...stops[1], removed: true }])).toBe(true);
  });

  it('is out of date when the Stops are reordered', () => {
    expect(estimateStaleness(estimate, route, [{ ...stops[0], sequence: 2 }, { ...stops[1], sequence: 1 }])).toBe(true);
  });

  it('is out of date when a pin moves', () => {
    expect(estimateStaleness(estimate, route, [stops[0], { ...stops[1], latitude: -30 }])).toBe(true);
  });

  it('is out of date when a missing pin is filled in', () => {
    const partial = { operatorSub: 'op-1', stopIds: ['a'], stopPins: [pin('a', -33.7)] };
    const withNoPin = [stops[0], stop('b', 2, { latitude: null, longitude: null })];
    expect(estimateStaleness(partial, route, withNoPin)).toBe(false);
    expect(estimateStaleness(partial, route, stops)).toBe(true);
  });

  it('is out of date when the Operator is reassigned', () => {
    expect(estimateStaleness(estimate, { assignedOperatorSub: 'op-2' }, stops)).toBe(true);
  });

  it('is out of date when it was stored without its pins', () => {
    expect(estimateStaleness({ ...estimate, stopPins: null }, route, stops)).toBe(true);
  });
});

describe('leftOutStops', () => {
  it('lists Removed and no-pin Stops with the reason, in sequence order', () => {
    const result = leftOutStops([
      stop('c', 3, { latitude: null, longitude: null }),
      stop('a', 1),
      stop('b', 2, { removed: true }),
    ]);
    expect(result.map((entry) => [entry.stop.id, entry.reason])).toEqual([
      ['b', 'removed'],
      ['c', 'noPin'],
    ]);
  });
});

describe('chunkPoints', () => {
  const pts = (n: number) => Array.from({ length: n }, (_, i) => ({ latitude: i, longitude: 0 }));

  it('keeps a short drive in one request', () => {
    expect(chunkPoints(pts(27))).toHaveLength(1);
  });

  it('splits a longer drive into requests of at most 25 intermediate points, sharing each boundary point', () => {
    const chunks = chunkPoints(pts(60));

    chunks.forEach((chunk) => expect(chunk.length - 2).toBeLessThanOrEqual(25));
    chunks.slice(1).forEach((chunk, i) => expect(chunk[0]).toBe(chunks[i][chunks[i].length - 1]));
    expect(chunks[0][0]).toEqual({ latitude: 0, longitude: 0 });
    expect(chunks[chunks.length - 1].at(-1)).toEqual({ latitude: 59, longitude: 0 });
  });

  it('covers every consecutive pair exactly once, so no Leg is dropped or doubled', () => {
    const chunks = chunkPoints(pts(80));
    const legs = chunks.flatMap((chunk) => chunk.slice(1).map((point, i) => [chunk[i].latitude, point.latitude]));

    expect(legs).toEqual(Array.from({ length: 79 }, (_, i) => [i, i + 1]));
  });
});
