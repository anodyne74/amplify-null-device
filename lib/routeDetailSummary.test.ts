import { computeRouteSummaryStats, getPhaseOverview, isStopCompleted } from './routeDetailSummary';
import type { Route, Stop } from '@/amplify/types';

function baseRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: 'route-1',
    customerId: 'cust-1',
    status: 'planned',
    ...overrides,
  } as Route;
}

function baseStop(overrides: Partial<Stop> = {}): Stop {
  return {
    id: 'stop-1',
    routeId: 'route-1',
    sequence: 1,
    address: '100 Main St',
    serviceType: 'delivery',
    ...overrides,
  } as Stop;
}

describe('getPhaseOverview', () => {
  it('returns null for a null route', () => {
    expect(getPhaseOverview(null, [])).toBeNull();
  });

  it('shows every phase done, with no active phase to link to, once completed', () => {
    const overview = getPhaseOverview(baseRoute({ status: 'completed' }), []);
    expect(overview).toEqual({
      track: ['done', 'done', 'done', 'done', 'done', 'done'],
      caption: 'Route completed',
      phaseIdx: null,
    });
  });

  it('shows every phase done for archived routes too', () => {
    const overview = getPhaseOverview(baseRoute({ status: 'archived' }), []);
    expect(overview?.caption).toBe('Route completed');
    expect(overview?.phaseIdx).toBeNull();
  });

  it('delegates to getSignRunPhase for an active route, passing through its phaseIdx', () => {
    const overview = getPhaseOverview(baseRoute({ status: 'in_progress', executionPhase: 'placement' }), []);
    expect(overview?.phaseIdx).toBe(1);
    expect(overview?.caption).toBe('Signs placed · Phase 3 of 6');
    expect(overview?.track).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming', 'upcoming']);
  });

  it('reads a planned route as still on the Planned segment', () => {
    const overview = getPhaseOverview(baseRoute({ status: 'planned' }), []);
    expect(overview?.phaseIdx).toBe(0);
    expect(overview?.caption).toBe('Planned · Phase 1 of 6');
  });
});

describe('isStopCompleted', () => {
  it('is true once a stop has an actual departure time', () => {
    expect(isStopCompleted(baseStop({ actualDepartureTime: '2026-09-01T10:00:00.000Z' }))).toBe(true);
  });

  it('is false otherwise', () => {
    expect(isStopCompleted(baseStop({ actualDepartureTime: null }))).toBe(false);
  });
});

describe('computeRouteSummaryStats', () => {
  it('summarises every stop for a non-terminal route, regardless of completion', () => {
    const stops = [
      baseStop({ id: 'stop-1', actualDepartureTime: null }),
      baseStop({ id: 'stop-2', actualDepartureTime: '2026-09-01T10:00:00.000Z' }),
    ];
    const stats = computeRouteSummaryStats(baseRoute({ status: 'in_progress' }), stops);
    expect(stats.totalStops).toBe(2);
  });

  it('summarises only completed stops for a completed route, when any are complete', () => {
    const stops = [
      baseStop({ id: 'stop-1', actualDepartureTime: null }),
      baseStop({ id: 'stop-2', actualDepartureTime: '2026-09-01T10:00:00.000Z' }),
    ];
    const stats = computeRouteSummaryStats(baseRoute({ status: 'completed' }), stops);
    expect(stats.totalStops).toBe(1);
  });

  it('falls back to every stop for a completed route with no completed stops', () => {
    const stops = [baseStop({ id: 'stop-1', actualDepartureTime: null })];
    const stats = computeRouteSummaryStats(baseRoute({ status: 'completed' }), stops);
    expect(stats.totalStops).toBe(1);
  });

  it('returns a null duration for a null route, but still counts the stops given', () => {
    const stats = computeRouteSummaryStats(null, [baseStop()]);
    expect(stats.routeDurationMinutes).toBeNull();
    expect(stats.totalStops).toBe(1);
  });

  it('counts only signs recovered during a completed pickup, net of missing signs', () => {
    const stops = [
      baseStop({
        id: 'stop-1',
        serviceType: 'pickup',
        actualDepartureTime: '2026-09-01T10:00:00.000Z',
        numberOfSigns: 5,
        missingSignsCount: 2,
      }),
    ];
    const stats = computeRouteSummaryStats(baseRoute({ status: 'in_progress' }), stops);
    expect(stats.totalSigns).toBe(3);
  });
});
