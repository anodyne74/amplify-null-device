jest.mock('aws-amplify/auth', () => ({ fetchAuthSession: jest.fn() }));
jest.mock('@/lib/routes', () => ({ updateRoute: jest.fn(), updateStopExecution: jest.fn() }));
jest.mock('@/lib/apiClient', () => ({ callApi: jest.fn() }));
jest.mock('@/lib/useSessionRefresh', () => ({ refreshSessionIfStale: jest.fn() }));

import {
  ATTEMPT_TIMEOUT_MS,
  DISCARD_REPORT_WAIT_MS,
  HOLD_AFTER_MS,
  backoffMs,
  createSignRunOutbox,
  isServerRejection,
  overlayRoute,
  overlayStops,
  type OutboxDeps,
  type OutboxEntry,
  type WriteResult,
} from '@/lib/signRunOutbox';

const NOW = new Date('2026-09-30T09:00:00.000Z').getTime();
const OWNER = 'operator-sub';
const STORAGE_KEY = `nd.signRunOutbox.${OWNER}`;

interface Deferred {
  resolve: (result: WriteResult) => void;
  reject: (error: unknown) => void;
}

/** A write whose answer the test gives, in the order the writes were sent. */
function controlledWrites() {
  const calls: { id: string; patch: Record<string, unknown>; answer: Deferred }[] = [];
  const write = jest.fn(
    (id: string, patch: Record<string, unknown>) =>
      new Promise<WriteResult>((resolve, reject) => {
        calls.push({ id, patch, answer: { resolve, reject } });
      })
  );
  return { write, calls };
}

function memoryStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

function setup(overrides: Partial<OutboxDeps> = {}) {
  let now = NOW;
  const routes = controlledWrites();
  const stops = controlledWrites();
  const newStops = controlledWrites();
  const audit = jest.fn().mockResolvedValue(undefined);
  const storage = memoryStorage();
  const report = jest.fn().mockResolvedValue(undefined);
  const refreshSession = jest.fn().mockResolvedValue(undefined);
  const deps: OutboxDeps = {
    storage,
    writeRoute: routes.write,
    writeStop: stops.write,
    createStop: newStops.write,
    audit,
    checkAuth: jest.fn().mockResolvedValue({}),
    refreshSession,
    report,
    now: () => now,
    ...overrides,
  };
  const outbox = createSignRunOutbox(deps);
  return {
    outbox,
    routes,
    stops,
    newStops,
    audit,
    storage,
    report,
    refreshSession,
    advanceClock: (ms: number) => {
      now += ms;
    },
  };
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

const saved = (updatedAt = '2026-09-30T09:00:05.000Z'): WriteResult => ({ data: { updatedAt }, errors: undefined });
const networkError = (): WriteResult => ({ data: null, errors: [{ message: 'Network error' }] });
const rejected = (): WriteResult => ({
  data: null,
  errors: [{ errorType: 'Unauthorized', message: 'Not Authorized to access updateRoute on type Mutation' }],
});

function routeWrite(routeId: string, patch: Record<string, unknown>) {
  return { routeId, target: 'Route' as const, recordId: routeId, kind: 'startPlacement' as const, patch };
}

function stopWrite(routeId: string, stopId: string, patch: Record<string, unknown>) {
  return { routeId, target: 'Stop' as const, recordId: stopId, kind: 'placementStopDone' as const, patch };
}

describe('isServerRejection', () => {
  it.each([
    ['an authorization error', [{ errorType: 'Unauthorized' }], true],
    ['a validation error', [{ errorType: 'DynamoDB:ConditionalCheckFailedException' }], true],
    ['no errorType (no answer)', [{ message: 'Network error' }], false],
    ['an expired token', [{ errorType: 'UnauthorizedException' }], false],
    ['throttling', [{ errorType: 'ThrottlingException' }], false],
    ['a service outage', [{ errorType: 'ServiceUnavailable' }], false],
    ['a thrown error', [new Error('Failed to fetch')], false],
  ])('%s → %s', (_label, errors, expected) => {
    expect(isServerRejection(errors)).toBe(expected);
  });
});

describe('backoffMs', () => {
  it('doubles from 1s and caps at 30s', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(backoffMs)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });
});

