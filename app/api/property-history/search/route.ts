import { NextRequest, NextResponse } from 'next/server';
import { authorizeIamRequest } from '@/lib/server/authorizeIamRequest';
import { isFeatureOnForCustomer } from '@/lib/server/featureFlags';
import { searchPropertyHistory } from '@/lib/server/propertyHistory';
import { listAll } from '@/lib/listAll';
import { parsePropertyHistoryRequest } from '@/lib/propertyHistory';

/**
 * The one Property History search (#288), for the admin and customer screens
 * and report generation alike. Body: { search, filters } -- see
 * parsePropertyHistoryRequest.
 *
 * Runs on the IAM client (ADR 0001), so it enforces its own scope: a
 * customer's Customer comes from their own CustomerUser row, never the
 * request, and they're refused while the Property History flag is off for
 * that Customer (ADR 0005). Administrators aren't subject to the flag and may
 * narrow to any Customer.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeIamRequest(request, ['customer', 'administrator']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { claims, client } = auth;

    const parsed = parsePropertyHistoryRequest(await request.json().catch(() => null));
    if (!parsed) {
      return NextResponse.json({ error: 'Invalid search' }, { status: 400 });
    }

    if ((claims['cognito:groups'] ?? []).includes('administrator')) {
      return NextResponse.json(await searchPropertyHistory(client, { audience: 'administrator' }, parsed.search, parsed.filters));
    }

    const { data: ownRows, errors } = await listAll(client, 'CustomerUser', {
      filter: { userSub: { eq: claims.sub } },
    });
    if (errors.length > 0) {
      console.error("Reading the caller's CustomerUser row failed:", errors);
      return NextResponse.json({ error: 'Property History is unavailable' }, { status: 500 });
    }
    const customerId = ownRows.find((row) => row?.customerId)?.customerId;
    if (!customerId || !(await isFeatureOnForCustomer(client, customerId, 'property-history'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(
      await searchPropertyHistory(client, { audience: 'customer', ownCustomerId: customerId }, parsed.search, parsed.filters)
    );
  } catch (err) {
    console.error('Property History search failed:', err);
    return NextResponse.json({ error: 'Property History search failed' }, { status: 500 });
  }
}
