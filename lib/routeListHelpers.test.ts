import type { Route } from '@/amplify/types';
import {
  compareRouteIdDesc,
  formatEstimatedDurationMinutes,
  formatRouteDuration,
  getFinalizedRouteDistanceKm,
  getFinalizedRouteDurationMinutes,
} from '@/lib/routeListHelpers';

function makeRoute(overrides: Partial<Route>): Route {
  return {
    id: overrides.id ?? 'route-1',
    customerId: overrides.customerId ?? 'customer-1',
    status: overrides.status ?? 'planned',
    routeCode: overrides.routeCode,
    ...overrides,
  } as Route;
}

describe('routeListHelpers', () => {
  describe('formatRouteDuration', () => {
    it('uses actual duration when present', () => {
      expect(formatRouteDuration(makeRoute({ actualDurationMinutes: 75 }))).toBe('75 min');
    });

    it('shows in-progress elapsed text when actively running', () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-01T01:10:00Z').getTime());

      expect(
        formatRouteDuration(
          makeRoute({
            status: 'in_progress',
            actualStartTime: '2024-01-01T01:00:00Z',
          })
        )
      ).toBe('10 min (in progress)');

      nowSpy.mockRestore();
    });

    it('returns fallback marker when duration cannot be derived', () => {
      expect(formatRouteDuration(makeRoute({ status: 'planned', actualDurationMinutes: undefined }))).toBe('—');
    });
  });

  describe('formatEstimatedDurationMinutes', () => {
    it('returns N/A for empty values', () => {
      expect(formatEstimatedDurationMinutes(undefined)).toBe('N/A');
      expect(formatEstimatedDurationMinutes(null)).toBe('N/A');
      expect(formatEstimatedDurationMinutes(0)).toBe('N/A');
    });

    it('formats minute values as hours and minutes', () => {
      expect(formatEstimatedDurationMinutes(130)).toBe('2h 10m');
    });
  });

  describe('getFinalizedRouteDurationMinutes', () => {
    it('prefers overrideDurationMinutes when set', () => {
      expect(
        getFinalizedRouteDurationMinutes(makeRoute({ actualDurationMinutes: 120, overrideDurationMinutes: 150 }))
      ).toBe(150);
    });

    it('falls back to actualDurationMinutes when there is no override', () => {
      expect(getFinalizedRouteDurationMinutes(makeRoute({ actualDurationMinutes: 90 }))).toBe(90);
    });

    it('returns 0 when neither value is set', () => {
      expect(getFinalizedRouteDurationMinutes(makeRoute({}))).toBe(0);
    });
  });

  describe('getFinalizedRouteDistanceKm', () => {
    it('prefers overrideDistanceKm when set', () => {
      expect(
        getFinalizedRouteDistanceKm(
          makeRoute({ signsPlacedDistanceKm: 12.5, signsPickedUpDistanceKm: 10, overrideDistanceKm: 30 })
        )
      ).toBe(30);
    });

    it('falls back to the sum of placement/pickup distance when there is no override', () => {
      expect(
        getFinalizedRouteDistanceKm(makeRoute({ signsPlacedDistanceKm: 12.5, signsPickedUpDistanceKm: 10 }))
      ).toBe(22.5);
    });

    it('returns 0 when no distance data is present', () => {
      expect(getFinalizedRouteDistanceKm(makeRoute({}))).toBe(0);
    });
  });

  describe('compareRouteIdDesc', () => {
    it('sorts by route code/id descending with numeric awareness', () => {
      const routes = [
        makeRoute({ id: 'route-2' }),
        makeRoute({ id: 'route-10' }),
        makeRoute({ id: 'route-1' }),
      ];

      routes.sort(compareRouteIdDesc);

      expect(routes.map((route) => route.id)).toEqual(['route-10', 'route-2', 'route-1']);
    });
  });
});
