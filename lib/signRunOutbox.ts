'use client';

/**
 * The Sign Run outbox (#355, ADR 0007): a Sign Run Transition or Stop
 * settlement takes effect on the operator's screen the moment they confirm
 * it, and is saved afterwards from here, so the operator never waits on the
 * network.
 *
 * - One outbox per device and signed-in operator, kept in localStorage.
 * - A Route's writes (its own and its Stops') are sent strictly in the order
 *   tapped, the next only once the one before it has saved. Routes don't
 *   block each other.
 * - Network trouble is retried with backoff for as long as it takes, and
 *   straight away through retryNow() (on reconnect or the app coming back).
 * - A write the server rejects stops its Route's queue. It and every later
 *   write for that Route stop showing on screen (see overlayRoute /
 *   overlayStops) until the operator picks Try again or Discard.
 * - Writes under 12 hours old are resent when the app reopens; older ones are
 *   held until the operator sends or discards them.
 *
 * Concurrent edits stay last-write-wins: there's no version check.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { updateRoute, updateStopExecution } from '@/lib/routes';
import { callApi } from '@/lib/apiClient';
import { refreshSessionIfStale } from '@/lib/useSessionRefresh';
import type { SignRunTimingKind, SignRunTimingRecord } from '@/lib/signRunTiming';

export type OutboxEntryState = 'pending' | 'rejected' | 'held';

export interface OutboxEntry {
  id: string;
  routeId: string;
  target: 'Route' | 'Stop';
  /** The Route's or the Stop's id. */
  recordId: string;
  kind: SignRunTimingKind;
  /** Exactly what planSignRunTransition / planStopSettlement produced. */
  patch: Record<string, unknown>;
  /** When the operator tapped OK (epoch ms). */
  confirmedAt: number;
  attempts: number;
  state: OutboxEntryState;
}

/** Fields a saved write set, held over the live record until it catches up. */
interface SavedFields {
  updatedAt: string;
  fields: Record<string, unknown>;
}

export interface OutboxSnapshot {
  entries: readonly OutboxEntry[];
  saved: Readonly<Record<string, SavedFields>>;
}

export type WriteResult = { data?: { updatedAt?: string | null } | null; errors?: readonly unknown[] | null };

export interface OutboxDeps {
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  writeRoute: (id: string, patch: Record<string, unknown>) => Promise<WriteResult>;
  writeStop: (id: string, patch: Record<string, unknown>) => Promise<WriteResult>;
  /** The token check timed as authCheckMs before each attempt. */
  checkAuth: () => Promise<unknown>;
  /** Run before retryNow() resends, so a resend rarely waits on a token refresh. */
  refreshSession: () => Promise<void>;
  /** Sends a timing record. Never delays a write; only sign-out waits on it. */
  report: (record: SignRunTimingRecord) => Promise<unknown>;
  now: () => number;
}

export const HOLD_AFTER_MS = 12 * 60 * 60 * 1000;
export const MAX_BACKOFF_MS = 30_000;
/** An attempt with no answer by then is treated as network trouble and retried. */
export const ATTEMPT_TIMEOUT_MS = 30_000;
/** How long sign-out waits for its discard records to send. */
export const DISCARD_REPORT_WAIT_MS = 3_000;

const STORAGE_PREFIX = 'nd.signRunOutbox.';

// AppSync errors that mean "try again later" rather than "this write is refused".
const TRANSIENT_ERROR_TYPE = /UnauthorizedException|Throttl|InternalFailure|ServiceUnavailable|Timeout|Network/i;

/**
 * Whether a write's errors are the server refusing it (an authorization or
 * validation error from AppSync), as opposed to network trouble. AppSync
 * sets errorType on the errors it returns; a request that never got an
 * answer comes back without one.
 */
export function isServerRejection(errors: readonly unknown[]): boolean {
  return errors.some((error) => {
    const errorType = (error as { errorType?: unknown } | null)?.errorType;
    return typeof errorType === 'string' && errorType !== '' && !TRANSIENT_ERROR_TYPE.test(errorType);
  });
}

