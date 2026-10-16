import { NextRequest, NextResponse } from 'next/server';
import { routeLinkCode } from '@/lib/routeLink';

/**
 * The Route Link in Notify Operator's text (#423, ADR 0013): `/r/<code>` opens
 * the Route in the operator portal, which does its own sign-in and Route
 * lookup. Texts sent before codes carry `/r/<Route id>`, which still works.
 * Kept short so the whole text fits in one SMS.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const code = routeLinkCode(id);
  const target = new URL('/operator/routes/detail', request.nextUrl.origin);
  if (code) target.searchParams.set('code', code);
  else target.searchParams.set('id', id);
  return NextResponse.redirect(target, 307);
}
