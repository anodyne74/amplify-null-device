const mockUpdateRoute = jest.fn();
const mockUpdateStopExecution = jest.fn();
const mockFetchAuthSession = jest.fn();
const mockCallApi = jest.fn();

jest.mock('@/lib/routes', () => ({
  updateRoute: (...args: unknown[]) => mockUpdateRoute(...args),
  updateStopExecution: (...args: unknown[]) => mockUpdateStopExecution(...args),
}));

jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: () => mockFetchAuthSession(),
}));

jest.mock('@/lib/apiClient', () => ({
  callApi: (...args: unknown[]) => mockCallApi(...args),
}));

import {
  planSignRunTransition,
  planStopSettlement,
  runSignRunTransition,
  runStopSettlement,
  stopPhaseOf,
  type SignRunTransition,
  type SignRunTransitionRoute,
  type StopSettlement,
} from '@/lib/signRunTransitions';
import { PICKUP_DONE_MARKER, PLACEMENT_DONE_MARKER, PLACEMENT_SKIPPED_MARKER } from '@/lib/stopExecutionMarkers';

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

describe('runSignRunTransition', () => {
  let consoleInfoSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
    mockFetchAuthSession.mockResolvedValue({});
    mockCallApi.mockResolvedValue({ ok: true });
    mockUpdateRoute.mockResolvedValue({ data: { id: 'r1' }, errors: undefined });
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
  });

  it('writes the planned patch and returns the route as it now stands', async () => {
    const route = { ...ROUTES.placement, routeCode: 'W25' };
    const result = await runSignRunTransition(route, { type: 'completePlacement', at: AT });

    expect(mockUpdateRoute).toHaveBeenCalledWith('r1', { executionPhase: 'pickup', placementEndTime: AT });
    expect(result).toEqual({ route: { ...route, executionPhase: 'pickup', placementEndTime: AT } });
  });

  it('checks the auth session before the mutation and logs the timing split (#266)', async () => {
    await runSignRunTransition(ROUTES.placement, { type: 'startPlacement', at: AT });

    expect(mockFetchAuthSession).toHaveBeenCalledTimes(1);
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[sign-run-timing\] route=r1 authCheckMs=\d+ mutationMs=\d+ totalMs=\d+$/)
    );
  });

  it.each(TRANSITIONS)('reports one timing record for $transition.type (#353)', async ({ transition, onPhase }) => {
    await runSignRunTransition(ROUTES[onPhase], transition);

    expect(mockCallApi).toHaveBeenCalledTimes(1);
    expect(mockCallApi).toHaveBeenCalledWith('/api/sign-run-timing', {
      kind: transition.type,
      routeId: 'r1',
      authCheckMs: expect.any(Number),
      mutationMs: expect.any(Number),
      confirmToSavedMs: expect.any(Number),
      retries: 0,
      outcome: 'saved',
    });
  });

  it('times the token check and the mutation separately', async () => {
    const nowSpy = jest.spyOn(performance, 'now');
    nowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(19000).mockReturnValueOnce(19250);

    await runSignRunTransition(ROUTES.placement, { type: 'startPlacement', at: AT });
    nowSpy.mockRestore();

    expect(mockCallApi.mock.calls[0][1]).toMatchObject({ authCheckMs: 18000, mutationMs: 250, confirmToSavedMs: 18250 });
  });

  it('reports a failed outcome for a write error and for a thrown write', async () => {
    mockUpdateRoute.mockResolvedValueOnce({ data: null, errors: [{ message: 'boom' }] });
    await runSignRunTransition(ROUTES.placement, { type: 'startPlacement', at: AT });
    mockUpdateRoute.mockRejectedValueOnce(new Error('network'));
    await runSignRunTransition(ROUTES.placement, { type: 'startPlacement', at: AT });

    expect(mockCallApi.mock.calls.map(([, record]) => record.outcome)).toEqual(['failed', 'failed']);
  });

  it('counts a token check that throws as all auth-check time', async () => {
    mockFetchAuthSession.mockRejectedValueOnce(new Error('network'));
    const nowSpy = jest.spyOn(performance, 'now');
    nowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(31000);

    const result = await runSignRunTransition(ROUTES.placement, { type: 'startPlacement', at: AT });
    nowSpy.mockRestore();

    expect(result).toEqual({ error: 'Could not start placement. Try again.' });
    expect(mockCallApi.mock.calls[0][1]).toMatchObject({
      authCheckMs: 30000,
      mutationMs: 0,
      confirmToSavedMs: 30000,
      outcome: 'failed',
    });
  });

  it('is not held up or failed by a timing report that hangs or fails', async () => {
    mockCallApi.mockReturnValueOnce(new Promise(() => undefined));
    expect(await runSignRunTransition(ROUTES.placement, { type: 'startPlacement', at: AT })).toEqual({
      route: { ...ROUTES.placement, placementStartTime: AT },
    });

    mockCallApi.mockRejectedValueOnce(new Error('offline'));
    expect(await runSignRunTransition(ROUTES.pickup, { type: 'startPickup', at: AT })).toEqual({
      route: { ...ROUTES.pickup, pickupStartTime: AT },
    });

    mockCallApi.mockImplementationOnce(() => {
      throw new Error('sync throw');
    });
    expect(await runSignRunTransition(ROUTES.unload, { type: 'startUnload', at: AT })).toEqual({
      route: { ...ROUTES.unload, unloadStartedAt: AT },
    });
  });

  it('reports nothing for a refused transition', async () => {
    await runSignRunTransition(ROUTES.pickup, { type: 'startPlacement', at: AT });

    expect(mockCallApi).not.toHaveBeenCalled();
  });

  it('writes nothing for a refused transition', async () => {
    const result = await runSignRunTransition(ROUTES.pickup, { type: 'startPlacement', at: AT });

    expect(result).toEqual({ error: 'This route is not currently on the Placement phase.' });
    expect(mockFetchAuthSession).not.toHaveBeenCalled();
    expect(mockUpdateRoute).not.toHaveBeenCalled();
  });

  it.each<[SignRunTransition, string]>([
    [{ type: 'startLoad', at: AT }, 'Could not start the load. Try again.'],
    [{ type: 'confirmLoad', at: AT, loadedSignsCount: 1 }, 'Could not confirm the load. Try again.'],
  ])('reports a write error for %o', async (transition, message) => {
    mockUpdateRoute.mockResolvedValue({ data: null, errors: [{ message: 'boom' }] });
    expect(await runSignRunTransition(ROUTES.load, transition)).toEqual({ error: message });
  });

  it('reports a thrown write as an error', async () => {
    mockUpdateRoute.mockRejectedValue(new Error('network'));
    expect(await runSignRunTransition(ROUTES.pickup, { type: 'completePickup', at: AT })).toEqual({
      error: 'Could not close out pickup. Try again.',
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
    expect(patch.notes).toContain(PLACEMENT_DONE_MARKER);
  });

  it('keeps an earlier arrival time', () => {
    const patch = planStopSettlement(
      { notes: null, actualArrivalTime: '2026-09-26T08:00:00.000Z' },
      { phase: 'pickup', action: 'complete' },
      AT
    );
    expect(patch.actualArrivalTime).toBe('2026-09-26T08:00:00.000Z');
    expect(patch.notes).toContain(PICKUP_DONE_MARKER);
  });

  it('completing a previously skipped stop clears the skip marker, keeping other notes', () => {
    const skipped = planStopSettlement(
      { notes: 'Gate code 1234', actualArrivalTime: null },
      { phase: 'placement', action: 'skip', reason: 'Road closed' },
      AT
    );
    expect(skipped.notes).toContain(PLACEMENT_SKIPPED_MARKER);

    const completed = planStopSettlement(
      { notes: skipped.notes, actualArrivalTime: skipped.actualArrivalTime },
      { phase: 'placement', action: 'complete' },
      AT
    );
    expect(completed.notes).toContain(PLACEMENT_DONE_MARKER);
    expect(completed.notes).not.toContain(PLACEMENT_SKIPPED_MARKER);
    expect(completed.notes).toContain('Gate code 1234');
  });
});

