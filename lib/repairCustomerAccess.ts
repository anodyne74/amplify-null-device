import { callApi } from '@/lib/apiClient';

/** Calls before giving up; each one runs about 20s. */
const MAX_REPAIR_CALLS = 15;

/**
 * Backfills the signed-in customer's record access (see lib/customerAccess.ts).
 * Each call syncs for a bounded time and reports whether it finished, so a
 * large account is repaired by repeating it. Rejects on a failed call; the
 * repair then resumes on the customer's next visit.
 */
export async function repairCustomerAccess(): Promise<void> {
  for (let attempt = 0; attempt < MAX_REPAIR_CALLS; attempt++) {
    const payload = await callApi('/api/customer/sync-profile-access', {});
    if (payload.complete !== false) return;
  }
}
