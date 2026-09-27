import { NextRequest, NextResponse } from 'next/server';
import { authorizePropertyHistoryRequest } from '@/lib/server/authorizePropertyHistoryRequest';
import { openPropertyHistoryReport } from '@/lib/server/propertyHistoryReports';
import { getReportStore } from '@/lib/server/reportStorage';

/**
 * A short-lived link to one Property History Report's PDF (#291): body
 * { reportId }. A report the caller may not see is reported as not found.
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

    const url = await openPropertyHistoryReport(auth.client, getReportStore(), auth.caller, reportId);
    if (!url) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }
    return NextResponse.json({ url });
  } catch (err) {
    console.error('Opening a Property History Report failed:', err);
    return NextResponse.json({ error: 'Could not open the report' }, { status: 500 });
  }
}
