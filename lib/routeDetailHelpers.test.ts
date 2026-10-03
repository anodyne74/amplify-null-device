import type { Route, Stop } from '@/amplify/types';
import {
  calculateRouteDistanceKm,
  formatCurrency,
  formatElapsedMinutes,
  formatRouteDate,
  formatRouteDateTime,
  getRouteDate,
  getRouteRunDate,
  getRouteDurationMinutes,
} from '@/lib/routeDetailHelpers';

function makeRoute(overrides: Partial<Route>): Route {
  return {
    id: overrides.id ?? 'route-1',
    customerId: overrides.customerId ?? 'customer-1',
    status: overrides.status ?? 'planned',
    ...overrides,
  } as Route;
}

function makeStop(overrides: Partial<Stop>): Stop {
  return {
    id: overrides.id ?? 'stop-1',
    routeId: overrides.routeId ?? 'route-1',
    sequence: overrides.sequence ?? 1,
    address: overrides.address ?? '100 Main St',
    serviceType: overrides.serviceType ?? 'delivery',
    ...overrides,
  } as Stop;
}

describe('routeDetailHelpers', () => {
  describe('formatRouteDate', () => {
    it('formats date strings and handles missing dates', () => {
      expect(formatRouteDate('2024-01-10T10:00:00Z')).toBe('Jan 10, 2024');
      expect(formatRouteDate(undefined)).toBe('—');
      expect(formatRouteDate(null)).toBe('—');
    });
  });

  describe('getRouteRunDate', () => {
    it('is the scheduledDate, else the UTC day it started, else the UTC day placement started', () => {
      expect(getRouteRunDate({ scheduledDate: '2026-03-02', actualStartTime: '2026-03-05T00:00:00Z' })).toBe('2026-03-02');
      expect(getRouteRunDate({ actualStartTime: '2025-06-10T00:00:00.000Z', placementStartTime: '2025-06-11T00:00:00Z' })).toBe('2025-06-10');
      expect(getRouteRunDate({ placementStartTime: '2025-06-20T23:30:00Z' })).toBe('2025-06-20');
    });

    it('never falls back to createdAt', () => {
      expect(getRouteRunDate({ createdAt: '2026-09-18T04:00:00Z' })).toBeNull();
      expect(getRouteRunDate({ actualStartTime: 'not a date', createdAt: '2026-09-18T04:00:00Z' })).toBeNull();
    });
  });

  describe('getRouteDate', () => {
    it('uses scheduledDate when it is set', () => {
      expect(
        getRouteDate({ scheduledDate: '2026-03-02', actualStartTime: '2026-03-05T00:00:00Z', createdAt: '2026-09-18T04:00:00Z' })
      ).toBe('2026-03-02');
    });

    it('falls back to the UTC date of actualStartTime', () => {
      expect(getRouteDate({ actualStartTime: '2024-01-15T00:00:00Z', createdAt: '2026-09-18T04:00:00Z' })).toBe('2024-01-15');
      expect(getRouteDate({ scheduledDate: null, actualStartTime: '2024-01-15T23:30:00Z' })).toBe('2024-01-15');
    });

    it('falls back to the UTC date of createdAt', () => {
      expect(getRouteDate({ createdAt: '2026-09-18T04:00:00Z' })).toBe('2026-09-18');
    });

    it('is null when the route has no date at all', () => {
      expect(getRouteDate({})).toBeNull();
      expect(getRouteDate({ scheduledDate: null, actualStartTime: null, createdAt: null })).toBeNull();
    });
  });

  describe('formatRouteDate with a route date', () => {
    const originalTz = process.env.TZ;
    afterEach(() => {
      process.env.TZ = originalTz;
    });

    it('shows a date-only value as that calendar day, west of UTC too', () => {
      process.env.TZ = 'America/Los_Angeles';
      expect(formatRouteDate(getRouteDate({ actualStartTime: '2024-01-15T00:00:00Z' }))).toBe('Jan 15, 2024');
      expect(formatRouteDate('2026-03-02')).toBe('Mar 2, 2026');
    });

    it('shows a date-only value as that calendar day, east of UTC too', () => {
      process.env.TZ = 'Pacific/Auckland';
      expect(formatRouteDate('2024-01-15')).toBe('Jan 15, 2024');
    });
  });

  describe('formatRouteDateTime', () => {
    it('formats date-times and handles missing dates', () => {
      expect(formatRouteDateTime('2024-01-10T10:05:00Z')).toContain('Jan 10');
      expect(formatRouteDateTime(undefined)).toBe('—');
      expect(formatRouteDateTime(null)).toBe('—');
    });
  });

  describe('formatElapsedMinutes', () => {
    it('formats null and short durations', () => {
      expect(formatElapsedMinutes(null)).toBe('—');
      expect(formatElapsedMinutes(45)).toBe('45 min');
    });

    it('formats whole-hour and mixed durations', () => {
      expect(formatElapsedMinutes(120)).toBe('2h');
      expect(formatElapsedMinutes(125)).toBe('2h 5m');
    });
  });

  describe('formatCurrency', () => {
    it('formats AUD values and null', () => {
      expect(formatCurrency(null)).toBe('—');
      expect(formatCurrency(12.5)).toBe('$12.50');
    });
  });

  describe('getRouteDurationMinutes', () => {
    it('prefers actual duration minutes and clamps negatives', () => {
      expect(getRouteDurationMinutes(makeRoute({ actualDurationMinutes: 35 }))).toBe(35);
      expect(getRouteDurationMinutes(makeRoute({ actualDurationMinutes: -4 }))).toBe(0);
    });

    it('prefers the operator-confirmed override duration over actual duration', () => {
      expect(
        getRouteDurationMinutes(makeRoute({ overrideDurationMinutes: 52, actualDurationMinutes: 35 }))
      ).toBe(52);
      expect(getRouteDurationMinutes(makeRoute({ overrideDurationMinutes: -4 }))).toBe(0);
    });

    it('sums all four phases of a route awaiting Finalise, leaving out the time between them', () => {
      expect(
        getRouteDurationMinutes(
          makeRoute({
            status: 'in_progress',
            executionPhase: 'unload',
            actualStartTime: '2024-01-01T09:00:00Z',
            loadStartedAt: '2024-01-01T09:00:00Z',
            loadConfirmedAt: '2024-01-01T09:20:00Z',
            placementStartTime: '2024-01-01T09:30:00Z',
            placementEndTime: '2024-01-01T10:15:00Z',
            pickupStartTime: '2024-01-02T17:00:00Z',
            pickupEndTime: '2024-01-02T17:50:00Z',
            unloadStartedAt: '2024-01-02T18:00:00Z',
            unloadConfirmedAt: '2024-01-02T18:15:00Z',
            actualEndTime: '2024-01-02T18:15:00Z',
          })
        )
      ).toBe(130);
    });

    it('falls back to actual start and end times', () => {
      expect(
        getRouteDurationMinutes(
          makeRoute({
            actualStartTime: '2024-01-01T09:00:00Z',
            actualEndTime: '2024-01-01T09:45:00Z',
          })
        )
      ).toBe(45);
    });

    it('sums the finished phases of an in-progress route, not the one under way', () => {
      const route = makeRoute({
        status: 'in_progress',
        executionPhase: 'pickup',
        actualStartTime: '2024-01-01T09:00:00Z',
        loadStartedAt: '2024-01-01T09:00:00Z',
        loadConfirmedAt: '2024-01-01T09:20:00Z',
        placementStartTime: '2024-01-01T09:30:00Z',
        placementEndTime: '2024-01-01T10:15:00Z',
        pickupStartTime: '2024-01-01T13:00:00Z',
      });
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-01T14:00:00Z').getTime());

      expect(getRouteDurationMinutes(route)).toBe(65);

      nowSpy.mockReturnValue(new Date('2024-01-01T16:30:00Z').getTime());
      expect(getRouteDurationMinutes(route)).toBe(65);

      nowSpy.mockRestore();
    });

    it('has no duration while the first phase of a route is still under way', () => {
      expect(
        getRouteDurationMinutes(
          makeRoute({
            status: 'planned',
            executionPhase: 'load',
            actualStartTime: '2024-01-01T09:00:00Z',
            loadStartedAt: '2024-01-01T09:00:00Z',
          })
        )
      ).toBeNull();
    });

    it("doesn't count a phase as finished without its start", () => {
      expect(
        getRouteDurationMinutes(
          makeRoute({
            status: 'in_progress',
            executionPhase: 'unload',
            pickupEndTime: '2024-01-01T10:00:00Z',
          })
        )
      ).toBeNull();
    });

    it('sums all four phases of a route awaiting Finalise, leaving out the time between them', () => {
      expect(
        getRouteDurationMinutes(
          makeRoute({
            status: 'in_progress',
            executionPhase: 'unload',
            actualStartTime: '2024-01-01T09:00:00Z',
            loadStartedAt: '2024-01-01T09:00:00Z',
            loadConfirmedAt: '2024-01-01T09:20:00Z',
            placementStartTime: '2024-01-01T09:30:00Z',
            placementEndTime: '2024-01-01T10:15:00Z',
            pickupStartTime: '2024-01-02T17:00:00Z',
            pickupEndTime: '2024-01-02T17:50:00Z',
            unloadStartedAt: '2024-01-02T18:00:00Z',
            unloadConfirmedAt: '2024-01-02T18:15:00Z',
            actualEndTime: '2024-01-02T18:15:00Z',
          })
        )
      ).toBe(130);
    });

    it('falls back to actual start and end times', () => {
      expect(
        getRouteDurationMinutes(
          makeRoute({
            actualStartTime: '2024-01-01T09:00:00Z',
            actualEndTime: '2024-01-01T09:45:00Z',
          })
        )
      ).toBe(45);
    });

    it('sums the finished phases of an in-progress route, not the one under way', () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-01T14:00:00Z').getTime());

      expect(
        getRouteDurationMinutes(
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
      ).toBe(65);

      nowSpy.mockRestore();
    });

    it('returns null when no duration signal is present', () => {
      expect(getRouteDurationMinutes(makeRoute({ status: 'planned' }))).toBeNull();
    });
  });

  describe('calculateRouteDistanceKm', () => {
    it('returns zero when fewer than two coordinates are present', () => {
      const stops = [makeStop({ latitude: -37.81, longitude: 144.96 })];
      expect(calculateRouteDistanceKm(stops)).toBe(0);
    });

    it('calculates rounded distance across ordered stops', () => {
      const stops = [
        makeStop({ id: 's2', sequence: 2, latitude: 0, longitude: 1 }),
        makeStop({ id: 's1', sequence: 1, latitude: 0, longitude: 0 }),
      ];

      const distance = calculateRouteDistanceKm(stops);
      expect(distance).toBeGreaterThan(110);
      expect(distance).toBeLessThan(112);
    });
  });
});