describe('createSignRunOutbox', () => {
  beforeEach(() => {
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('shows a write on screen as soon as it is queued, before it saves', () => {
    const { outbox } = setup();

    outbox.enqueue(routeWrite('r1', { executionPhase: 'pickup' }));

    const route = overlayRoute({ id: 'r1', executionPhase: 'placement', updatedAt: 'a' }, outbox.getSnapshot());
    expect(route.executionPhase).toBe('pickup');
    expect(outbox.getSnapshot().entries).toHaveLength(1);
  });

  it("sends one Route's writes in tap order, each only once the one before has saved", async () => {
    const { outbox, routes, stops } = setup();

    outbox.enqueue(routeWrite('r1', { placementStartTime: 'T1' }));
    outbox.enqueue(stopWrite('r1', 's1', { notes: 'done' }));
    outbox.enqueue(routeWrite('r1', { placementEndTime: 'T2' }));
    await flush();

    expect(routes.calls.map((call) => call.patch)).toEqual([{ placementStartTime: 'T1' }]);
    expect(stops.calls).toHaveLength(0);

    routes.calls[0].answer.resolve(saved());
    await flush();
    expect(stops.calls.map((call) => [call.id, call.patch])).toEqual([['s1', { notes: 'done' }]]);
    expect(routes.calls).toHaveLength(1);

    stops.calls[0].answer.resolve(saved());
    await flush();
    expect(routes.calls.map((call) => call.patch)).toEqual([{ placementStartTime: 'T1' }, { placementEndTime: 'T2' }]);

    routes.calls[1].answer.resolve(saved());
    await flush();
    expect(outbox.getSnapshot().entries).toHaveLength(0);
  });

  it('tells afterSaved about each write once it has saved, and only then (#468)', async () => {
    const afterSaved = jest.fn();
    const { outbox, routes } = setup({ afterSaved });
    outbox.enqueue({ ...routeWrite('r1', { status: 'completed' }), kind: 'finalise' });
    await flush();
    expect(afterSaved).not.toHaveBeenCalled();

    routes.calls[0].answer.resolve(rejected());
    await flush();
    expect(afterSaved).not.toHaveBeenCalled();

    outbox.resend('r1');
    await flush();
    routes.calls[1].answer.resolve(saved());
    await flush();
    expect(afterSaved).toHaveBeenCalledTimes(1);
    expect(afterSaved).toHaveBeenCalledWith(expect.objectContaining({ routeId: 'r1', kind: 'finalise' }));
  });

  it('carries on sending when afterSaved throws (#468)', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { outbox, routes } = setup({
      afterSaved: () => {
        throw new Error('boom');
      },
    });
    outbox.enqueue(routeWrite('r1', { placementStartTime: 'T1' }));
    outbox.enqueue(routeWrite('r1', { placementEndTime: 'T2' }));
    await flush();
    routes.calls[0].answer.resolve(saved());
    await flush();

    expect(routes.calls.map((call) => call.patch)).toEqual([{ placementStartTime: 'T1' }, { placementEndTime: 'T2' }]);
  });

  it("doesn't hold one Route's writes behind another's", async () => {
    const { outbox, routes } = setup();

    outbox.enqueue(routeWrite('r1', { placementStartTime: 'T1' }));
    outbox.enqueue(routeWrite('r2', { pickupStartTime: 'T2' }));
    await flush();

    expect(routes.calls.map((call) => call.id)).toEqual(['r1', 'r2']);
    routes.calls[1].answer.resolve(saved());
    await flush();

    expect(outbox.getSnapshot().entries.map((entry) => entry.routeId)).toEqual(['r1']);
  });

  it('retries network trouble with backoff, keeping the write on screen', async () => {
    jest.useFakeTimers({ now: NOW });
    const { outbox, routes } = setup();

    outbox.enqueue(routeWrite('r1', { executionPhase: 'pickup' }));
    await flush();
    routes.calls[0].answer.resolve(networkError());
    await flush();

    expect(outbox.getSnapshot().entries[0]).toMatchObject({ state: 'pending', attempts: 1 });
    expect(overlayRoute({ id: 'r1', executionPhase: 'placement' }, outbox.getSnapshot()).executionPhase).toBe('pickup');

    jest.advanceTimersByTime(999);
    await flush();
    expect(routes.calls).toHaveLength(1);

    jest.advanceTimersByTime(1);
    await flush();
    expect(routes.calls).toHaveLength(2);

    routes.calls[1].answer.reject(new Error('Failed to fetch'));
    await flush();
    jest.advanceTimersByTime(2000);
    await flush();
    expect(routes.calls).toHaveLength(3);

    routes.calls[2].answer.resolve(saved());
    await flush();
    expect(outbox.getSnapshot().entries).toHaveLength(0);
  });

  it('treats an attempt with no answer as network trouble', async () => {
    jest.useFakeTimers({ now: NOW });
    const { outbox, routes } = setup();

    outbox.enqueue(routeWrite('r1', { executionPhase: 'pickup' }));
    await flush();
    jest.advanceTimersByTime(ATTEMPT_TIMEOUT_MS);
    await flush();
    jest.advanceTimersByTime(backoffMs(1));
    await flush();

    expect(routes.calls).toHaveLength(2);
    expect(outbox.getSnapshot().entries[0]).toMatchObject({ state: 'pending', attempts: 2 });
  });

  it('resends straight away on retryNow, after refreshing the session', async () => {
    jest.useFakeTimers({ now: NOW });
    const { outbox, routes, refreshSession } = setup();

    outbox.enqueue(routeWrite('r1', { executionPhase: 'pickup' }));
    await flush();
    routes.calls[0].answer.resolve(networkError());
    await flush();

    await outbox.retryNow();
    await flush();

    expect(refreshSession).toHaveBeenCalled();
    expect(routes.calls).toHaveLength(2);
    // The backoff timer was replaced, not left to send a third time.
    jest.advanceTimersByTime(MAX_WAIT);
    await flush();
    expect(routes.calls).toHaveLength(2);
  });

  it('stops a Route on a rejection and undoes that write and every later one on screen', async () => {
    const { outbox, routes } = setup();

    outbox.enqueue(routeWrite('r1', { placementStartTime: 'T1' }));
    outbox.enqueue(routeWrite('r1', { executionPhase: 'pickup', placementEndTime: 'T2' }));
    outbox.enqueue(stopWrite('r1', 's1', { notes: 'done' }));
    outbox.enqueue(routeWrite('r2', { pickupStartTime: 'T3' }));
    await flush();

    const r1Calls = () => routes.calls.filter((call) => call.id === 'r1');
    r1Calls()[0].answer.resolve(saved('v2'));
    await flush();
    r1Calls()[1].answer.resolve(rejected());
    await flush();

    const snapshot = outbox.getSnapshot();
    expect(snapshot.entries.filter((entry) => entry.state === 'rejected')).toHaveLength(1);
    // The saved write still shows; the refused one and the stop after it don't.
    const route = overlayRoute({ id: 'r1', executionPhase: 'placement', updatedAt: 'v1' }, snapshot);
    expect(route).toMatchObject({ placementStartTime: 'T1', executionPhase: 'placement' });
    expect(route).not.toHaveProperty('placementEndTime');
    expect(overlayStops([{ id: 's1', notes: null }], snapshot)[0].notes).toBeNull();
    // Other Routes carry on.
    expect(overlayRoute({ id: 'r2' }, snapshot)).toMatchObject({ pickupStartTime: 'T3' });
    // Nothing more is sent for r1.
    expect(r1Calls()).toHaveLength(2);
  });

  it('Try again resends a stopped Route in order', async () => {
    const { outbox, routes, stops } = setup();

    outbox.enqueue(routeWrite('r1', { executionPhase: 'pickup' }));
    outbox.enqueue(stopWrite('r1', 's1', { notes: 'done' }));
    await flush();
    routes.calls[0].answer.resolve(rejected());
    await flush();

    outbox.resend('r1');
    await flush();
    expect(routes.calls).toHaveLength(2);
    expect(overlayRoute({ id: 'r1' }, outbox.getSnapshot())).toMatchObject({ executionPhase: 'pickup' });
    expect(stops.calls).toHaveLength(0);

    routes.calls[1].answer.resolve(saved());
    await flush();
    expect(stops.calls).toHaveLength(1);
  });

  it('Discard drops a stopped Route and records each write as discarded', async () => {
    const { outbox, routes, report } = setup();

    outbox.enqueue(routeWrite('r1', { executionPhase: 'pickup' }));
    outbox.enqueue(stopWrite('r1', 's1', { notes: 'done' }));
    await flush();
    routes.calls[0].answer.resolve(rejected());
    await flush();
    report.mockClear();

    outbox.discardRoute('r1');

    expect(outbox.getSnapshot().entries).toHaveLength(0);
    expect(report.mock.calls.map(([record]) => [record.kind, record.outcome])).toEqual([
      ['startPlacement', 'discarded'],
      ['placementStopDone', 'discarded'],
    ]);
  });

  it('reports confirm-to-saved time and retries across attempts', async () => {
    jest.useFakeTimers({ now: NOW });
    const { outbox, routes, report, advanceClock } = setup();

    outbox.enqueue(routeWrite('r1', { executionPhase: 'pickup' }));
    await flush();
    routes.calls[0].answer.resolve(networkError());
    await flush();
    advanceClock(4000);
    jest.advanceTimersByTime(1000);
    await flush();
    routes.calls[1].answer.resolve(saved());
    await flush();

    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][0]).toMatchObject({
      kind: 'startPlacement',
      routeId: 'r1',
      confirmToSavedMs: 4000,
      retries: 1,
      outcome: 'saved',
    });
  });

  it('reports a rejected write as failed', async () => {
    const { outbox, routes, report } = setup();

    outbox.enqueue(routeWrite('r1', { executionPhase: 'pickup' }));
    await flush();
    routes.calls[0].answer.resolve(rejected());
    await flush();

    expect(report.mock.calls[0][0]).toMatchObject({ outcome: 'failed', retries: 0 });
  });

  it('keeps a saved write on screen until the live data catches up with it', async () => {
    const { outbox, routes } = setup();

    outbox.enqueue(routeWrite('r1', { executionPhase: 'pickup' }));
    await flush();
    routes.calls[0].answer.resolve(saved('v2'));
    await flush();

    const snapshot = outbox.getSnapshot();
    expect(overlayRoute({ id: 'r1', executionPhase: 'placement', updatedAt: 'v1' }, snapshot).executionPhase).toBe(
      'pickup'
    );
    // Once the echo lands, the live record is shown as is.
    expect(overlayRoute({ id: 'r1', executionPhase: 'unload', updatedAt: 'v3' }, snapshot).executionPhase).toBe(
      'unload'
    );
  });

  describe('across restarts', () => {
    function storedEntry(overrides: Partial<OutboxEntry>): OutboxEntry {
      return {
        id: 'e1',
        routeId: 'r1',
        target: 'Route',
        recordId: 'r1',
        kind: 'completePlacement',
        patch: { executionPhase: 'pickup' },
        confirmedAt: NOW - 60_000,
        attempts: 1,
        state: 'pending',
        ...overrides,
      };
    }

    function seeded(entries: OutboxEntry[]) {
      const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ v: 1, entries }) });
      return { storage, ...setup({ storage }) };
    }

    it('saves the outbox for the signed-in operator', async () => {
      const { outbox, storage } = setup();
      outbox.setOwner(OWNER);

      outbox.enqueue(routeWrite('r1', { executionPhase: 'pickup' }));

      expect(JSON.parse(storage.data.get(STORAGE_KEY)!).entries).toEqual([
        expect.objectContaining({ routeId: 'r1', patch: { executionPhase: 'pickup' } }),
      ]);
    });

    it('resends writes under 12 hours old when the app opens', async () => {
      const { outbox, routes } = seeded([storedEntry({ confirmedAt: NOW - HOLD_AFTER_MS + 1 })]);

      outbox.setOwner(OWNER);
      await flush();

      expect(routes.calls.map((call) => call.patch)).toEqual([{ executionPhase: 'pickup' }]);
      expect(overlayRoute({ id: 'r1' }, outbox.getSnapshot())).toMatchObject({ executionPhase: 'pickup' });
    });

    it('holds older writes until the operator sends them', async () => {
      const { outbox, routes } = seeded([
        storedEntry({ id: 'old', confirmedAt: NOW - HOLD_AFTER_MS }),
        storedEntry({ id: 'other', routeId: 'r2', recordId: 'r2', confirmedAt: NOW - 1000 }),
      ]);

      outbox.setOwner(OWNER);
      await flush();

      expect(outbox.getSnapshot().entries.map((entry) => [entry.id, entry.state])).toEqual([
        ['old', 'held'],
        ['other', 'pending'],
      ]);
      expect(routes.calls.map((call) => call.id)).toEqual(['r2']);

      outbox.sendHeld();
      await flush();
      expect(routes.calls.map((call) => call.id)).toEqual(['r2', 'r1']);
    });

    it('drops held writes on discard, recording them', async () => {
      const { outbox, report } = seeded([storedEntry({ confirmedAt: NOW - HOLD_AFTER_MS - 1 })]);

      outbox.setOwner(OWNER);
      outbox.discardHeld();

      expect(outbox.getSnapshot().entries).toHaveLength(0);
      expect(report.mock.calls[0][0]).toMatchObject({ kind: 'completePlacement', outcome: 'discarded' });
    });

    it('keeps a rejected write stopped after a restart', async () => {
      const { outbox, routes } = seeded([storedEntry({ state: 'rejected' })]);

      outbox.setOwner(OWNER);
      await flush();

      expect(routes.calls).toHaveLength(0);
      expect(outbox.getSnapshot().entries[0].state).toBe('rejected');
    });

    it('ignores a corrupt store', () => {
      const storage = memoryStorage({ [STORAGE_KEY]: '{not json' });
      const { outbox } = setup({ storage });

      outbox.setOwner(OWNER);

      expect(outbox.getSnapshot().entries).toHaveLength(0);
    });

    it("keeps writes queued before the operator was known, and doesn't load another operator's", async () => {
      const storage = memoryStorage({
        [STORAGE_KEY]: JSON.stringify({ v: 1, entries: [storedEntry({ id: 'stored' })] }),
      });
      const { outbox } = setup({ storage });

      const early = outbox.enqueue(routeWrite('r9', { executionPhase: 'pickup' }));
      outbox.setOwner(OWNER);

      expect(outbox.getSnapshot().entries.map((entry) => entry.id)).toEqual(['stored', early.id]);

      outbox.setOwner('someone-else');
      expect(outbox.getSnapshot().entries).toHaveLength(0);
    });

    it("doesn't carry a send in flight on into the next operator's queue", async () => {
      const { outbox, routes } = setup();
      outbox.setOwner(OWNER);
      outbox.enqueue(routeWrite('r1', { placementStartTime: 'T1' }));
      await flush();

      outbox.setOwner('someone-else');
      outbox.enqueue(routeWrite('r1', { placementStartTime: 'T2' }));
      await flush();
      routes.calls[0].answer.resolve(saved());
      await flush();

      expect(routes.calls.map((call) => call.patch)).toEqual([{ placementStartTime: 'T1' }, { placementStartTime: 'T2' }]);
    });
  });

  describe('discardAll (sign-out)', () => {
    it('drops every write and records each as discarded', async () => {
      const { outbox, report } = setup();
      outbox.enqueue(routeWrite('r1', { executionPhase: 'pickup' }));
      outbox.enqueue(routeWrite('r2', { executionPhase: 'unload' }));

      await outbox.discardAll();

      expect(outbox.getSnapshot().entries).toHaveLength(0);
      expect(report.mock.calls.map(([record]) => [record.routeId, record.outcome])).toEqual([
        ['r1', 'discarded'],
        ['r2', 'discarded'],
      ]);
    });

    it('waits for the records to send, but no longer than the cap', async () => {
      jest.useFakeTimers({ now: NOW });
      const { outbox } = setup({ report: () => new Promise(() => {}) });
      outbox.enqueue(routeWrite('r1', { executionPhase: 'pickup' }));

      let done = false;
      void outbox.discardAll().then(() => {
        done = true;
      });
      await flush();
      expect(done).toBe(false);

      jest.advanceTimersByTime(DISCARD_REPORT_WAIT_MS);
      await flush();
      expect(done).toBe(true);
    });

    it("doesn't send a write it has discarded", async () => {
      jest.useFakeTimers({ now: NOW });
      const { outbox, routes } = setup();
      outbox.enqueue(routeWrite('r1', { executionPhase: 'pickup' }));
      await flush();
      routes.calls[0].answer.resolve(networkError());
      await flush();

      await outbox.discardAll();
      jest.advanceTimersByTime(MAX_WAIT);
      await flush();

      expect(routes.calls).toHaveLength(1);
    });
  });
});

