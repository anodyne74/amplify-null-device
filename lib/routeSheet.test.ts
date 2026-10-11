import { routeReference, routeSheetDistance, routeSheetStops, ROUTE_SHEET_PHASES } from './routeSheet';

describe('routeSheetStops', () => {
  it('lists Stops in sequence order', () => {
    const stops = [
      { id: 'c', sequence: 3 },
      { id: 'a', sequence: 1 },
      { id: 'b', sequence: 2 },
    ];
    expect(routeSheetStops(stops).map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('leaves Removed Stops out', () => {
    const stops = [
      { id: 'a', sequence: 1 },
      { id: 'b', sequence: 2, removed: true },
      { id: 'c', sequence: 3, removed: false },
    ];
    expect(routeSheetStops(stops).map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('numbers the rows from 1 with no gap where a Stop was removed', () => {
    const stops = [
      { id: 'a', sequence: 1 },
      { id: 'b', sequence: 2, removed: true },
      { id: 'c', sequence: 3 },
    ];
    expect(routeSheetStops(stops).map((s) => s.row)).toEqual([1, 2]);
  });
});

describe('routeReference', () => {
  it('prefers the route code', () => {
    expect(routeReference({ id: 'abcdef123456', routeCode: 'W40-26-001' })).toBe('W40-26-001');
  });

  it('falls back to the first 8 characters of the id, as the Route card does', () => {
    expect(routeReference({ id: 'abcdef123456' })).toBe('abcdef12');
  });
});

describe('routeSheetDistance', () => {
  const pin = (stopId: string) => ({ stopId, latitude: -33.8, longitude: 151.1 });
  const stops = [{ id: 'a', sequence: 1, latitude: -33.8, longitude: 151.1 }];
  const estimate = { operatorSub: 'op-1', stopIds: ['a'], stopPins: [pin('a')], totalMeters: 12345 };
  const route = { assignedOperatorSub: 'op-1' };

  it('gives the distance of a current Route Estimate', () => {
    expect(routeSheetDistance(estimate, route, stops)).toBe('12.3 km');
  });

  it('gives nothing when there is no Route Estimate', () => {
    expect(routeSheetDistance(null, route, stops)).toBeNull();
  });

  it('gives nothing when the Operator has changed since it was calculated', () => {
    expect(routeSheetDistance(estimate, { assignedOperatorSub: 'op-2' }, stops)).toBeNull();
  });

  it('gives nothing when the Stops have changed since it was calculated', () => {
    const moved = [{ id: 'b', sequence: 1, latitude: -33.8, longitude: 151.1 }];
    expect(routeSheetDistance(estimate, route, moved)).toBeNull();
  });
});

describe('ROUTE_SHEET_PHASES', () => {
  it('names the phases as the glossary does, in Sign Run order', () => {
    expect(ROUTE_SHEET_PHASES).toEqual(['Load', 'Placement', 'Pickup', 'Unload']);
  });
});
