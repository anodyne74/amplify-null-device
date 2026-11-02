import { callApi } from '@/lib/apiClient';

/**
 * Runs a Customer Access Sync (lib/customerAccess.ts) through one of its API
 * routes until it reports complete. The route is cut off at about 28s, so each
 * call syncs for a bounded time and answers `complete: false` while records are
 * left; already-synced records are skipped, so calling again picks up where the
 * last call stopped. Gives up after MAX_SYNC_CALLS (each runs about 20s) and
 * says so, leaving the rest to a later run. A failed call ends the run as
 * failed, with its message, rather than throwing.
 *
 * `onProgress` is called with the records updated so far, after each call.
 */

/** Calls before giving up; each one runs about 20s. */
export const MAX_SYNC_CALLS = 15;

/** How a sync ended: done, out of calls with records left, or a failed request/write. */
export type AccessSyncOutcome = { status: 'complete'; updated: number } | { status: 'incomplete' } | { status: 'failed'; message: string };

const countUpdated = (updated: unknown) =>
  Object.values((updated ?? {}) as Record<string, number>).reduce((sum, count) => sum + count, 0);

export async function runAccessSync(
  path: string,
  body: Record<string, unknown>,
  onProgress?: (updated: number) => void
): Promise<AccessSyncOutcome> {
  let synced = 0;
  try {
    for (let attempt = 0; attempt < MAX_SYNC_CALLS; attempt++) {
      const payload = await callApi(path, body);
      synced += countUpdated(payload.updated);
      onProgress?.(synced);
      if (payload.complete !== false) return { status: 'complete', updated: synced };
    }
    return { status: 'incomplete' };
  } catch (e) {
    return { status: 'failed', message: e instanceof Error ? e.message : 'Access sync failed.' };
  }
}