describe('a Load Change through the outbox', () => {
  beforeEach(() => {
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const loadAudit = { customerId: 'c1', resourceId: 'new-1', action: 'stop.loadChange.add', details: { routeId: 'r1' } };

  function newStopWrite() {
    return {
      routeId: 'r1',
      target: 'NewStop' as const,
      recordId: 'new-1',
      kind: 'loadStopAdded' as const,
      patch: { routeId: 'r1', sequence: 3, address: '30 Faraday St, Carlton', addedAtLoad: '2026-09-30T08:59:00.000Z' },
      audit: loadAudit,
    };
  }

  it('shows an added Stop on its Route at once, after the rest, and never on another Route', () => {
    const { outbox } = setup();
    outbox.enqueue(newStopWrite());

    const stops = [{ id: 's1' }, { id: 's2' }];
    expect(overlayStops(stops, outbox.getSnapshot(), 'r1').map((stop) => stop.id)).toEqual(['s1', 's2', 'new-1']);
    expect(overlayStops(stops, outbox.getSnapshot(), 'r2').map((stop) => stop.id)).toEqual(['s1', 's2']);
  });

  it('creates the Stop with the id it was shown under, then writes its audit entry', async () => {
    const { outbox, newStops, audit } = setup();
    outbox.enqueue(newStopWrite());
    await flush();

    expect(newStops.calls).toHaveLength(1);
    expect(newStops.calls[0].id).toBe('new-1');
    expect(newStops.calls[0].patch).toEqual(expect.objectContaining({ address: '30 Faraday St, Carlton' }));
    expect(audit).not.toHaveBeenCalled();

    newStops.calls[0].answer.resolve(saved());
    await flush();
    expect(audit).toHaveBeenCalledWith(loadAudit);
  });

  it('keeps showing a saved added Stop until the live data brings it, once', async () => {
    const { outbox, newStops } = setup();
    outbox.enqueue(newStopWrite());
    await flush();
    newStops.calls[0].answer.resolve(saved());
    await flush();

    const snapshot = outbox.getSnapshot();
    expect(overlayStops([{ id: 's1' }], snapshot, 'r1').map((stop) => stop.id)).toEqual(['s1', 'new-1']);
    expect(overlayStops([{ id: 's1' }, { id: 'new-1', updatedAt: 'v9' }], snapshot, 'r1').map((stop) => stop.id)).toEqual([
      's1',
      'new-1',
    ]);
  });

  it("doesn't audit a write that was refused", async () => {
    const { outbox, newStops, audit } = setup();
    outbox.enqueue(newStopWrite());
    await flush();
    newStops.calls[0].answer.resolve(rejected());
    await flush();

    expect(audit).not.toHaveBeenCalled();
  });

  it('a failed audit entry leaves the write saved and the queue moving', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { outbox, newStops, stops, audit } = setup();
    audit.mockRejectedValue(new Error('audit down'));
    outbox.enqueue(newStopWrite());
    outbox.enqueue(stopWrite('r1', 's1', { removed: true }));
    await flush();
    newStops.calls[0].answer.resolve(saved());
    await flush();

    expect(stops.calls).toHaveLength(1);
    expect(outbox.getSnapshot().entries.map((entry) => entry.target)).toEqual(['Stop']);
  });
});

const MAX_WAIT = 60_000;
