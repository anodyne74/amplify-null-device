import { NextRequest, NextResponse } from 'next/server';
import { authorizeIamRequest } from '@/lib/server/authorizeIamRequest';
import { listAll } from '@/lib/listAll';
import { getOnFlagsForCustomer } from '@/lib/server/featureFlags';

/**
 * Returns the names of the Feature Flags that are on for the caller's Customer
 * (ADR 0005) -- nothing about other flags or other Customers. The Customer
 * comes from the caller's own CustomerUser row, never from the request.
 * Fails closed: any failure after authorization answers with no flags, so the
 * portal just hides flagged features.
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
      return NextResponse.json({ flags: [] });
    }

    return NextResponse.json({ flags: await getOnFlagsForCustomer(client, customerId) });
  } catch (err) {
    console.error('Resolving feature flags failed; returning none:', err);
    return NextResponse.json({ flags: [] });
  }
}
