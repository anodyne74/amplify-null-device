import {
  summarizeBilledThisMonth,
  summarizeRoutesStopsThisMonth,
  summarizeOutstanding,
  summarizeSignsInField,
  summarizeRouteStatusCounts,
  summarizeCustomersByVolume,
  summarizeNeedsAttention,
  formatWeekLabel,
} from './adminDashboardOverview';

const NOW = new Date('2026-08-28T12:00:00Z');
const THIS_MONTH = '2026-08-05';
const LAST_MONTH = '2026-07-15';

describe('adminDashboardOverview', () => {
  describe('summarizeBilledThisMonth', () => {
    it('sums this month vs last month and computes a trend', () => {
      const invoices = [
        { id: 'i1', customerId: 'c1', totalAmount: 1000, invoiceDate: THIS_MONTH },
        { id: 'i2', customerId: 'c2', totalAmount: 500, invoiceDate: THIS_MONTH },
        { id: 'i3', customerId: 'c1', totalAmount: 1000, invoiceDate: LAST_MONTH },
      ];

      const result = summarizeBilledThisMonth(invoices, NOW);

      expect(result.currentTotal).toBe(1500);
      expect(result.previousTotal).toBe(1000);
      expect(result.customerCount).toBe(2);
      expect(result.direction).toBe('up');
      expect(result.deltaPercent).toBe(50);
    });

    it('reports flat when there is no invoiced activity in either month', () => {
      const result = summarizeBilledThisMonth([], NOW);
      expect(result.currentTotal).toBe(0);
      expect(result.direction).toBe('flat');
      expect(result.customerCount).toBe(0);
    });
  });

  describe('summarizeRoutesStopsThisMonth', () => {
    it('counts routes serviced this month and the stops on them', () => {
      const routes = [
        { id: 'r1', actualEndTime: THIS_MONTH },
        { id: 'r2', actualEndTime: THIS_MONTH },
        { id: 'r3', actualEndTime: LAST_MONTH },
      ];
      const stops = [
        { id: 's1', routeId: 'r1' },
        { id: 's2', routeId: 'r1' },
        { id: 's3', routeId: 'r2' },
        { id: 's4', routeId: 'r3' }, // last month's route — excluded
      ];

      const result = summarizeRoutesStopsThisMonth(routes, stops, NOW);

      expect(result.currentRoutes).toBe(2);
      expect(result.previousRoutes).toBe(1);
      expect(result.stopsServiced).toBe(3);
      expect(result.direction).toBe('up');
    });

    it('ignores routes with no activity date', () => {
      const result = summarizeRoutesStopsThisMonth([{ id: 'r1' }], [], NOW);
      expect(result.currentRoutes).toBe(0);
      expect(result.stopsServiced).toBe(0);
    });
  });

  describe('summarizeOutstanding', () => {
    it('totals unpaid invoices and counts those sent 30+ days ago', () => {
      const invoices = [
        { id: 'i1', totalAmount: 100, status: 'paid', invoiceDate: '2026-06-01' },
        { id: 'i2', totalAmount: 200, status: 'sent', invoiceDate: '2026-06-01' }, // ~88 days old
        { id: 'i3', totalAmount: 300, status: 'sent', invoiceDate: '2026-08-25' }, // recent
        { id: 'i4', totalAmount: 50, status: 'draft', invoiceDate: '2026-06-01' }, // draft, not yet sent
      ];

      const result = summarizeOutstanding(invoices, NOW);

      expect(result.total).toBe(550); // everything not paid
      expect(result.pastDueCount).toBe(1); // only i2 is sent + 30 days old
    });
  });

  describe('summarizeSignsInField', () => {
    it('sums signs on routes currently placed but not picked up', () => {
      const routes = [
        { id: 'r1', status: 'signs_placed' },
        { id: 'r2', status: 'completed' },
      ];
      const stops = [
        { id: 's1', routeId: 'r1', numberOfSigns: 5 },
        { id: 's2', routeId: 'r1', numberOfSigns: 3 },
        { id: 's3', routeId: 'r2', numberOfSigns: 10 },
      ];

      expect(summarizeSignsInField(routes, stops)).toBe(8);
    });
  });

  describe('summarizeRouteStatusCounts', () => {
    it('counts every non-archived status and excludes archived', () => {
      const routes = [
        { id: 'r1', status: 'planned' },
        { id: 'r2', status: 'planned' },
        { id: 'r3', status: 'completed' },
        { id: 'r4', status: 'archived' },
      ];

      expect(summarizeRouteStatusCounts(routes)).toEqual({
        planned: 2,
        in_progress: 0,
        signs_placed: 0,
        signs_picked_up: 0,
        completed: 1,
      });
    });
  });

  describe('summarizeCustomersByVolume', () => {
    it('aggregates per-customer routes/stops/signs/billed within the trailing window', () => {
      const customers = [{ id: 'c1', name: 'Acme' }, { id: 'c2', name: 'Beta' }];
      const routes = [
        { id: 'r1', customerId: 'c1', actualEndTime: '2026-08-20' },
        { id: 'r2', customerId: 'c1', actualEndTime: '2026-01-01' }, // outside window
      ];
      const stops = [{ id: 's1', routeId: 'r1', numberOfSigns: 4 }];
      const invoices = [{ id: 'i1', customerId: 'c1', totalAmount: 250, invoiceDate: '2026-08-20' }];

      const rows = summarizeCustomersByVolume(customers, routes, stops, invoices, NOW);

      expect(rows).toEqual([{ id: 'c1', name: 'Acme', routes: 1, stops: 1, signs: 4, billed: 250 }]);
    });

    it('omits customers with no activity in the window', () => {
      const rows = summarizeCustomersByVolume([{ id: 'c1', name: 'Acme' }], [], [], [], NOW);
      expect(rows).toEqual([]);
    });
  });

  describe('summarizeNeedsAttention', () => {
    it('lists overdue invoices before missing-account-owner issues, worst first', () => {
      const invoices = [
        { id: 'i1', customerId: 'c1', totalAmount: 400, status: 'sent', invoiceDate: '2026-06-01' }, // ~88 days
        { id: 'i2', customerId: 'c2', totalAmount: 100, status: 'sent', invoiceDate: '2026-07-01' }, // ~58 days
      ];
      const customers = [
        { id: 'c1', name: 'Acme' },
        { id: 'c2', name: 'Beta' },
        { id: 'c3', name: 'Gamma' },
      ];
      const customerUsers = [{ customerId: 'c1', role: 'account_owner' }];

      const items = summarizeNeedsAttention(invoices, customers, customerUsers, NOW);

      expect(items[0]).toMatchObject({ title: 'Acme', tone: 'danger' });
      expect(items[1]).toMatchObject({ title: 'Beta', tone: 'danger' });
      expect(items.some((item) => item.title === 'Beta' && item.detail === 'No account owner set')).toBe(true);
      expect(items.some((item) => item.title === 'Gamma' && item.detail === 'No account owner set')).toBe(true);
      expect(items.some((item) => item.title === 'Acme' && item.detail === 'No account owner set')).toBe(false);
    });

    it('returns an empty list when nothing needs attention', () => {
      expect(summarizeNeedsAttention([], [], [], NOW)).toEqual([]);
    });
  });

  describe('formatWeekLabel', () => {
    it('formats an ISO week-start date as a short day/month label', () => {
      expect(formatWeekLabel('2026-08-09')).toBe('9 Aug');
    });

    it('falls back to the raw string for an unparsable date', () => {
      expect(formatWeekLabel('not-a-date')).toBe('not-a-date');
    });
  });
});
