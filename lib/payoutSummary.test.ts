import { outstandingTotal, payoutDate, summarisePayouts, type SummaryPayout, type SummaryRoute } from './payoutSummary';

const payout = (over: Partial<SummaryPayout> = {}): SummaryPayout => ({
  id: 'p1',
  amount: 100,
  status: 'paid',
  periodEndDate: '2026-03-10',
  ...over,
});
const route = (over: Partial<SummaryRoute> = {}): SummaryRoute => ({
  id: 'r1',
  status: 'completed',
  actualEndTime: '2026-03-10T00:00:00.000Z',
  ...over,
});

describe('payoutDate', () => {
  it('is the period end date', () => {
    expect(payoutDate(payout())).toEqual({ day: '2026-03-10', estimated: false });
  });

  it('falls back to when the payout was raised, marked estimated', () => {
    expect(payoutDate(payout({ periodEndDate: null, createdAt: '2026-04-02T10:00:00Z' }))).toEqual({
      day: '2026-04-02',
      estimated: true,
    });
  });

  it('is null when there is no date at all', () => {
    expect(payoutDate(payout({ periodEndDate: null }))).toBeNull();
  });
});

describe('outstandingTotal', () => {
  it('sums pending payouts only', () => {
    expect(
      outstandingTotal([
        payout({ amount: 10.1, status: 'pending' }),
        payout({ amount: 20.2, status: 'pending' }),
        payout({ amount: 99, status: 'paid' }),
      ])
    ).toBe(30.3);
  });

  it('is zero with nothing owed', () => {
    expect(outstandingTotal([])).toBe(0);
  });
});

describe('summarisePayouts', () => {
  const now = new Date('2026-06-15T12:00:00Z');

  it('splits paid from outstanding and finds the largest single payout', () => {
    const { allTime } = summarisePayouts(
      [
        payout({ id: 'a', amount: 50, status: 'paid' }),
        payout({ id: 'b', amount: 120, status: 'paid' }),
        payout({ id: 'c', amount: 30, status: 'pending' }),
      ],
      [route()],
      now
    );
    expect(allTime).toMatchObject({ paid: 170, outstanding: 30, largest: 120 });
  });

  it('averages paid plus outstanding over the routes completed in the same window', () => {
    const { allTime } = summarisePayouts(
      [payout({ amount: 60, status: 'paid' }), payout({ id: 'b', amount: 40, status: 'pending' })],
      [route({ id: 'r1' }), route({ id: 'r2' }), route({ id: 'r3' }), route({ id: 'r4' })],
      now
    );
    expect(allTime.routesCompleted).toBe(4);
    expect(allTime.averagePerRoute).toBe(25);
  });

  it('has no average when no routes were completed', () => {
    expect(summarisePayouts([payout()], [], now).allTime.averagePerRoute).toBeNull();
  });

  it('counts archived routes as completed and ignores unfinished ones', () => {
    const { allTime } = summarisePayouts(
      [],
      [route({ id: 'a', status: 'archived' }), route({ id: 'b', status: 'in_progress' }), route({ id: 'c' })],
      now
    );
    expect(allTime.routesCompleted).toBe(2);
  });

  it('dates a route by its end time, falling back to its scheduled date', () => {
    const { months } = summarisePayouts(
      [],
      [route({ actualEndTime: null, scheduledDate: '2026-02-20' })],
      now
    );
    expect(months.map((m) => m.key)).toEqual(['2026-02']);
  });

  it('year to date covers 1 January of the current year onward only', () => {
    const { yearToDate, allTime } = summarisePayouts(
      [
        payout({ id: 'a', amount: 100, periodEndDate: '2026-01-01' }),
        payout({ id: 'b', amount: 70, periodEndDate: '2025-12-31' }),
      ],
      [
        route({ id: 'r1', actualEndTime: '2026-01-01T00:00:00Z' }),
        route({ id: 'r2', actualEndTime: '2025-12-31T00:00:00Z' }),
      ],
      now
    );
    expect(yearToDate).toMatchObject({ paid: 100, routesCompleted: 1 });
    expect(allTime).toMatchObject({ paid: 170, routesCompleted: 2 });
  });

  it('breaks down by month, newest first, including months with only routes or only payouts', () => {
    const { months } = summarisePayouts(
      [
        payout({ id: 'a', amount: 10, periodEndDate: '2026-03-31' }),
        payout({ id: 'b', amount: 5, status: 'pending', periodEndDate: '2026-03-02' }),
        payout({ id: 'c', amount: 8, periodEndDate: '2025-11-05' }),
      ],
      [route({ id: 'r1', actualEndTime: '2026-04-04T00:00:00Z' })],
      now
    );
    expect(months.map((m) => m.key)).toEqual(['2026-04', '2026-03', '2025-11']);
    expect(months[1]).toMatchObject({ paid: 10, outstanding: 5, largest: 10, routesCompleted: 0, averagePerRoute: null });
    expect(months[0]).toMatchObject({ paid: 0, outstanding: 0, largest: null, routesCompleted: 1, averagePerRoute: 0 });
  });

  it('puts an undated payout in the all-time totals only', () => {
    const { allTime, months, yearToDate } = summarisePayouts([payout({ periodEndDate: null, amount: 9 })], [], now);
    expect(allTime.paid).toBe(9);
    expect(yearToDate.paid).toBe(0);
    expect(months).toEqual([]);
  });

  it('rounds money to cents', () => {
    const { allTime } = summarisePayouts(
      [payout({ amount: 0.1 }), payout({ id: 'b', amount: 0.2 })],
      [route({ id: 'a' }), route({ id: 'b' }), route({ id: 'c' })],
      now
    );
    expect(allTime.paid).toBe(0.3);
    expect(allTime.averagePerRoute).toBe(0.1);
  });
});
