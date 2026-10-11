import { decodePolyline, routeEstimateOverlay } from './routeEstimateOverlay';

describe('decodePolyline', () => {
  it("decodes Google's documented example", () => {
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(points).toHaveLength(3);
    expect(points[0][0]).toBeCloseTo(38.5, 5);
    expect(points[0][1]).toBeCloseTo(-120.2, 5);
    expect(points[1][0]).toBeCloseTo(40.7, 5);
    expect(points[1][1]).toBeCloseTo(-120.95, 5);
    expect(points[2][0]).toBeCloseTo(43.252, 5);
    expect(points[2][1]).toBeCloseTo(-126.453, 5);
  });

  it('decodes nothing from an empty path', () => {
    expect(decodePolyline('')).toEqual([]);
  });
});

describe('routeEstimateOverlay', () => {
  const estimate = {
    originLatitude: -33.8,
    originLongitude: 151.1,
    legs: [
      { order: 2, distanceMeters: 1, path: '_p~iF~ps|U_ulLnnqC' },
      { order: 1, distanceMeters: 1, path: '_p~iF~ps|U' },
      { order: 3, distanceMeters: 1, path: '' },
    ],
  };

  it('puts home base at the origin and the Legs in order, including the return Leg', () => {
    const overlay = routeEstimateOverlay(estimate)!;

    expect(overlay.home).toEqual({ latitude: -33.8, longitude: 151.1 });
    expect(overlay.legs.map((leg) => leg.length)).toEqual([1, 2]);
  });

  it('draws nothing extra without an estimate', () => {
    expect(routeEstimateOverlay(null)).toBeNull();
  });
});
