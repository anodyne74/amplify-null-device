const mockEnqueue = jest.fn();
jest.mock('@/lib/signRunOutbox', () => ({
  signRunOutbox: { enqueue: (...args: unknown[]) => mockEnqueue(...args) },
}));

import {
  planSignRunTransition,
  planStopSettlement,
  queueSignRunTransition,
  queueStopChange,
  queueStopSettlement,
  stopPhaseOf,
  type SignRunTransition,
  type SignRunTransitionRoute,
  type StopSettlement,
} from '@/lib/signRunTransitions';
import { stopProgress } from '@/lib/stopProgress';

const AT = '2026-09-26T09:00:00.000Z';

const ROUTES: Record<string, SignRunTransitionRoute> = {
  load: { id: 'r1', status: 'planned' },
  placement: { id: 'r1', status: 'in_progress', executionPhase: 'placement', loadConfirmedAt: AT },
  pickup: { id: 'r1', status: 'in_progress', executionPhase: 'pickup', placementEndTime: AT },
  unload: { id: 'r1', status: 'in_progress', executionPhase: 'unload', pickupEndTime: AT },
  finalise: { id: 'r1', status: 'in_progress', executionPhase: 'unload', unloadConfirmedAt: AT },
  completed: { id: 'r1', status: 'completed', unloadConfirmedAt: AT },
};

const TRANSITIONS: Array<{ transition: SignRunTransition; onPhase: string; patch: object }> = [
  {
    transition: { type: 'startLoad', at: AT },
    onPhase: 'load',
    patch: { loadStartedAt: AT, actualStartTime: AT },
  },
  {
    transition: { type: 'confirmLoad', at: AT, loadedSignsCount: 12 },
    onPhase: 'load',
    patch: { loadConfirmedAt: AT, loadedSignsCount: 12, executionPhase: 'placement', status: 'in_progress' },
  },
  {
    transition: { type: 'startPlacement', at: AT },
    onPhase: 'placement',
    patch: { placementStartTime: AT },
  },
  {
    transition: { type: 'completePlacement', at: AT },
    onPhase: 'placement',
    patch: { executionPhase: 'pickup', placementEndTime: AT },
  },
  {
    transition: { type: 'startPickup', at: AT },
    onPhase: 'pickup',
    patch: { pickupStartTime: AT },
  },
  {
    transition: { type: 'completePickup', at: AT },
    onPhase: 'pickup',
    patch: { executionPhase: 'unload', pickupEndTime: AT },
  },
  {
    transition: { type: 'startUnload', at: AT },
    onPhase: 'unload',
    patch: { unloadStartedAt: AT },
  },
  {
    transition: { type: 'confirmUnload', at: AT },
    onPhase: 'unload',
    patch: { unloadConfirmedAt: AT, actualEndTime: AT },
  },
  {
    transition: { type: 'finalise', billedMinutes: { load: 15, placement: 60, pickup: 45, unload: 15 }, distanceKm: 42.5 },
    onPhase: 'finalise',
    patch: {
      billedLoadMinutes: 15,
      billedPlacementMinutes: 60,
      billedPickupMinutes: 45,
      billedUnloadMinutes: 15,
      overrideDurationMinutes: 135,
      overrideDistanceKm: 42.5,
      status: 'completed',
    },
  },
];

const PHASE_LABEL: Record<string, string> = {
  load: 'Load',
  placement: 'Placement',
  pickup: 'Pickup',
  unload: 'Unload',
  finalise: 'Finalise',
};

describe('planSignRunTransition', () => {
  describe.each(TRANSITIONS)('$transition.type', ({ transition, onPhase, patch }) => {
    it.each(Object.keys(ROUTES))('from a %s route', (phase) => {
      const plan = planSignRunTransition(ROUTES[phase], transition);

      if (phase === onPhase) {
        expect(plan).toEqual({ patch });
      } else if (phase === 'completed') {
        expect(plan).toEqual({ refused: 'This route is already completed.' });
      } else {
        expect(plan).toEqual({
          refused: `This route is not currently on the ${PHASE_LABEL[onPhase]} phase.`,
        });
      }
    });
  });

  it('keeps an already-recorded actual start time when the load starts', () => {
    const route = { ...ROUTES.load, actualStartTime: '2026-09-26T07:00:00.000Z' };
    expect(planSignRunTransition(route, { type: 'startLoad', at: AT })).toEqual({
      patch: { loadStartedAt: AT, actualStartTime: '2026-09-26T07:00:00.000Z' },
    });
  });

  it('keeps an already-recorded actual end time when the unload is confirmed', () => {
    const route = { ...ROUTES.unload, actualEndTime: '2026-09-26T15:00:00.000Z' };
    expect(planSignRunTransition(route, { type: 'confirmUnload', at: AT })).toEqual({
      patch: { unloadConfirmedAt: AT, actualEndTime: '2026-09-26T15:00:00.000Z' },
    });
  });

  it('keeps an in_progress status when confirming a load already under way', () => {
    const route: SignRunTransitionRoute = { id: 'r1', status: 'in_progress', executionPhase: 'load' };
    expect(planSignRunTransition(route, { type: 'confirmLoad', at: AT, loadedSignsCount: 3 })).toEqual({
      patch: { loadConfirmedAt: AT, loadedSignsCount: 3, executionPhase: 'placement', status: 'in_progress' },
    });
  });
});

