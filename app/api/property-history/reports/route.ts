import { NextRequest, NextResponse } from 'next/server';
import { authorizePropertyHistoryRequest } from '@/lib/server/authorizePropertyHistoryRequest';
import { generatePropertyHistoryReport } from '@/lib/server/propertyHistoryReports';
import { getReportStore } from '@/lib/server/reportStorage';
import { parsePropertyHistoryRequest } from '@/lib/propertyHistory';

/**
 * Generates a Property History Report (#291): body { search, filters }, the
 * same as the search. Administrators, and Account Owners whose Customer has
 * the Property History flag on. The server runs the search, renders and files
 * the PDF (ADR 0003); the response carries the report and a short-lived link
 * to open it.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizePropertyHistoryRequest(request, { accountOwnersOnly: true });
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { caller, claims, client } = auth;

    const parsed = parsePropertyHistoryRequest(await request.json().catch(() => null));
    if (!parsed) {
      return NextResponse.json({ error: 'Invalid search' }, { status: 400 });
    }

    const author = { sub: claims.sub, name: claims.name || claims.email || claims['cognito:username'] || claims.sub };
    return NextResponse.json(
      await generatePropertyHistoryReport(client, getReportStore(), caller, author, parsed.search, parsed.filters)
    );
  } catch (err) {
    console.error('Generating a Property History Report failed:', err);
    return NextResponse.json({ error: 'Could not generate the report' }, { status: 500 });
  }
}
