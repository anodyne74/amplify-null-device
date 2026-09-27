import { NextRequest, NextResponse } from 'next/server';
import { authorizePropertyHistoryRequest } from '@/lib/server/authorizePropertyHistoryRequest';
import { searchPropertyHistory } from '@/lib/server/propertyHistory';
import { parsePropertyHistoryRequest } from '@/lib/propertyHistory';

/**
 * The one Property History search (#288), for the admin and customer screens
 * and report generation alike. Body: { search, filters } -- see
 * parsePropertyHistoryRequest.
 *
 * Runs on the IAM client (ADR 0001), so it enforces its own scope through
 * authorizePropertyHistoryRequest: a customer is held to their own Customer
 * and refused while the Property History flag is off for it (ADR 0005).
 * Administrators aren't subject to the flag and may narrow to any Customer.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizePropertyHistoryRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { caller, client } = auth;

    const parsed = parsePropertyHistoryRequest(await request.json().catch(() => null));
    if (!parsed) {
      return NextResponse.json({ error: 'Invalid search' }, { status: 400 });
    }

    return NextResponse.json(await searchPropertyHistory(client, caller, parsed.search, parsed.filters));
  } catch (err) {
    console.error('Property History search failed:', err);
    return NextResponse.json({ error: 'Property History search failed' }, { status: 500 });
  }
}