describe('runStopSettlement', () => {
  const stop = { id: 's1', routeId: 'r1', notes: null, actualArrivalTime: null };
  let consoleInfoSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
    mockFetchAuthSession.mockResolvedValue({});
    mockCallApi.mockResolvedValue({ ok: true });
    mockUpdateStopExecution.mockResolvedValue({ data: { id: 's1' }, errors: undefined });
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
  });

  it.each<[StopSettlement, string]>([
    [{ phase: 'placement', action: 'complete' }, 'placementStopDone'],
    [{ phase: 'placement', action: 'skip' }, 'placementStopSkipped'],
    [{ phase: 'pickup', action: 'complete' }, 'pickupStopDone'],
    [{ phase: 'pickup', action: 'skip', reason: 'Gate locked' }, 'pickupStopSkipped'],
  ])('reports one timing record for %o as %s (#353)', async (settlement, kind) => {
    await runStopSettlement(stop, settlement);

    expect(mockFetchAuthSession).toHaveBeenCalledTimes(1);
    expect(mockCallApi).toHaveBeenCalledTimes(1);
    expect(mockCallApi).toHaveBeenCalledWith('/api/sign-run-timing', {
      kind,
      routeId: 'r1',
      authCheckMs: expect.any(Number),
      mutationMs: expect.any(Number),
      confirmToSavedMs: expect.any(Number),
      retries: 0,
      outcome: 'saved',
    });
  });

  it('reports a failed settlement, and is not failed by a timing report that fails', async () => {
    mockUpdateStopExecution.mockResolvedValueOnce({ data: null, errors: [{ message: 'boom' }] });
    mockCallApi.mockRejectedValueOnce(new Error('offline'));

    expect(await runStopSettlement(stop, { phase: 'pickup', action: 'complete' })).toEqual({
      error: 'Could not save that stop. Try again.',
    });
    expect(mockCallApi.mock.calls[0][1]).toMatchObject({ outcome: 'failed' });
  });

  it('is not held up by a timing report that hangs', async () => {
    mockCallApi.mockReturnValueOnce(new Promise(() => undefined));

    const result = await runStopSettlement(stop, { phase: 'placement', action: 'complete' });
    expect('patch' in result).toBe(true);
  });

  it('writes the settlement and returns the patch', async () => {
    const result = await runStopSettlement(stop, { phase: 'pickup', action: 'complete' });

    expect('patch' in result && result.patch.notes).toContain(PICKUP_DONE_MARKER);
    expect(mockUpdateStopExecution).toHaveBeenCalledWith('s1', 'patch' in result ? result.patch : undefined);
  });

  it('reports a write error', async () => {
    mockUpdateStopExecution.mockResolvedValue({ data: null, errors: [{ message: 'boom' }] });
    expect(await runStopSettlement(stop, { phase: 'pickup', action: 'skip' })).toEqual({
      error: 'Could not save that stop. Try again.',
    });
  });

  it('reports a thrown write as an error', async () => {
    mockUpdateStopExecution.mockRejectedValue(new Error('network'));
    expect(await runStopSettlement(stop, { phase: 'placement', action: 'complete' })).toEqual({
      error: 'Could not save that stop. Try again.',
    });
  });
});
