import { buildLocationReviewQueue, hasSuburbMismatch, type ReviewStop } from './locationReview';

const KEY = 'epping|2121|cliff road|14';

function stop(overrides: Partial<ReviewStop> = {}): ReviewStop {
  return {
    id: 's1',
    address: '14 Cliff Rd, Epping NSW 2121',
    latitude: -33.77,
    longitude: 151.08,
    locationPrecision: 'approximate',
    addressSuburb: 'Epping',
    propertyKey: KEY,
    ...overrides,
  };
}

describe('hasSuburbMismatch', () => {
  it("flags an entered address that doesn't mention the geocoder's suburb", () => {
    expect(hasSuburbMismatch(stop({ addressSuburb: 'North Epping', address: '14 Cliff Rd, Epping' }))).toBe(true);
    expect(hasSuburbMismatch(stop({ addressSuburb: 'Carlingford' }))).toBe(true);
  });

  it('matches case-insensitively and on whole words, like the backfill assess mode', () => {
    expect(hasSuburbMismatch(stop({ address: '14 cliff rd epping' }))).toBe(false);
    expect(hasSuburbMismatch(stop({ address: '14 Eppingham St, Carlton' }))).toBe(true);
  });

  it('cannot flag a mismatch without a geocoded suburb', () => {
    expect(hasSuburbMismatch(stop({ addressSuburb: null }))).toBe(false);
  });
});

describe('buildLocationReviewQueue', () => {
  it('lists each Property once, with every Stop at it', () => {
    const queue = buildLocationReviewQueue(
      [stop({ id: 's1' }), stop({ id: 's2', address: '14 Cliff Road, Epping', locationPrecision: 'precise' })],
      []
    );

    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ propertyKey: KEY, approximate: true, suburbMismatch: null });
    expect(queue[0].stops.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('lists a Property with a suburb mismatch even when its pin is precise', () => {
    const queue = buildLocationReviewQueue(
      [stop({ locationPrecision: 'precise', addressSuburb: 'Carlingford' })],
      []
    );

    expect(queue).toEqual([expect.objectContaining({ approximate: false, suburbMismatch: { geocodedSuburb: 'Carlingford' } })]);
  });

  it('leaves out Properties with nothing to review', () => {
    expect(buildLocationReviewQueue([stop({ locationPrecision: 'precise' }), stop({ locationPrecision: 'interpolated' })], [])).toEqual(
      []
    );
  });

  it('leaves out a Confirmed Property, whatever its Stops say', () => {
    const confirmed = { propertyKey: KEY, latitude: -33.7, longitude: 151.1, confirmedAt: '2026-09-27T00:00:00Z' };

    expect(buildLocationReviewQueue([stop({ addressSuburb: 'Carlingford' })], [confirmed])).toEqual([]);
  });

  it('keeps a dismissed suburb mismatch dismissed, but still lists an Approximate pin', () => {
    const dismissed = { propertyKey: KEY, suburbMismatchDismissedAt: '2026-09-27T00:00:00Z' };

    expect(buildLocationReviewQueue([stop({ locationPrecision: 'precise', addressSuburb: 'Carlingford' })], [dismissed])).toEqual([]);
    expect(buildLocationReviewQueue([stop({ addressSuburb: 'Carlingford' })], [dismissed])).toEqual([
      expect.objectContaining({ approximate: true, suburbMismatch: null }),
    ]);
  });

  it('suggests the most recent placement GPS fix at the Property', () => {
    const queue = buildLocationReviewQueue(
      [
        stop({ id: 's1', placedLatitude: -33.1, placedLongitude: 151.1, placedAccuracyMeters: 30, placedPositionAt: '2026-09-01T00:00:00Z' }),
        stop({ id: 's2', placedLatitude: -33.2, placedLongitude: 151.2, placedAccuracyMeters: 8, placedPositionAt: '2026-09-20T00:00:00Z' }),
        stop({ id: 's3' }),
      ],
      []
    );

    expect(queue[0].suggestedPin).toEqual({ latitude: -33.2, longitude: 151.2, accuracyMeters: 8, recordedAt: '2026-09-20T00:00:00Z' });
    expect(queue[0].currentPin).toEqual({ latitude: -33.77, longitude: 151.08 });
  });

  it('has no suggestion or current pin when no Stop has one', () => {
    const [review] = buildLocationReviewQueue([stop({ latitude: null, longitude: null })], []);

    expect(review.suggestedPin).toBeNull();
    expect(review.currentPin).toBeNull();
  });

  it("skips Stops without a Property key -- they can't be confirmed as a Property until the backfill keys them", () => {
    expect(buildLocationReviewQueue([stop({ propertyKey: null })], [])).toEqual([]);
  });

  it('orders the queue by suburb, then street, then number', () => {
    const queue = buildLocationReviewQueue(
      [
        stop({ id: 'b', propertyKey: 'epping|2121|cliff road|96' }),
        stop({ id: 'c', propertyKey: 'carlingford|2118|pennant street|3' }),
        stop({ id: 'a', propertyKey: KEY }),
      ],
      []
    );

    expect(queue.map((review) => review.stops[0].id)).toEqual(['c', 'a', 'b']);
  });
});
