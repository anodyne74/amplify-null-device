import { routeReference, routeSheetStops } from './routeSheet';

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