describe('queueSignRunTransition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queues the planned patch and returns the route as it now shows', () => {
    const route = { ...ROUTES.placement, routeCode: 'W25' };
    const result = queueSignRunTransition(route, { type: 'completePlacement', at: AT });

    expect(result).toEqual({ route: { ...route, executionPhase: 'pickup', placementEndTime: AT } });
    expect(mockEnqueue).toHaveBeenCalledWith({
      routeId: 'r1',
      target: 'Route',
      recordId: 'r1',
      kind: 'completePlacement',
      patch: { executionPhase: 'pickup', placementEndTime: AT },
    });
  });

  it.each(TRANSITIONS)('queues $transition.type under its own kind', ({ transition, onPhase }) => {
    queueSignRunTransition(ROUTES[onPhase], transition);

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue.mock.calls[0][0]).toMatchObject({ kind: transition.type, target: 'Route' });
  });

  it('queues nothing for a refused transition', () => {
    const result = queueSignRunTransition(ROUTES.pickup, { type: 'startPlacement', at: AT });

    expect(result).toEqual({ error: 'This route is not currently on the Placement phase.' });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

describe('queueStopSettlement', () => {
  const stop = { id: 's1', routeId: 'r1', notes: null, actualArrivalTime: null };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each<[StopSettlement, string]>([
    [{ phase: 'placement', action: 'complete' }, 'placementStopDone'],
    [{ phase: 'pickup', action: 'complete' }, 'pickupStopDone'],
    [{ phase: 'pickup', action: 'couldntCollect', reason: 'Gate locked' }, 'pickupStopCouldntCollect'],
  ])('queues %o on the Stop as %s', (settlement, kind) => {
    const { patch } = queueStopSettlement(stop, settlement);

    expect(mockEnqueue).toHaveBeenCalledWith({ routeId: 'r1', target: 'Stop', recordId: 's1', kind, patch });
  });
});

describe('queueStopChange', () => {
  const loading = { id: 'r1', customerId: 'c1', status: 'planned' as const, loadStartedAt: AT };
  const stop = { id: 's1', removed: null, address: '8 Lygon St, Carlton', propertyKey: 'carlton|3053|lygon st|8' };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('queues a removal on the Stop, with its audit entry', () => {
    expect(queueStopChange(loading, { type: 'remove', stop, by: 'operator-1' })).toEqual({ ok: true });

    expect(mockEnqueue).toHaveBeenCalledWith({
      routeId: 'r1',
      target: 'Stop',
      recordId: 's1',
      kind: 'loadStopRemoved',
      patch: { removed: true, removedAt: expect.any(String), removedBy: 'operator-1' },
      audit: {
        customerId: 'c1',
        resourceId: 's1',
        action: 'stop.loadChange.remove',
        details: { routeId: 'r1', address: '8 Lygon St, Carlton', propertyKey: 'carlton|3053|lygon st|8' },
      },
    });
  });

  it('queues a restore', () => {
    queueStopChange(loading, { type: 'restore', stop: { ...stop, removed: true } });

    expect(mockEnqueue.mock.calls[0][0]).toMatchObject({
      target: 'Stop',
      kind: 'loadStopRestored',
      patch: { removed: false },
      audit: { action: 'stop.loadChange.restore' },
    });
  });

  it('queues an added Stop as a new record under a fresh id', () => {
    const input = { address: '30 Faraday St, Carlton', agent: 'Lena Park', numberOfSigns: 2, isAuction: true };
    queueStopChange(loading, { type: 'add', stops: [{ sequence: 1 }], input });

    expect(mockEnqueue).toHaveBeenCalledWith({
      routeId: 'r1',
      target: 'NewStop',
      recordId: '00000000-0000-4000-8000-000000000001',
      kind: 'loadStopAdded',
      patch: {
        routeId: 'r1',
        customerId: 'c1',
        sequence: 2,
        address: '30 Faraday St, Carlton',
        agent: 'Lena Park',
        numberOfSigns: 2,
        isAuction: true,
        addedAtLoad: expect.any(String),
      },
      audit: {
        customerId: 'c1',
        resourceId: '00000000-0000-4000-8000-000000000001',
        action: 'stop.loadChange.add',
        details: { routeId: 'r1', address: '30 Faraday St, Carlton', agent: 'Lena Park', numberOfSigns: 2, isAuction: true },
      },
    });
  });

  it('queues nothing for a refused change', () => {
    const pickingUp = { ...loading, status: 'in_progress' as const, executionPhase: 'pickup' as const, loadConfirmedAt: AT };
    expect(queueStopChange(pickingUp, { type: 'remove', stop, by: 'operator-1', reason: 'No access' })).toEqual({
      error: 'Stops can only be removed during Load or Placement.',
    });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  describe('at the door during Placement', () => {
    const placing = { ...loading, status: 'in_progress' as const, executionPhase: 'placement' as const, loadConfirmedAt: AT };

    it('queues the removal with its reason, audited as a plain removal', () => {
      queueStopChange(placing, { type: 'remove', stop, by: 'operator-1', reason: 'Gate locked / no access' });

      expect(mockEnqueue).toHaveBeenCalledWith({
        routeId: 'r1',
        target: 'Stop',
        recordId: 's1',
        kind: 'placementStopRemoved',
        patch: { removed: true, removedAt: expect.any(String), removedBy: 'operator-1', removedReason: 'Gate locked / no access' },
        audit: {
          customerId: 'c1',
          resourceId: 's1',
          action: 'stop.remove',
          details: {
            routeId: 'r1',
            address: '8 Lygon St, Carlton',
            propertyKey: 'carlton|3053|lygon st|8',
            reason: 'Gate locked / no access',
          },
        },
      });
    });

    it('refuses a removal with no reason', () => {
      expect(queueStopChange(placing, { type: 'remove', stop, by: 'operator-1' })).toEqual({
        error: 'Say why the signs can’t go up.',
      });
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('queues a restore of a Stop removed at the door', () => {
      queueStopChange(placing, { type: 'restore', stop: { ...stop, removed: true, removedReason: 'No access' } });

      expect(mockEnqueue.mock.calls[0][0]).toMatchObject({
        kind: 'placementStopRestored',
        patch: { removed: false },
        audit: { action: 'stop.restore' },
      });
    });
  });
});

describe('stopPhaseOf', () => {
  it.each<[Parameters<typeof stopPhaseOf>[0], ReturnType<typeof stopPhaseOf>]>([
    [{ status: 'planned' }, null],
    [{ status: 'in_progress', executionPhase: 'load' }, null],
    [{ status: 'in_progress', executionPhase: 'placement' }, 'placement'],
    [{ status: 'in_progress', executionPhase: 'pickup' }, 'pickup'],
    [{ status: 'in_progress', executionPhase: 'unload' }, null],
    [{ status: 'signs_placed' }, 'pickup'],
    [{ status: 'completed', executionPhase: 'pickup' }, null],
  ])('%o -> %s', (route, expected) => {
    expect(stopPhaseOf(route)).toBe(expected);
  });
});

describe('planStopSettlement', () => {
  it('marks the stop done and stamps arrival/departure', () => {
    const patch = planStopSettlement({ notes: null, actualArrivalTime: null }, { phase: 'placement', action: 'complete' }, AT);

    expect(patch.actualArrivalTime).toBe(AT);
    expect(patch.actualDepartureTime).toBe(AT);
    expect(stopProgress(patch).placement.state).toBe('done');
  });

  it('keeps an earlier arrival time', () => {
    const patch = planStopSettlement(
      { notes: null, actualArrivalTime: '2026-09-26T08:00:00.000Z' },
      { phase: 'pickup', action: 'complete' },
      AT
    );
    expect(patch.actualArrivalTime).toBe('2026-09-26T08:00:00.000Z');
    expect(stopProgress(patch).pickup.state).toBe('done');
  });

  it("collecting a Couldn't Collect stop clears its reason, keeping other notes", () => {
    const couldnt = planStopSettlement(
      { notes: 'Gate code 1234', actualArrivalTime: null },
      { phase: 'pickup', action: 'couldntCollect', reason: 'Access blocked' },
      AT
    );
    expect(stopProgress(couldnt).pickup).toMatchObject({ state: 'couldntCollect', reason: 'Access blocked' });

    const completed = planStopSettlement(
      { notes: couldnt.notes, actualArrivalTime: couldnt.actualArrivalTime },
      { phase: 'pickup', action: 'complete' },
      AT
    );
    expect(stopProgress(completed).pickup).toMatchObject({ state: 'done', reason: null });
    expect(completed.notes).toContain('Gate code 1234');
  });
});
