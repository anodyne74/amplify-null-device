import { NextRequest, NextResponse } from 'next/server';
import { authorizePropertyHistoryRequest } from '@/lib/server/authorizePropertyHistoryRequest';
import { listPropertyHistoryReports } from '@/lib/server/propertyHistoryReports';

/**
 * The Property History Reports the caller may see (#291), newest first: every
 * report for an administrator, their Customer's customer reports for an
 * Account Owner. Read-only customer users see none.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizePropertyHistoryRequest(request, { accountOwnersOnly: true });
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    return NextResponse.json({ reports: await listPropertyHistoryReports(auth.client, auth.caller) });
  } catch (err) {
    console.error('Listing Property History Reports failed:', err);
    return NextResponse.json({ error: 'Could not load reports' }, { status: 500 });
  }
}
