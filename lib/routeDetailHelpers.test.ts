import type { Route, Stop } from '@/amplify/types';
import {
  calculateRouteDistanceKm,
  formatCurrency,
  formatElapsedMinutes,
  formatRouteDate,
  formatRouteDateTime,
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

    it('derives from placement start and pickup end when available', () => {
      expect(
        getRouteDurationMinutes(
          makeRoute({
            placementStartTime: '2024-01-01T09:00:00Z',
            pickupEndTime: '2024-01-01T10:30:00Z',
          })
        )
      ).toBe(90);
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

    it('derives in-progress elapsed time from phase start', () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-01T10:10:00Z').getTime());

      expect(
        getRouteDurationMinutes(
          makeRoute({
            status: 'in_progress',
            executionPhase: 'pickup',
            pickupStartTime: '2024-01-01T10:00:00Z',
          })
        )
      ).toBe(10);

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
