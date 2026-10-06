import { NextRequest, NextResponse } from 'next/server';
import { authorizeIamRequest } from '@/lib/server/authorizeIamRequest';
import { getOnFlagsForCustomer } from '@/lib/server/featureFlags';

/**
 * Returns the names of the Feature Flags that are on for the caller's Customer
 * (ADR 0005) -- nothing about other flags or other Customers. The Customer
 * comes from the caller's own CustomerUser row (via authorizeIamRequest), never
 * from the request. Fails closed on the client: useFeatureFlags treats any
 * error as no flags, so the portal just hides flagged features.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeIamRequest(request, 'customer');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    return NextResponse.json({ flags: await getOnFlagsForCustomer(auth.client, auth.caller.customerId) });
  } catch (err) {
    console.error('Resolving feature flags failed:', err);
    return NextResponse.json({ error: 'Could not resolve feature flags' }, { status: 500 });
  }
}
