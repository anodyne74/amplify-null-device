import { NextRequest, NextResponse } from 'next/server';
import { authorizeIamRequest } from '@/lib/server/authorizeIamRequest';
import { listAll } from '@/lib/listAll';
import { syncCustomerAccess } from '@/lib/customerAccess';

/**
 * Backfills viewerSubs/accountOwnerSub on every record of the calling customer's
 * account (see lib/customerAccess.ts).
 *
 * These fields are normally synced by the customer-access-activation Lambda at signup
 * time, but that trigger only fires on new sign-ups — accounts that were already active
 * before the fields existed never get them set. This route lets any already-active
 * customer self-heal on next portal visit. It also repairs any sync that failed
 * partway through after an invite or activation. It runs with the SSR compute role's elevated
 * data access (same pattern as the admin API routes), so it can read/write these records
 * before viewerSubs/accountOwnerSub are populated, which the caller's own session cannot.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeIamRequest(request, 'customer');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { claims, client } = auth;

    const { data: ownRows } = await listAll(client, 'CustomerUser', {
      filter: { userSub: { eq: claims.sub } },
    });

    const customerId = (ownRows || []).find((row) => row?.customerId)?.customerId;
    if (!customerId) {
      return NextResponse.json({ error: 'No customer mapping found for this user' }, { status: 404 });
    }

    const { errors } = await syncCustomerAccess(client, customerId);
    if (errors.length > 0) {
      // Non-200 so the portal retries the repair on its next visit.
      return NextResponse.json({ error: `Access sync finished with ${errors.length} error(s).` }, { status: 500 });
    }

    return NextResponse.json({ success: true, customerId });
  } catch (err) {
    console.error('Unexpected error in sync-profile-access:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Internal server error: ${errorMessage}` }, { status: 500 });
  }
}
