import { parseDistanceKm } from './useFinaliseAdjusters';

describe('parseDistanceKm', () => {
  it.each([
    ['0', 0],
    ['37.5', 37.5],
    ['37.46', 37.5],
    [' 12 ', 12],
    ['8.', 8],
    ['.5', 0.5],
    ['1200', 1200],
  ])('reads %p as %p km', (text, km) => {
    expect(parseDistanceKm(text)).toBe(km);
  });

  it.each(['', ' ', 'abc', '-3', '1.2.3', '1,5', '5km'])('rejects %p', (text) => {
    expect(parseDistanceKm(text)).toBeNull();
  });
});
