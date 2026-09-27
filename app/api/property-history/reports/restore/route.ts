import { NextRequest, NextResponse } from 'next/server';
import { authorizePropertyHistoryRequest } from '@/lib/server/authorizePropertyHistoryRequest';
import { reportActor, restorePropertyHistoryReport } from '@/lib/server/propertyHistoryReports';

/**
 * An administrator restores a deleted report (#292): body { reportId }. It's
 * active for a fresh 30 days. A purged report is gone for good, so it -- like
 * one that isn't deleted -- is reported as not restorable.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizePropertyHistoryRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    if (auth.caller.audience !== 'administrator') {
      return NextResponse.json({ error: 'Forbidden: administrator access required' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const reportId = typeof body?.reportId === 'string' ? body.reportId.trim() : '';
    if (!reportId) {
      return NextResponse.json({ error: 'reportId is required' }, { status: 400 });
    }

    const report = await restorePropertyHistoryReport(auth.client, auth.caller, reportActor(auth.claims), reportId);
    if (!report) {
      return NextResponse.json({ error: 'No deleted report to restore' }, { status: 404 });
    }
    return NextResponse.json({ report });
  } catch (err) {
    console.error('Restoring a Property History Report failed:', err);
    return NextResponse.json({ error: 'Could not restore the report' }, { status: 500 });
  }
}
