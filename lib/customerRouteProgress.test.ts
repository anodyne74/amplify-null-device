import { customerRouteProgress } from './customerRouteProgress';
import { settleStopNotes } from './stopProgress';

const AT = '2026-10-02T13:00:00.000Z';
const LATER = '2026-10-03T12:00:00.000Z';
const placed = settleStopNotes(null, 'placement', 'complete', AT);
const pickedUp = settleStopNotes(placed, 'pickup', 'complete', LATER);

describe('customerRouteProgress', () => {
  it('counts every Stop once Pickup is done on a completed Route', () => {
    // W40-26-001: 11 Stops, all placed and picked up.
    const stops = [
      ...Array.from({ length: 6 }, () => ({ notes: pickedUp })),
      ...Array.from({ length: 5 }, () => ({ notes: pickedUp })),
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
      ...Array.from({ length: 4 }, () => ({ notes: placed })),
      ...Array.from({ length: 7 }, () => ({ notes: null })),
    ];

    expect(customerRouteProgress({ status: 'in_progress', executionPhase: 'placement' }, stops)).toEqual({
      phase: 'placement',
      label: 'Placed',
      done: 4,
      total: 11,
    });
  });

  it("counts a Couldn't Collect Stop in the total but not as picked up, and leaves a Removed Stop out", () => {
    const couldntCollect = settleStopNotes(placed, 'pickup', 'couldntCollect', LATER, 'No access');
    const stops = [{ notes: couldntCollect }, { notes: pickedUp }, { notes: placed, removed: true, removedReason: 'Gate locked' }];

    expect(customerRouteProgress({ status: 'in_progress', executionPhase: 'pickup', pickupStartTime: LATER }, stops)).toMatchObject({
      done: 1,
      total: 2,
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

  it('reads a Route whose status says its signs are picked up as past Pickup', () => {
    expect(customerRouteProgress({ status: 'signs_picked_up', executionPhase: null }, [{ notes: pickedUp }]).label).toBe(
      'Picked up'
    );
  });
});
