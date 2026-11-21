import { NextRequest, NextResponse } from 'next/server';
import { routeLinkCode } from '@/lib/routeLink';

/**
 * The Route Link in Notify Operator's text (#423, ADR 0013): `/r/<code>` opens
 * the Route in the operator portal, which does its own sign-in and Route
 * lookup. Texts sent before codes carry `/r/<Route id>`, which still works.
 * Kept short so the whole text fits in one SMS.
 *
 * Redirects to the configured public site (NEXT_PUBLIC_APP_URL), the same one
 * the text's link was built from: behind the hosting proxy the request's own
 * origin is the internal server (https://localhost:3000). Without it set, as in
 * local development, the request's origin is right.
 */
function publicOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Malformed value: fall through to the request's origin.
    }
  }
  return request.nextUrl.origin;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const code = routeLinkCode(id);
  const target = new URL('/operator/routes/detail', publicOrigin(request));
  if (code) target.searchParams.set('code', code);
  else target.searchParams.set('id', id);
  return NextResponse.redirect(target, 307);
}
