import { NextRequest, NextResponse } from 'next/server';

/**
 * The short link in Notify Operator's text (#423): `/r/<Route id>` opens the
 * Route in the operator portal, which does its own sign-in and Route lookup.
 * Kept short so the whole text fits in one SMS.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const target = new URL('/operator/routes/detail', request.nextUrl.origin);
  target.searchParams.set('id', id);
  return NextResponse.redirect(target, 307);
}