export function backoffMs(attempts: number): number {
  return Math.min(1000 * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

type AttemptOutcome =
  | { type: 'saved'; updatedAt: string | null; authCheckMs: number; mutationMs: number }
  | { type: 'rejected'; authCheckMs: number; mutationMs: number }
  | { type: 'retry' };

const TIMED_OUT = Symbol('timed out');

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

let entrySeq = 0;
function newEntryId(now: number) {
  entrySeq += 1;
  return `${now.toString(36)}-${entrySeq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isEntry(value: unknown): value is OutboxEntry {
  const entry = value as OutboxEntry | null;
  return (
    !!entry &&
    typeof entry.id === 'string' &&
    typeof entry.routeId === 'string' &&
    (entry.target === 'Route' || entry.target === 'Stop') &&
    typeof entry.recordId === 'string' &&
    typeof entry.kind === 'string' &&
    !!entry.patch &&
    typeof entry.patch === 'object' &&
    typeof entry.confirmedAt === 'number' &&
    typeof entry.attempts === 'number' &&
    (entry.state === 'pending' || entry.state === 'rejected' || entry.state === 'held')
  );
}

export function createSignRunOutbox(deps: OutboxDeps) {
  let owner: string | null = null;
  let snapshot: OutboxSnapshot = { entries: [], saved: {} };
  const listeners = new Set<() => void>();
  // Keyed by generation too, so a send still in flight when the operator
  // changes can't carry on into the next operator's queue.
  const sending = new Set<string>();
  let generation = 0;
  const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function storageKey() {
    return owner ? `${STORAGE_PREFIX}${owner}` : null;
  }

  function persist() {
    const key = storageKey();
    if (!key || !deps.storage) return;
    try {
      if (snapshot.entries.length === 0) deps.storage.removeItem(key);
      else deps.storage.setItem(key, JSON.stringify({ v: 1, entries: snapshot.entries }));
    } catch {
      // Storage full or unavailable: the outbox carries on in memory.
    }
  }

  function load(key: string): OutboxEntry[] {
    try {
      const parsed = JSON.parse(deps.storage?.getItem(key) ?? 'null');
      return Array.isArray(parsed?.entries) ? parsed.entries.filter(isEntry) : [];
    } catch {
      return [];
    }
  }

  function commit(next: Partial<OutboxSnapshot>) {
    snapshot = { ...snapshot, ...next };
    persist();
    listeners.forEach((listener) => listener());
  }

  function setEntries(update: (entries: readonly OutboxEntry[]) => OutboxEntry[]) {
    commit({ entries: update(snapshot.entries) });
  }

  function clearRetry(routeId: string) {
    const timer = retryTimers.get(routeId);
    if (timer !== undefined) clearTimeout(timer);
    retryTimers.delete(routeId);
  }

  function reportEntry(
    entry: OutboxEntry,
    outcome: SignRunTimingRecord['outcome'],
    authCheckMs = 0,
    mutationMs = 0
  ): Promise<unknown> {
    const confirmToSavedMs = Math.max(0, Math.round(deps.now() - entry.confirmedAt));
    console.info(
      `[sign-run-timing] route=${entry.routeId} authCheckMs=${authCheckMs} mutationMs=${mutationMs} totalMs=${confirmToSavedMs}`
    );
    try {
      return deps.report({
        kind: entry.kind,
        routeId: entry.routeId,
        authCheckMs,
        mutationMs,
        confirmToSavedMs,
        retries: Math.max(0, entry.attempts - 1),
        outcome,
      }).catch(() => undefined);
    } catch {
      // Dropped, like a failed send.
      return Promise.resolve();
    }
  }

  async function attempt(entry: OutboxEntry): Promise<AttemptOutcome> {
    const startedAt = deps.now();
    let mutationStart: number | undefined;
    try {
      await deps.checkAuth();
      mutationStart = deps.now();
      const write = entry.target === 'Route' ? deps.writeRoute : deps.writeStop;
      const result = await withTimeout(write(entry.recordId, entry.patch), ATTEMPT_TIMEOUT_MS);
      if (result === TIMED_OUT) return { type: 'retry' };

      const finishedAt = deps.now();
      const authCheckMs = Math.round(mutationStart - startedAt);
      const mutationMs = Math.round(finishedAt - mutationStart);
      const errors = result.errors ?? [];
      if (errors.length === 0) {
        return { type: 'saved', updatedAt: result.data?.updatedAt ?? null, authCheckMs, mutationMs };
      }
      return isServerRejection(errors) ? { type: 'rejected', authCheckMs, mutationMs } : { type: 'retry' };
    } catch {
      return { type: 'retry' };
    }
  }

  /** Sends a Route's queue, head first, until it's empty, stopped or waiting to retry. */
  async function pump(routeId: string) {
    const key = `${generation}:${routeId}`;
    if (sending.has(key)) return;
    const started = generation;
    sending.add(key);
    clearRetry(routeId);
    try {
      for (;;) {
        const head = snapshot.entries.find((entry) => entry.routeId === routeId);
        if (!head || head.state !== 'pending') return;

        const attempted = { ...head, attempts: head.attempts + 1 };
        setEntries((entries) => entries.map((entry) => (entry.id === head.id ? attempted : entry)));

        const outcome = await attempt(attempted);
        if (generation !== started) return;
        // Discarded mid-flight (e.g. on sign-out): nothing left to update.
        const stillQueued = snapshot.entries.some((entry) => entry.id === head.id);

        if (outcome.type === 'saved') {
          const saved = { ...snapshot.saved };
          if (outcome.updatedAt) {
            const previous = saved[head.recordId];
            saved[head.recordId] = {
              updatedAt: outcome.updatedAt,
              fields: { ...previous?.fields, ...head.patch },
            };
          }
          commit({ entries: snapshot.entries.filter((entry) => entry.id !== head.id), saved });
          void reportEntry(attempted, 'saved', outcome.authCheckMs, outcome.mutationMs);
          continue;
        }

        if (!stillQueued) return;

        if (outcome.type === 'rejected') {
          setEntries((entries) =>
            entries.map((entry) => (entry.id === head.id ? { ...entry, state: 'rejected' } : entry))
          );
          void reportEntry(attempted, 'failed', outcome.authCheckMs, outcome.mutationMs);
          return;
        }

        retryTimers.set(
          routeId,
          setTimeout(() => {
            retryTimers.delete(routeId);
            void pump(routeId);
          }, backoffMs(attempted.attempts))
        );
        return;
      }
    } finally {
      sending.delete(key);
    }
  }

  function pumpAll() {
    const routeIds = new Set(snapshot.entries.map((entry) => entry.routeId));
    routeIds.forEach((routeId) => void pump(routeId));
  }

  function routeIdsWith(state: OutboxEntryState) {
    return new Set(snapshot.entries.filter((entry) => entry.state === state).map((entry) => entry.routeId));
  }

  return {
    getSnapshot: () => snapshot,

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    /**
     * Scopes the outbox to the signed-in operator. Their stored writes are
     * loaded (any queued before now are kept after them), writes 12 hours old
     * or more are held, and the rest are sent.
     */
    setOwner(sub: string | null) {
      if (sub === owner) return;
      retryTimers.forEach((timer) => clearTimeout(timer));
      retryTimers.clear();
      generation += 1;
      const unowned = owner === null ? snapshot.entries : [];
      owner = sub;
      if (!sub) {
        commit({ entries: [], saved: {} });
        return;
      }
      const now = deps.now();
      const stored = load(`${STORAGE_PREFIX}${sub}`).map((entry) =>
        entry.state === 'pending' && now - entry.confirmedAt >= HOLD_AFTER_MS ? { ...entry, state: 'held' as const } : entry
      );
      const storedIds = new Set(stored.map((entry) => entry.id));
      commit({ entries: [...stored, ...unowned.filter((entry) => !storedIds.has(entry.id))], saved: {} });
      pumpAll();
    },

    /** Queues one write and starts sending it. The write shows on screen at once. */
    enqueue(write: Pick<OutboxEntry, 'routeId' | 'target' | 'recordId' | 'kind' | 'patch'>): OutboxEntry {
      const now = deps.now();
      const entry: OutboxEntry = { ...write, id: newEntryId(now), confirmedAt: now, attempts: 0, state: 'pending' };
      setEntries((entries) => [...entries, entry]);
      void pump(entry.routeId);
      return entry;
    },

    /** Resends every waiting queue now, rather than at its next backoff. */
    async retryNow() {
      await deps.refreshSession();
      pumpAll();
    },

    /** Try again: resends a stopped Route's writes, in order. */
    resend(routeId: string) {
      setEntries((entries) =>
        entries.map((entry) => (entry.routeId === routeId && entry.state === 'rejected' ? { ...entry, state: 'pending' } : entry))
      );
      void pump(routeId);
    },

    /** Sends every held write, oldest first. */
    sendHeld() {
      const routeIds = routeIdsWith('held');
      setEntries((entries) => entries.map((entry) => (entry.state === 'held' ? { ...entry, state: 'pending' } : entry)));
      routeIds.forEach((routeId) => void pump(routeId));
    },

    /** Drops a Route's writes (all of them: none can be sent before its first). */
    discardRoute(routeId: string) {
      clearRetry(routeId);
      const dropped = snapshot.entries.filter((entry) => entry.routeId === routeId);
      setEntries((entries) => entries.filter((entry) => entry.routeId !== routeId));
      dropped.forEach((entry) => void reportEntry(entry, 'discarded'));
    },

    /** Drops every held write. */
    discardHeld() {
      routeIdsWith('held').forEach((routeId) => this.discardRoute(routeId));
    },

    /**
     * Drops every unsaved write on sign-out, recording each as discarded.
     * Resolves once the records have sent, or after DISCARD_REPORT_WAIT_MS,
     * whichever is first: sign-out must not hang on a dead network.
     */
    async discardAll(): Promise<void> {
      retryTimers.forEach((timer) => clearTimeout(timer));
      retryTimers.clear();
      generation += 1;
      const dropped = [...snapshot.entries];
      commit({ entries: [] });
      if (dropped.length === 0) return;
      const reports = Promise.all(dropped.map((entry) => reportEntry(entry, 'discarded')));
      await withTimeout(reports, DISCARD_REPORT_WAIT_MS);
    },
  };
}

export type SignRunOutbox = ReturnType<typeof createSignRunOutbox>;

/** The entries showing on screen: every Route's queue up to its first rejected write. */
export function visibleEntries(snapshot: OutboxSnapshot): OutboxEntry[] {
  const stopped = new Set<string>();
  return snapshot.entries.filter((entry) => {
    if (entry.state === 'rejected') stopped.add(entry.routeId);
    return !stopped.has(entry.routeId);
  });
}

type Versioned = { id: string; updatedAt?: string | null };

function overlay<T extends Versioned>(record: T, target: OutboxEntry['target'], snapshot: OutboxSnapshot, visible: OutboxEntry[]): T {
  let result = record;
  const saved = snapshot.saved[record.id];
  if (saved && (record.updatedAt ?? '') < saved.updatedAt) {
    result = { ...result, ...saved.fields };
  }
  for (const entry of visible) {
    if (entry.target === target && entry.recordId === record.id) {
      result = { ...result, ...entry.patch };
    }
  }
  return result;
}

/** The Route as the operator's screen shows it: saved writes the live data
 * hasn't caught up with yet, then unsaved ones. */
export function overlayRoute<T extends Versioned>(route: T, snapshot: OutboxSnapshot): T {
  if (snapshot.entries.length === 0 && Object.keys(snapshot.saved).length === 0) return route;
  return overlay(route, 'Route', snapshot, visibleEntries(snapshot));
}

/** Each Stop as the operator's screen shows it — see overlayRoute. */
export function overlayStops<T extends Versioned>(stops: T[], snapshot: OutboxSnapshot): T[] {
  if (snapshot.entries.length === 0 && Object.keys(snapshot.saved).length === 0) return stops;
  const visible = visibleEntries(snapshot);
  return stops.map((stop) => overlay(stop, 'Stop', snapshot, visible));
}

function reportTiming(record: SignRunTimingRecord) {
  return callApi('/api/sign-run-timing', record);
}

/** The device's outbox. The operator portal scopes it with setOwner. */
export const signRunOutbox = createSignRunOutbox({
  storage: typeof window === 'undefined' ? null : window.localStorage,
  writeRoute: (id, patch) => updateRoute(id, patch),
  writeStop: (id, patch) => updateStopExecution(id, patch),
  checkAuth: () => fetchAuthSession(),
  refreshSession: refreshSessionIfStale,
  report: reportTiming,
  now: () => Date.now(),
});

const EMPTY: OutboxSnapshot = { entries: [], saved: {} };

/** The device's outbox, re-rendering whenever it changes. */
export function useSignRunOutbox(): OutboxSnapshot {
  return useSyncExternalStore(signRunOutbox.subscribe, signRunOutbox.getSnapshot, () => EMPTY);
}

/**
 * Scopes the outbox to the signed-in operator and resends straight away when
 * the device comes back online or the app back into view. Mount once, in the
 * operator portal.
 */
export function useSignRunOutboxSender(operatorSub: string | null) {
  useEffect(() => {
    signRunOutbox.setOwner(operatorSub);
  }, [operatorSub]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void signRunOutbox.retryNow();
    };
    const onOnline = () => void signRunOutbox.retryNow();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, []);
}
