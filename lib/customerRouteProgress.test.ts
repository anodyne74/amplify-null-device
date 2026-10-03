import { customerRouteProgress } from './customerRouteProgress';
import { settleStopNotes } from './stopProgress';

const AT = '2026-10-02T13:00:00.000Z';
const LATER = '2026-10-03T12:00:00.000Z';
const placed = settleStopNotes(null, 'placement', 'complete', AT);
const pickedUp = settleStopNotes(placed, 'pickup', 'complete', LATER);

describe('customerRouteProgress', () => {
  it('counts every Stop, whatever its service type, once Pickup is done on a completed Route', () => {
    // W40-26-001: 6 delivery and 5 pickup Stops, all placed and picked up.
    const stops = [
      ...Array.from({ length: 6 }, () => ({ serviceType: 'delivery', notes: pickedUp })),
      ...Array.from({ length: 5 }, () => ({ serviceType: 'pickup', notes: pickedUp })),
    ];

    expect(customerRouteProgress({ status: 'completed', executionPhase: 'unload' }, stops)).toEqual({
      phase: 'pickup',
      label: 'Picked up',
      done: 11,
      total: 11,
    });
  });

  it('counts placed Stops while Placement is under way', () => {
    const stops = [
      ...Array.from({ length: 4 }, () => ({ serviceType: 'pickup', notes: placed })),
      ...Array.from({ length: 7 }, () => ({ serviceType: 'delivery', notes: null })),
    ];

    expect(customerRouteProgress({ status: 'in_progress', executionPhase: 'placement' }, stops)).toEqual({
      phase: 'placement',
      label: 'Placed',
      done: 4,
      total: 11,
    });
  });

  it('leaves a skipped Stop out of the total', () => {
    const skipped = settleStopNotes(null, 'placement', 'skip', AT, 'No access');
    const stops = [{ notes: skipped }, ...Array.from({ length: 10 }, () => ({ notes: placed }))];

    expect(customerRouteProgress({ status: 'in_progress', executionPhase: 'placement' }, stops)).toMatchObject({
      done: 10,
      total: 10,
    });
  });

  it('keeps counting placed Stops until Pickup starts', () => {
    const route = { status: 'in_progress' as const, executionPhase: 'pickup' as const };

    expect(customerRouteProgress(route, [{ notes: placed }]).label).toBe('Placed');
    expect(customerRouteProgress({ ...route, pickupStartTime: LATER }, [{ notes: placed }])).toMatchObject({
      label: 'Picked up',
      done: 0,
      total: 1,
    });
  });
});
