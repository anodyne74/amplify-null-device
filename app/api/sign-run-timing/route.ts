import { NextRequest, NextResponse } from 'next/server';
import { verifyIamCaller } from '@/lib/server/verifyIamCaller';
import { parseSignRunTimingRecord } from '@/lib/signRunTiming';
import { customOutputs } from '@/lib/amplifyOutputsCustom';

/**
 * Logs one Sign Run write's timing (#353) as a single JSON line, which the
 * observability stack's metric filters turn into the ops dashboard's Sign Run
 * graphs. Operators and administrators only, the people who run Sign Runs.
 *
 * `branch` is on every line because every branch's SSR logs share one log
 * group, and a metric filter only sees the line, not its log stream.
 */
export async function POST(request: NextRequest) {
  const caller = await verifyIamCaller(request, ['operator', 'administrator']);
  if (!caller.ok) {
    return NextResponse.json({ error: caller.error }, { status: caller.status });
  }

  const record = parseSignRunTimingRecord(await request.json().catch(() => null));
  if (!record) {
    return NextResponse.json({ error: 'Malformed timing record' }, { status: 400 });
  }

  console.log(
    JSON.stringify({
      event: 'sign-run-timing',
      branch: customOutputs.branchName ?? 'unknown',
      callerSub: caller.claims.sub,
      ...record,
    })
  );
  return NextResponse.json({ ok: true });
}
