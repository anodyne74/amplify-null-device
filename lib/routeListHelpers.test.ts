import type { Route } from '@/amplify/types';
import {
  compareRouteIdDesc,
  formatEstimatedDurationMinutes,
  formatRouteDuration,
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

    it('prefers the operator-confirmed override duration over actual duration', () => {
      expect(
        formatRouteDuration(makeRoute({ actualDurationMinutes: 75, overrideDurationMinutes: 90 }))
      ).toBe('90 min');
    });

    it("labels an in-progress route's finished phase time as in progress", () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-01T14:00:00Z').getTime());

      expect(
        formatRouteDuration(
          makeRoute({
            status: 'in_progress',
            executionPhase: 'pickup',
            actualStartTime: '2024-01-01T09:00:00Z',
            loadStartedAt: '2024-01-01T09:00:00Z',
            loadConfirmedAt: '2024-01-01T09:20:00Z',
            placementStartTime: '2024-01-01T09:30:00Z',
            placementEndTime: '2024-01-01T10:15:00Z',
            pickupStartTime: '2024-01-01T13:00:00Z',
          })
        )
      ).toBe('65 min (in progress)');

      nowSpy.mockRestore();
    });

    it('returns fallback marker when duration cannot be derived', () => {
      expect(formatRouteDuration(makeRoute({ status: 'planned', actualDurationMinutes: undefined }))).toBe('—');
    });

    it('shows the fallback marker while the first phase of a route is under way', () => {
      expect(
        formatRouteDuration(
          makeRoute({
            status: 'planned',
            executionPhase: 'load',
            actualStartTime: '2024-01-01T09:00:00Z',
            loadStartedAt: '2024-01-01T09:00:00Z',
          })
        )
      ).toBe('—');
    });

    it('shows a legacy completed route its start-to-end time, unlabelled', () => {
      expect(
        formatRouteDuration(
          makeRoute({
            status: 'completed',
            actualStartTime: '2024-01-01T01:00:00Z',
            actualEndTime: '2024-01-01T02:30:00Z',
          })
        )
      ).toBe('90 min');
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

    it('sorts route codes by year and week, not by week alone', () => {
      // A plain (even numeric-aware) string compare would put W48-23-001 after
      // W02-24-001, since 48 > 2 — this asserts year is compared first.
      const routes = [
        makeRoute({ id: 'a', routeCode: 'W48-23-001' }),
        makeRoute({ id: 'b', routeCode: 'W02-24-001' }),
        makeRoute({ id: 'c', routeCode: 'W37-26-001' }),
      ];

      routes.sort(compareRouteIdDesc);

      expect(routes.map((route) => route.routeCode)).toEqual(['W37-26-001', 'W02-24-001', 'W48-23-001']);
    });

    it('breaks ties within the same week by sequence number', () => {
      const routes = [
        makeRoute({ id: 'a', routeCode: 'W36-26-001' }),
        makeRoute({ id: 'b', routeCode: 'W36-26-002' }),
      ];

      routes.sort(compareRouteIdDesc);

      expect(routes.map((route) => route.routeCode)).toEqual(['W36-26-002', 'W36-26-001']);
    });
  });
});
