import type { Route } from '@/amplify/types';
import {
  compareRouteIdDesc,
  comparePlacementDateDesc,
  compareRoutesBy,
  formatEstimatedDurationMinutes,
  formatRouteDuration,
  formatStopTotals,
  routeNeedsAttention,
  routePickupOverdue,
  localToday,
  planOperatorAssignment,
  summariseStopsByRoute,
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

describe('summariseStopsByRoute', () => {
  it('totals Stops and Signs per Route', () => {
    const totals = summariseStopsByRoute([
      { routeId: 'a', numberOfSigns: 2 },
      { routeId: 'a', numberOfSigns: 3 },
      { routeId: 'b', numberOfSigns: 1 },
    ]);
    expect(totals.get('a')).toEqual({ stops: 2, signs: 5 });
    expect(totals.get('b')).toEqual({ stops: 1, signs: 1 });
  });

  it('counts a Stop with no sign count as a Stop with no Signs', () => {
    expect(summariseStopsByRoute([{ routeId: 'a', numberOfSigns: null }]).get('a')).toEqual({ stops: 1, signs: 0 });
  });

  it('has no entry for a Route with no Stops', () => {
    expect(summariseStopsByRoute([]).get('a')).toBeUndefined();
  });
});

describe('formatStopTotals', () => {
  it('pluralises', () => {
    expect(formatStopTotals({ stops: 12, signs: 31 })).toBe('12 stops · 31 signs');
    expect(formatStopTotals({ stops: 1, signs: 1 })).toBe('1 stop · 1 sign');
  });

  it('says so plainly when the Route has no Stops', () => {
    expect(formatStopTotals(undefined)).toBe('No stops yet');
  });
});

describe('comparePlacementDateDesc', () => {
  const route = (id: string, scheduledDate?: string, routeCode?: string) =>
    makeRoute({ id, scheduledDate, routeCode });

  it('puts the latest Placement Date first and Routes with none last', () => {
    const sorted = [route('none'), route('may', '2026-05-08'), route('june', '2026-06-01')].sort(comparePlacementDateDesc);
    expect(sorted.map((r) => r.id)).toEqual(['june', 'may', 'none']);
  });

  it('orders Routes on the same day by Route Code, latest first', () => {
    const sorted = [route('a', '2026-05-08', 'W19-26-001'), route('b', '2026-05-08', 'W19-26-002')].sort(
      comparePlacementDateDesc
    );
    expect(sorted.map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('routeNeedsAttention', () => {
  const today = '2026-11-04';
  const staffed = { assignedOperatorName: 'Pat Lee' };

  it('includes a Route with no Operator, by name or email', () => {
    expect(routeNeedsAttention(makeRoute({}), today)).toBe(true);
    expect(routeNeedsAttention(makeRoute({ assignedOperatorEmail: 'pat@example.com', pickupDate: '2026-12-01' }), today)).toBe(false);
  });

  it('includes an assigned Route whose Pickup Date has passed and is not finished', () => {
    expect(routeNeedsAttention(makeRoute({ ...staffed, pickupDate: '2026-11-03' }), today)).toBe(true);
  });

  it('leaves out an assigned Route picking up today or later, or with no Pickup Date', () => {
    expect(routeNeedsAttention(makeRoute({ ...staffed, pickupDate: '2026-11-04' }), today)).toBe(false);
    expect(routeNeedsAttention(makeRoute({ ...staffed, pickupDate: '2026-11-20' }), today)).toBe(false);
    expect(routeNeedsAttention(makeRoute({ ...staffed }), today)).toBe(false);
  });

  it('never includes a finished Route, even unassigned and past its Pickup Date', () => {
    expect(routeNeedsAttention(makeRoute({ status: 'completed', pickupDate: '2026-01-01' }), today)).toBe(false);
  });
});

describe('compareRoutesBy', () => {
  const customers = { c1: 'Acme', c2: 'globex' };
  const sorted = (routes: Route[], key: Parameters<typeof compareRoutesBy>[0], direction: 'asc' | 'desc') =>
    [...routes].sort(compareRoutesBy(key, direction, customers)).map((route) => route.id);

  const early = makeRoute({ id: 'early', scheduledDate: '2026-05-01', pickupDate: '2026-05-20', customerId: 'c2' });
  const late = makeRoute({ id: 'late', scheduledDate: '2026-05-09', pickupDate: '2026-05-30', customerId: 'c1' });
  const undated = makeRoute({ id: 'undated', routeCode: 'W01-26-001', scheduledDate: undefined, pickupDate: undefined, customerId: 'c1' });

  it.each(['placementDate', 'pickupDate'] as const)('sorts %s both ways, with undated Routes last either way', (key) => {
    expect(sorted([undated, late, early], key, 'asc')).toEqual(['early', 'late', 'undated']);
    expect(sorted([undated, early, late], key, 'desc')).toEqual(['late', 'early', 'undated']);
  });

  it('sorts by Customer name ignoring case, both ways', () => {
    expect(sorted([early, late], 'customer', 'asc')).toEqual(['late', 'early']);
    expect(sorted([early, late], 'customer', 'desc')).toEqual(['early', 'late']);
  });

  it('sorts by Status in Sign Run flow order, both ways', () => {
    const planned = makeRoute({ id: 'planned', status: 'planned' });
    const placed = makeRoute({ id: 'placed', status: 'signs_placed' });
    expect(sorted([placed, planned], 'status', 'asc')).toEqual(['planned', 'placed']);
    expect(sorted([planned, placed], 'status', 'desc')).toEqual(['placed', 'planned']);
  });
});

describe('routePickupOverdue', () => {
  it('is overdue only when the Pickup Date is before today and the Route is not finished', () => {
    expect(routePickupOverdue(makeRoute({ pickupDate: '2026-11-03' }), '2026-11-04')).toBe(true);
    expect(routePickupOverdue(makeRoute({ pickupDate: '2026-11-04' }), '2026-11-04')).toBe(false);
    expect(routePickupOverdue(makeRoute({}), '2026-11-04')).toBe(false);
    expect(routePickupOverdue(makeRoute({ status: 'completed', pickupDate: '2026-01-01' }), '2026-11-04')).toBe(false);
  });
});

describe('localToday', () => {
  it('formats the local date as YYYY-MM-DD', () => {
    expect(localToday(new Date(2026, 10, 4, 23, 59))).toBe('2026-11-04');
  });
});

describe('planOperatorAssignment', () => {
  const open = makeRoute({ id: 'open' });
  const staffedByOther = makeRoute({ id: 'other', assignedOperatorSub: 'sub-2', assignedOperatorName: 'Sam' });
  const staffedBySame = makeRoute({ id: 'same', assignedOperatorSub: 'sub-1', assignedOperatorName: 'Pat' });
  const finished = makeRoute({ id: 'done', status: 'completed' });

  it('assigns unstaffed and differently staffed Routes, naming the ones it would overwrite', () => {
    const plan = planOperatorAssignment([open, staffedByOther], 'sub-1');
    expect(plan.eligible.map((r) => r.id)).toEqual(['open', 'other']);
    expect(plan.overwrites.map((r) => r.id)).toEqual(['other']);
  });

  it('leaves finished Routes and Routes already with this Operator alone', () => {
    const plan = planOperatorAssignment([finished, staffedBySame, open], 'sub-1');
    expect(plan.finished.map((r) => r.id)).toEqual(['done']);
    expect(plan.alreadyAssigned.map((r) => r.id)).toEqual(['same']);
    expect(plan.eligible.map((r) => r.id)).toEqual(['open']);
  });
});
