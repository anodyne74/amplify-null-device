import { NextRequest, NextResponse } from 'next/server';
import { authorizeIamRequest } from '@/lib/server/authorizeIamRequest';
import { syncCustomerAccess } from '@/lib/customerAccess';

// Amplify cuts SSR requests off at ~28s; stop well short so the response gets out.
const SYNC_BUDGET_MS = 20_000;

/**
 * Re-syncs a customer's record access after an administrator adds or removes
 * one of its CustomerUsers. Runs server-side with the IAM client because the
 * administrator's own session can't update CustomerClosureBlock (customer-
 * written only), and so a revoke isn't cut short if the admin closes the tab. A large customer
 * can't finish in one request, so it answers `complete: false` after a time
 * budget and the caller calls again until it's true (already-synced records
 * are skipped, so each call picks up where the last stopped).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeIamRequest(request, 'administrator');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { customerId, added, removed } = (await request.json()) as {
      customerId?: unknown;
      added?: unknown;
      removed?: unknown;
    };
    if (typeof customerId !== 'string' || !customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
    }

    const { updated, errors, complete } = await syncCustomerAccess(auth.client, customerId, {
      budgetMs: SYNC_BUDGET_MS,
      added: typeof added === 'string' ? added : undefined,
      removed: typeof removed === 'string' ? removed : undefined,
    });
    if (errors.length > 0) {
      return NextResponse.json(
        { error: `Access sync finished with ${errors.length} error(s).`, updated },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, updated, complete });
  } catch (err) {
    console.error('Unexpected error in sync-customer-access:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Internal server error: ${errorMessage}` }, { status: 500 });
  }
}
