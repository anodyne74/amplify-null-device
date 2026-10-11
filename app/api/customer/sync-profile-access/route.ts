import { NextRequest, NextResponse } from 'next/server';
import { authorizeIamRequest } from '@/lib/server/authorizeIamRequest';
import { syncCustomerAccess } from '@/lib/customerAccess';

// Amplify cuts SSR requests off at ~28s; stop well short so the response gets out.
const SYNC_BUDGET_MS = 20_000;

/**
 * Backfills viewerSubs/accountOwnerSub on every record of the calling customer's
 * account (see lib/customerAccess.ts).
 *
 * These fields are normally synced by the customer-access-activation Lambda at signup
 * time, but that trigger only fires on new sign-ups — accounts that were already active
 * before the fields existed never get them set. This route lets any already-active
 * customer self-heal on next portal visit. It also repairs any sync that failed
 * partway through after an invite or activation. A large customer can't finish in
 * one request, so it stops at a time budget and answers `complete: false`; the portal
 * calls again until it's true. It runs with the SSR compute role's elevated
 * data access (same pattern as the admin API routes), so it can read/write these records
 * before viewerSubs/accountOwnerSub are populated, which the caller's own session cannot.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeIamRequest(request, 'customer');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { caller, client } = auth;
    const { customerId } = caller;

    const { errors, complete } = await syncCustomerAccess(client, customerId, { budgetMs: SYNC_BUDGET_MS });
    if (errors.length > 0) {
      // Non-200 so the portal retries the repair on its next visit.
      return NextResponse.json({ error: `Access sync finished with ${errors.length} error(s).` }, { status: 500 });
    }

    return NextResponse.json({ success: true, customerId, complete });
  } catch (err) {
    console.error('Unexpected error in sync-profile-access:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Internal server error: ${errorMessage}` }, { status: 500 });
  }
}
