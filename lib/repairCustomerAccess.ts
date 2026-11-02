import { runAccessSync } from '@/lib/runAccessSync';

/**
 * Backfills the signed-in customer's record access (see lib/customerAccess.ts).
 * Each call syncs for a bounded time and reports whether it finished, so a
 * large account is repaired by repeating it (lib/runAccessSync.ts). Rejects on
 * a failed call; the repair then resumes on the customer's next visit.
 */
export async function repairCustomerAccess(): Promise<void> {
  const outcome = await runAccessSync('/api/customer/sync-profile-access', {});
  if (outcome.status === 'failed') throw new Error(outcome.message);
}
