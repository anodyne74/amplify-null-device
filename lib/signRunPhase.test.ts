import { getSignRunPhase, getRoutePhaseKey, ROUTE_PHASE_KEYS, ROUTE_PHASE_LABELS } from './signRunPhase';
import type { Route } from '@/amplify/types';

function baseRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: 'route-1',
    customerId: 'cust-1',
    status: 'planned',
    ...overrides,
  } as Route;
}

describe('getSignRunPhase', () => {
  it('does not gate on drivingModeEnabled — every route flows through this model', () => {
    expect(getSignRunPhase(baseRoute({ drivingModeEnabled: false, status: 'in_progress' }), 5)).not.toBeNull();
    expect(getSignRunPhase(baseRoute({ drivingModeEnabled: null, status: 'in_progress' }), 5)).not.toBeNull();
  });

  it('returns null for completed or archived routes', () => {
    expect(getSignRunPhase(baseRoute({ status: 'completed' }), 5)).toBeNull();
    expect(getSignRunPhase(baseRoute({ status: 'archived' }), 5)).toBeNull();
  });

  it('defaults to Signs collected when executionPhase is unset', () => {
    const info = getSignRunPhase(baseRoute({ status: 'in_progress', executionPhase: null }), 5);
    expect(info?.phaseIdx).toBe(0);
    expect(info?.phase).toBe('signs_collected');
    expect(info?.phaseLabel).toBe('Signs collected');
    expect(info?.actionLabel).toBe('Collect signs');
    expect(info?.tint).toBe('indigo');
    expect(info?.track).toEqual(['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
    expect(info?.overallTrack).toEqual(['done', 'current', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
    expect(info?.phaseKicker).toBe('PHASE 1 OF 4 · SIGNS COLLECTED');
  });

  it('reads Signs placed as indigo, phase 2 of 4', () => {
    const info = getSignRunPhase(baseRoute({ status: 'in_progress', executionPhase: 'placement' }), 5);
    expect(info?.phaseIdx).toBe(1);
    expect(info?.phase).toBe('signs_placed');
    expect(info?.phaseLabel).toBe('Signs placed');
    expect(info?.phaseNumberLabel).toBe('Phase 2 of 4');
    expect(info?.actionLabel).toBe('Place signs');
    expect(info?.tint).toBe('indigo');
    expect(info?.track).toEqual(['done', 'current', 'upcoming', 'upcoming', 'upcoming']);
    expect(info?.overallTrack).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming', 'upcoming']);
    expect(info?.phaseKicker).toBe('PHASE 2 OF 4 · SIGNS PLACED');
  });

  it('reads Signs picked up as violet, phase 3 of 4', () => {
    const info = getSignRunPhase(baseRoute({ status: 'signs_placed', executionPhase: 'pickup' }), 5);
    expect(info?.phaseIdx).toBe(2);
    expect(info?.phase).toBe('signs_picked_up');
    expect(info?.phaseLabel).toBe('Signs picked up');
    expect(info?.actionLabel).toBe('Pick up signs');
    expect(info?.tint).toBe('violet');
    expect(info?.track).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming']);
    expect(info?.overallTrack).toEqual(['done', 'done', 'done', 'current', 'upcoming', 'upcoming']);
  });

  it('reads Signs returned as violet, phase 4 of 4', () => {
    const info = getSignRunPhase(baseRoute({ status: 'signs_picked_up', executionPhase: 'unload' }), 5);
    expect(info?.phaseIdx).toBe(3);
    expect(info?.phase).toBe('signs_returned');
    expect(info?.phaseLabel).toBe('Signs returned');
    expect(info?.actionLabel).toBe('Return signs');
    expect(info?.tint).toBe('violet');
    expect(info?.track).toEqual(['done', 'done', 'done', 'current', 'upcoming']);
    expect(info?.overallTrack).toEqual(['done', 'done', 'done', 'done', 'current', 'upcoming']);
  });

  it('surfaces ready-to-finalise once unload is confirmed but the route has not been finalised', () => {
    const info = getSignRunPhase(
      baseRoute({ status: 'in_progress', executionPhase: 'unload', unloadConfirmedAt: '2026-08-31T10:00:00.000Z' }),
      5
    );
    expect(info?.phaseIdx).toBe(4);
    expect(info?.phase).toBe('completed');
    expect(info?.phaseLabel).toBe('Ready to finalise');
    expect(info?.phaseNumberLabel).toBe('All four phases done');
    expect(info?.actionLabel).toBe('Finalise');
    expect(info?.tint).toBe('violet');
    expect(info?.track).toEqual(['done', 'done', 'done', 'done', 'current']);
    expect(info?.overallTrack).toEqual(['done', 'done', 'done', 'done', 'done', 'current']);
    expect(info?.phaseKicker).toBe('FINALISE');
  });

  it('does not treat unloadConfirmedAt as ready-to-finalise once the route is completed', () => {
    const info = getSignRunPhase(
      baseRoute({ status: 'completed', executionPhase: 'unload', unloadConfirmedAt: '2026-08-31T10:00:00.000Z' }),
      5
    );
    expect(info).toBeNull();
  });

  it('locks a planned route with no stops yet, with a note', () => {
    const info = getSignRunPhase(baseRoute({ status: 'planned' }), 0);
    expect(info?.isLocked).toBe(true);
    expect(info?.lockNote).toBe('Not released yet — planner is still adding stops');
  });

  it('does not lock a planned route once it has stops', () => {
    const info = getSignRunPhase(baseRoute({ status: 'planned' }), 3);
    expect(info?.isLocked).toBe(false);
    expect(info?.lockNote).toBeUndefined();
  });

  it('shows only Planned as current in the overview tracker while the route has not started', () => {
    const info = getSignRunPhase(baseRoute({ status: 'planned' }), 3);
    expect(info?.overallTrack).toEqual(['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  });

  describe('statusLabel', () => {
    it('shows "Today" for a route scheduled today', () => {
      const today = new Date().toISOString();
      const info = getSignRunPhase(baseRoute({ status: 'planned', scheduledDate: today }), 3);
      expect(info?.statusLabel).toBe('Today');
    });

    it('shows "Tomorrow" for a route scheduled tomorrow', () => {
      const tomorrow = new Date(Date.now() + 86400000).toISOString();
      const info = getSignRunPhase(baseRoute({ status: 'planned', scheduledDate: tomorrow }), 3);
      expect(info?.statusLabel).toBe('Tomorrow');
    });

    it('falls back to the current phase label for an in-progress route', () => {
      const info = getSignRunPhase(baseRoute({ status: 'in_progress', executionPhase: 'pickup' }), 3);
      expect(info?.statusLabel).toBe('Signs picked up');
    });
  });
});

describe('getRoutePhaseKey', () => {
  it('covers every route, including completed and archived — unlike getSignRunPhase', () => {
    expect(getRoutePhaseKey(baseRoute({ status: 'completed' }))).toBe('completed');
    expect(getRoutePhaseKey(baseRoute({ status: 'archived' }))).toBe('completed');
  });

  it('reads planned routes as planned, regardless of executionPhase', () => {
    expect(getRoutePhaseKey(baseRoute({ status: 'planned' }))).toBe('planned');
    expect(getRoutePhaseKey(baseRoute({ status: undefined }))).toBe('planned');
  });

  it('reads each in-progress sub-phase off executionPhase', () => {
    expect(getRoutePhaseKey(baseRoute({ status: 'in_progress', executionPhase: null }))).toBe('signs_collected');
    expect(getRoutePhaseKey(baseRoute({ status: 'in_progress', executionPhase: 'placement' }))).toBe('signs_placed');
    expect(getRoutePhaseKey(baseRoute({ status: 'in_progress', executionPhase: 'pickup' }))).toBe('signs_picked_up');
    expect(getRoutePhaseKey(baseRoute({ status: 'in_progress', executionPhase: 'unload' }))).toBe('signs_returned');
  });

  it('reads legacy signs_placed/signs_picked_up statuses off executionPhase too', () => {
    expect(getRoutePhaseKey(baseRoute({ status: 'signs_placed', executionPhase: 'pickup' }))).toBe('signs_picked_up');
    expect(getRoutePhaseKey(baseRoute({ status: 'signs_picked_up', executionPhase: 'unload' }))).toBe('signs_returned');
  });

  it('falls back to the status itself for pre-executionPhase legacy data', () => {
    // Oldest records predate the executionPhase field, so it's simply absent
    // — the legacy status is then the only record of which phase last completed.
    expect(getRoutePhaseKey(baseRoute({ status: 'in_progress' }))).toBe('signs_collected');
    expect(getRoutePhaseKey(baseRoute({ status: 'signs_placed' }))).toBe('signs_placed');
    expect(getRoutePhaseKey(baseRoute({ status: 'signs_picked_up' }))).toBe('signs_picked_up');
  });

  it('reads ready-to-finalise (unload confirmed, not yet finalised) as completed', () => {
    expect(
      getRoutePhaseKey(
        baseRoute({ status: 'in_progress', executionPhase: 'unload', unloadConfirmedAt: '2026-08-31T10:00:00.000Z' })
      )
    ).toBe('completed');
  });

  it('reads the last phase actually completed, not the phase executionPhase has already advanced to', () => {
    // Completing Pickup stamps pickupEndTime and flips executionPhase to
    // 'unload' in the same update, to unlock the Unload screen — the route
    // hasn't started returning signs yet, so the badge should still read
    // "Signs picked up" until unloadConfirmedAt is stamped.
    expect(
      getRoutePhaseKey(
        baseRoute({ status: 'in_progress', executionPhase: 'unload', pickupEndTime: '2026-09-12T10:00:00.000Z' })
      )
    ).toBe('signs_picked_up');
    expect(
      getRoutePhaseKey(
        baseRoute({ status: 'in_progress', executionPhase: 'pickup', placementEndTime: '2026-09-12T09:00:00.000Z' })
      )
    ).toBe('signs_placed');
    expect(
      getRoutePhaseKey(
        baseRoute({ status: 'in_progress', executionPhase: 'placement', loadConfirmedAt: '2026-09-12T08:00:00.000Z' })
      )
    ).toBe('signs_collected');
  });
});

describe('ROUTE_PHASE_KEYS / ROUTE_PHASE_LABELS', () => {
  it('lists all 6 phases in flow order, each with a label', () => {
    expect(ROUTE_PHASE_KEYS).toEqual([
      'planned',
      'signs_collected',
      'signs_placed',
      'signs_picked_up',
      'signs_returned',
      'completed',
    ]);
    ROUTE_PHASE_KEYS.forEach((key) => {
      expect(typeof ROUTE_PHASE_LABELS[key]).toBe('string');
    });
  });
});
