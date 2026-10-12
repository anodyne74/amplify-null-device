import { planPayoutPeriodBackfill } from '../backfill-payout-periods.js';

const route = (over = {}) => ({ id: 'r1', routeCode: 'W48-23-001', actualEndTime: '2023-12-02T00:00:00.000Z', ...over });
const payout = (over = {}) => ({ id: 'p1', routeId: 'r1', amount: 33.75, status: 'paid', ...over });

describe('planPayoutPeriodBackfill', () => {
  it("sets both period dates to the UTC date of the linked Route's actualEndTime", () => {
    const { changes } = planPayoutPeriodBackfill([payout()], [route()]);
    expect(changes).toEqual([
      { id: 'p1', routeCode: 'W48-23-001', status: 'paid', amount: 33.75, periodStartDate: '2023-12-02', periodEndDate: '2023-12-02' },
    ]);
  });

  it('never touches a payout that already has a period', () => {
    const plan = planPayoutPeriodBackfill([payout({ periodEndDate: '2026-03-31' })], [route()]);
    expect(plan.changes).toEqual([]);
    expect(plan.alreadySet).toBe(1);
  });

  it('treats a payout with only a start date as already set', () => {
    expect(planPayoutPeriodBackfill([payout({ periodStartDate: '2026-03-01' })], [route()]).alreadySet).toBe(1);
  });

  it('skips and reports a payout with no routeId', () => {
    const plan = planPayoutPeriodBackfill([payout({ routeId: null })], [route()]);
    expect(plan.changes).toEqual([]);
    expect(plan.skipped).toEqual([{ id: 'p1', routeCode: null, reason: 'no route linked' }]);
  });

  it('skips and reports a payout whose Route no longer exists', () => {
    const plan = planPayoutPeriodBackfill([payout({ routeId: 'gone' })], [route()]);
    expect(plan.skipped).toEqual([{ id: 'p1', routeCode: null, reason: 'route not found' }]);
  });

  it('skips and reports a Route with no usable actualEndTime, never using createdAt', () => {
    const plan = planPayoutPeriodBackfill(
      [payout()],
      [route({ actualEndTime: null, createdAt: '2026-09-18T04:00:00Z' })]
    );
    expect(plan.changes).toEqual([]);
    expect(plan.skipped).toEqual([{ id: 'p1', routeCode: 'W48-23-001', reason: 'route has no end time' }]);
  });

  it('lists the pending payouts among the changes separately', () => {
    const plan = planPayoutPeriodBackfill(
      [payout({ id: 'p1', status: 'paid' }), payout({ id: 'p2', status: 'pending' })],
      [route()]
    );
    expect(plan.changes).toHaveLength(2);
    expect(plan.pending.map((c) => c.id)).toEqual(['p2']);
  });
});
