import {
  summarizePeriodActivity,
  summarizeCurrentRoute,
  summarizeStopsThisWeek,
  summarizeThisWeekListings,
  summarizeStopsByWeek,
  summarizeAgentActivity,
  summarizeLatestInvoice,
} from './customerDashboardOverview';

const NOW = new Date('2026-08-28T12:00:00Z');
const THIS_MONTH = '2026-08-05T09:00:00Z';
const LAST_MONTH = '2026-07-15T09:00:00Z';

describe('customerDashboardOverview', () => {
  describe('summarizePeriodActivity', () => {
    it('sums invoiced/stops/signs for completed routes this month vs last month', () => {
      const routes = [
        { id: 'r1', status: 'completed', unloadConfirmedAt: THIS_MONTH, actualEndTime: THIS_MONTH },
        { id: 'r2', status: 'completed', unloadConfirmedAt: LAST_MONTH, actualEndTime: LAST_MONTH },
        { id: 'r3', status: 'signs_placed', placementEndTime: THIS_MONTH, actualEndTime: THIS_MONTH }, // not completed — excluded
      ];
      const stops = [
        { id: 's1', routeId: 'r1', numberOfSigns: 3 },
        { id: 's2', routeId: 'r1', numberOfSigns: 2 },
        { id: 's3', routeId: 'r2', numberOfSigns: 4 },
        { id: 's4', routeId: 'r3', numberOfSigns: 9 }, // on the excluded route
      ];
      const invoices = [
        { id: 'i1', totalAmount: 500, invoiceDate: THIS_MONTH },
        { id: 'i2', totalAmount: 200, invoiceDate: LAST_MONTH },
      ];

      const result = summarizePeriodActivity(routes, stops, invoices, NOW);

      expect(result.invoicedCurrent).toBe(500);
      expect(result.invoicedDirection).toBe('up');
      expect(result.routesCompletedCurrent).toBe(1);
      expect(result.routesCompletedDirection).toBe('flat');
      expect(result.stopsServiced).toBe(2);
      expect(result.signsHandled).toBe(5);
      expect(result.avgCostPerStop).toBe(250);
    });

    it('reports zeros with no crash when nothing has happened this month', () => {
      const result = summarizePeriodActivity([], [], [], NOW);
      expect(result.invoicedCurrent).toBe(0);
      expect(result.stopsServiced).toBe(0);
      expect(result.avgCostPerStop).toBe(0);
      expect(result.invoicedDirection).toBe('flat');
    });
  });

  describe('summarizeCurrentRoute', () => {
    it('prefers a route in an active phase over a planned or completed one', () => {
      const routes = [
        { id: 'r1', status: 'completed', unloadConfirmedAt: LAST_MONTH, createdAt: LAST_MONTH },
        { id: 'r2', status: 'planned', createdAt: THIS_MONTH },
        { id: 'r3', status: 'signs_placed', placementEndTime: THIS_MONTH, createdAt: THIS_MONTH },
      ];

      const result = summarizeCurrentRoute(routes);

      expect(result?.id).toBe('r3');
    });

    it('falls back to the most recently planned route when nothing is active', () => {
      const routes = [
        { id: 'r1', status: 'planned', createdAt: LAST_MONTH },
        { id: 'r2', status: 'planned', createdAt: THIS_MONTH },
      ];

      const result = summarizeCurrentRoute(routes);

      expect(result?.id).toBe('r2');
    });

    it('breaks a tie by route date, not by when the route was imported (#314)', () => {
      const routes = [
        { id: 'earlier', status: 'planned', scheduledDate: '2026-03-02', createdAt: '2026-09-18T04:00:02Z' },
        { id: 'later', status: 'planned', scheduledDate: '2026-03-09', createdAt: '2026-09-18T04:00:01Z' },
      ];

      expect(summarizeCurrentRoute(routes)?.id).toBe('later');
    });

    it('returns null when there are no routes', () => {
      expect(summarizeCurrentRoute([])).toBeNull();
    });
  });

  describe('summarizeStopsThisWeek', () => {
    it('counts only stops serviced in the current calendar week', () => {
      const stops = [
        { id: 's1', actualArrivalTime: '2026-08-27T09:00:00Z' }, // this week
        { id: 's2', actualArrivalTime: '2026-08-10T09:00:00Z' }, // earlier week
        { id: 's3', estimatedArrivalTime: '2026-08-26T09:00:00Z' }, // this week, no actual time
      ];

      expect(summarizeStopsThisWeek(stops, NOW)).toBe(2);
    });
  });

  describe('summarizeThisWeekListings', () => {
    it('returns the most recent stops from this week, capped at the limit', () => {
      const routes = [{ id: 'r1', status: 'signs_placed', placementEndTime: THIS_MONTH }];
      const stops = [
        { id: 's1', routeId: 'r1', actualArrivalTime: '2026-08-24T09:00:00Z', address: '1 First St' },
        { id: 's2', routeId: 'r1', actualArrivalTime: '2026-08-26T09:00:00Z', address: '2 Second St' },
        { id: 's3', routeId: 'r1', actualArrivalTime: '2026-08-01T09:00:00Z', address: '3 Third St' }, // earlier week
      ];

      const result = summarizeThisWeekListings(stops, routes, 4, NOW);

      expect(result.map((row) => row.id)).toEqual(['s2', 's1']);
      expect(result[0].phaseKey).toBe('signs_placed');
      expect(result[0].label).toBe('2 Second St');
    });
  });

  describe('summarizeStopsByWeek', () => {
    it('buckets stops by week and keeps only the most recent N weeks', () => {
      const stops = [
        { id: 's1', actualArrivalTime: '2026-07-01T09:00:00Z' },
        { id: 's2', actualArrivalTime: '2026-08-05T09:00:00Z' },
        { id: 's3', actualArrivalTime: '2026-08-06T09:00:00Z' },
        { id: 's4', actualArrivalTime: '2026-08-12T09:00:00Z' },
      ];

      const result = summarizeStopsByWeek(stops, 2);

      expect(result).toHaveLength(2);
      expect(result[result.length - 1].stops).toBe(1);
      expect(result[0].stops).toBe(2);
    });
  });

  describe('summarizeAgentActivity', () => {
    const stop = (id: string, routeId: string, agent: string | null, numberOfSigns = 1, removed = false) => ({
      id,
      routeId,
      agent,
      numberOfSigns,
      removed,
    });

    it('gives a Route\'s whole invoiced amount to its only agent', () => {
      const result = summarizeAgentActivity(
        [stop('s1', 'r1', 'Jamie Lee', 3), stop('s2', 'r1', 'Jamie Lee', 2)],
        [{ id: 'i1', routeId: 'r1', totalAmount: 120 }]
      );

      expect(result).toEqual([{ id: 'Jamie Lee', agent: 'Jamie Lee', stops: 2, signs: 5, spend: 120 }]);
    });

    it('shares a Route\'s amount by Stops, not signs, highest spend first', () => {
      const result = summarizeAgentActivity(
        [stop('s1', 'r1', 'Jamie Lee', 1), stop('s2', 'r1', 'Pat Doe', 9), stop('s3', 'r1', 'Pat Doe', 9), stop('s4', 'r1', 'Pat Doe', 9)],
        [{ id: 'i1', routeId: 'r1', totalAmount: 100 }]
      );

      expect(result.map((r) => [r.agent, r.spend])).toEqual([
        ['Pat Doe', 75],
        ['Jamie Lee', 25],
      ]);
    });

    it('sums each agent\'s shares across Routes', () => {
      const result = summarizeAgentActivity(
        [stop('s1', 'r1', 'Jamie Lee'), stop('s2', 'r1', 'Pat Doe'), stop('s3', 'r2', 'Jamie Lee')],
        [
          { id: 'i1', routeId: 'r1', totalAmount: 100 },
          { id: 'i2', routeId: 'r2', totalAmount: 40 },
        ]
      );

      expect(result.map((r) => [r.agent, r.spend])).toEqual([
        ['Jamie Lee', 90],
        ['Pat Doe', 50],
      ]);
    });

    it('puts Stops with no agent under Unassigned', () => {
      const result = summarizeAgentActivity(
        [stop('s1', 'r1', 'Jamie Lee'), stop('s2', 'r1', null), stop('s3', 'r1', '  ')],
        [{ id: 'i1', routeId: 'r1', totalAmount: 90 }]
      );

      expect(result.map((r) => [r.agent, r.stops, r.spend])).toEqual([
        ['Unassigned', 2, 60],
        ['Jamie Lee', 1, 30],
      ]);
    });

    it('counts Removed Stops toward nothing', () => {
      const result = summarizeAgentActivity(
        [stop('s1', 'r1', 'Jamie Lee', 2), stop('s2', 'r1', 'Pat Doe', 5, true)],
        [{ id: 'i1', routeId: 'r1', totalAmount: 80 }]
      );

      expect(result).toEqual([{ id: 'Jamie Lee', agent: 'Jamie Lee', stops: 1, signs: 2, spend: 80 }]);
    });

    it('adds no spend for a Route that is not invoiced, but still counts its Stops and signs', () => {
      const result = summarizeAgentActivity(
        [stop('s1', 'r1', 'Jamie Lee', 4), stop('s2', 'r2', 'Pat Doe', 1)],
        [{ id: 'i1', routeId: 'r1', totalAmount: 50 }]
      );

      expect(result).toEqual([
        { id: 'Jamie Lee', agent: 'Jamie Lee', stops: 1, signs: 4, spend: 50 },
        { id: 'Pat Doe', agent: 'Pat Doe', stops: 1, signs: 1, spend: 0 },
      ]);
    });

    it('ignores an invoice that is not linked to a Route', () => {
      const result = summarizeAgentActivity([stop('s1', 'r1', 'Jamie Lee')], [{ id: 'i1', routeId: null, totalAmount: 50 }]);

      expect(result[0].spend).toBe(0);
    });

    it('rounds so a Route\'s shares add up to its invoiced amount', () => {
      const result = summarizeAgentActivity(
        [stop('s1', 'r1', 'A'), stop('s2', 'r1', 'B'), stop('s3', 'r1', 'C')],
        [{ id: 'i1', routeId: 'r1', totalAmount: 100 }]
      );

      const cents = result.map((r) => Math.round(r.spend * 100));
      expect(cents.reduce((a, b) => a + b, 0)).toBe(10000);
      expect(cents.slice().sort()).toEqual([3333, 3333, 3334]);
    });
  });

  describe('summarizeLatestInvoice', () => {
    it('returns the most recently dated invoice', () => {
      const invoices = [
        { id: 'i1', totalAmount: 100, status: 'paid', invoiceDate: LAST_MONTH },
        { id: 'i2', totalAmount: 200, status: 'sent', invoiceDate: THIS_MONTH },
      ];

      expect(summarizeLatestInvoice(invoices)).toEqual({
        id: 'i2',
        status: 'sent',
        invoiceDate: THIS_MONTH,
        totalAmount: 200,
      });
    });

    it('returns null with no invoices', () => {
      expect(summarizeLatestInvoice([])).toBeNull();
    });
  });
});
