import { NextRequest, NextResponse } from 'next/server';
import { authorizePropertyHistoryRequest } from '@/lib/server/authorizePropertyHistoryRequest';
import { deletePropertyHistoryReport, reportActor } from '@/lib/server/propertyHistoryReports';

/**
 * An Account Owner deletes one of their Customer's reports (#292): body
 * { reportId }. It's a soft delete -- administrators can still restore it
 * until it's purged. A report they can't see, or have already deleted, is
 * reported as not found.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizePropertyHistoryRequest(request, { accountOwnersOnly: true });
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => null);
    const reportId = typeof body?.reportId === 'string' ? body.reportId.trim() : '';
    if (!reportId) {
      return NextResponse.json({ error: 'reportId is required' }, { status: 400 });
    }

    const report = await deletePropertyHistoryReport(auth.client, auth.caller, reportActor(auth.claims), reportId);
    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }
    return NextResponse.json({ report });
  } catch (err) {
    console.error('Deleting a Property History Report failed:', err);
    return NextResponse.json({ error: 'Could not delete the report' }, { status: 500 });
  }
}
