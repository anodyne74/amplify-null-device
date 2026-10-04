import { NextRequest, NextResponse } from 'next/server';
import { loadFeedbackRoute } from '@/lib/server/routeFeedback';
import { routeFeedbackLocked } from '@/lib/routeFeedback';

/**
 * Whether the caller can give or change Route Feedback on a Route right now,
 * and if not, why. Asked by the customer's feedback card: a read-only customer
 * user can't read Invoices, so only the server can tell it the Route has been
 * invoiced.
 */
export async function POST(request: NextRequest) {
  try {
    const { routeId } = await request.json();
    const loaded = await loadFeedbackRoute(request, routeId);
    if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status });

    const { route, claims, invoiced } = loaded;
    if (!route.viewerSubs?.includes(claims.sub)) return NextResponse.json({ error: 'Route not found' }, { status: 404 });

    return NextResponse.json({ locked: routeFeedbackLocked(route, invoiced) });
  } catch (err) {
    console.error('Unexpected error in route-feedback/status:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
