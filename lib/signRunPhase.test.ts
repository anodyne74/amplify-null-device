import { getSignRunPhase } from './signRunPhase';
import type { Route } from '@/amplify/types';

function baseRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: 'route-1',
    customerId: 'cust-1',
    status: 'planned',
    drivingModeEnabled: true,
    ...overrides,
  } as Route;
}

describe('getSignRunPhase', () => {
  it('returns null when drivingModeEnabled is not set', () => {
    expect(getSignRunPhase(baseRoute({ drivingModeEnabled: false }), 5)).toBeNull();
    expect(getSignRunPhase(baseRoute({ drivingModeEnabled: null }), 5)).toBeNull();
  });

  it('returns null for completed or archived routes', () => {
    expect(getSignRunPhase(baseRoute({ status: 'completed' }), 5)).toBeNull();
    expect(getSignRunPhase(baseRoute({ status: 'archived' }), 5)).toBeNull();
  });

  it('defaults to Load when executionPhase is unset', () => {
    const info = getSignRunPhase(baseRoute({ status: 'in_progress', executionPhase: null }), 5);
    expect(info?.phaseIdx).toBe(0);
    expect(info?.phaseLabel).toBe('Load');
    expect(info?.actionLabel).toBe('Load signs');
    expect(info?.tint).toBe('indigo');
    expect(info?.track).toEqual(['current', 'upcoming', 'upcoming', 'upcoming']);
  });

  it('reads Placement as indigo, phase 2 of 4', () => {
    const info = getSignRunPhase(baseRoute({ status: 'in_progress', executionPhase: 'placement' }), 5);
    expect(info?.phaseIdx).toBe(1);
    expect(info?.phaseLabel).toBe('Placement');
    expect(info?.phaseNumberLabel).toBe('Phase 2 of 4');
    expect(info?.actionLabel).toBe('Place signs');
    expect(info?.tint).toBe('indigo');
    expect(info?.track).toEqual(['done', 'current', 'upcoming', 'upcoming']);
  });

  it('reads Pickup as violet, phase 3 of 4', () => {
    const info = getSignRunPhase(baseRoute({ status: 'signs_placed', executionPhase: 'pickup' }), 5);
    expect(info?.phaseIdx).toBe(2);
    expect(info?.phaseLabel).toBe('Pickup');
    expect(info?.actionLabel).toBe('Pick up signs');
    expect(info?.tint).toBe('violet');
    expect(info?.track).toEqual(['done', 'done', 'current', 'upcoming']);
  });

  it('reads Unload as violet, phase 4 of 4', () => {
    const info = getSignRunPhase(baseRoute({ status: 'signs_picked_up', executionPhase: 'unload' }), 5);
    expect(info?.phaseIdx).toBe(3);
    expect(info?.phaseLabel).toBe('Unload');
    expect(info?.actionLabel).toBe('Return signs');
    expect(info?.tint).toBe('violet');
    expect(info?.track).toEqual(['done', 'done', 'done', 'current']);
  });

  it('surfaces ready-to-finalise once unload is confirmed but the route has not been finalised', () => {
    const info = getSignRunPhase(
      baseRoute({ status: 'in_progress', executionPhase: 'unload', unloadConfirmedAt: '2026-08-31T10:00:00.000Z' }),
      5
    );
    expect(info?.phaseIdx).toBe(4);
    expect(info?.phaseLabel).toBe('Ready to finalise');
    expect(info?.phaseNumberLabel).toBe('All four phases done');
    expect(info?.actionLabel).toBe('Finalise');
    expect(info?.tint).toBe('violet');
    expect(info?.track).toEqual(['done', 'done', 'done', 'done']);
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
      expect(info?.statusLabel).toBe('Pickup');
    });
  });
});
