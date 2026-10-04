/**
 * Route Feedback (CONTEXT.md): a Customer user's verdict on a completed Route,
 * All good or Something was off with a note. Changeable until the Route is
 * invoiced. The rules live here so the API route that saves it
 * (app/api/customer/route-feedback) and the card that asks for it agree.
 */
import type { Route } from '@/amplify/types';

export type RouteFeedbackTone = 'good' | 'issue';

export interface RouteFeedbackInput {
  tone: RouteFeedbackTone;
  note?: string;
}

export interface RouteFeedbackPatch {
  customerFeedbackTone: RouteFeedbackTone;
  customerFeedbackNote: string;
  customerFeedbackAt: string;
  customerFeedbackBy: string;
  customerFeedbackByName: string;
}

/** The Route fields Route Feedback reads. */
export type FeedbackRoute = Pick<Route, 'id' | 'customerId' | 'status' | 'customerFeedbackTone'>;

/** How a choice reads: the customer's two buttons, and what administrators are shown. */
export function routeFeedbackLabel(tone: RouteFeedbackTone): string {
  return tone === 'issue' ? 'Something was off' : 'All good';
}

const NOT_COMPLETE = 'This route isn’t complete yet.';
const INVOICED = 'This route has been invoiced, so its feedback can no longer be changed.';

/** Why feedback can't be given or changed on a Route right now, or null if it can. */
export function routeFeedbackLocked(route: Pick<Route, 'status'>, invoiced: boolean): string | null {
  if (route.status !== 'completed') return NOT_COMPLETE;
  if (invoiced) return INVOICED;
  return null;
}

/**
 * What to save for one submission, or why not. "Something was off" needs a
 * note. `changed` is true when it replaces earlier feedback. Whether the
 * caller may see the Route at all is checked before this (lib/server/routeFeedback.ts).
 */
export function planRouteFeedback({
  route,
  caller,
  invoiced,
  input,
  at,
}: {
  route: FeedbackRoute;
  caller: { sub: string; name?: string | null; email?: string | null };
  invoiced: boolean;
  input: RouteFeedbackInput;
  at: string;
}): { patch: RouteFeedbackPatch; changed: boolean } | { refused: string; status: 400 | 409 } {
  if (input.tone !== 'good' && input.tone !== 'issue') return { refused: 'Choose All good or Something was off.', status: 400 };

  const locked = routeFeedbackLocked(route, invoiced);
  if (locked) return { refused: locked, status: 409 };

  const note = (input.note ?? '').trim();
  if (input.tone === 'issue' && !note) return { refused: 'Say what was off.', status: 400 };

  return {
    patch: {
      customerFeedbackTone: input.tone,
      customerFeedbackNote: note,
      customerFeedbackAt: at,
      customerFeedbackBy: caller.sub,
      customerFeedbackByName: caller.name?.trim() || caller.email?.trim() || 'A customer user',
    },
    changed: Boolean(route.customerFeedbackTone),
  };
}

/** The email admin@ gets when a Customer says something was off. */
export function routeFeedbackEmail({
  routeId,
  routeCode,
  customerName,
  byName,
  note,
  changed,
  appBaseUrl,
}: {
  routeId: string;
  routeCode: string;
  customerName: string;
  byName: string;
  note: string;
  changed: boolean;
  appBaseUrl: string;
}): { subject: string; text: string } {
  const link = `${appBaseUrl.replace(/\/$/, '')}/administrator/routes/detail?id=${routeId}`;
  const lines = [
    `${byName} (${customerName}) says something was off on Route ${routeCode}:`,
    '',
    note,
    '',
    ...(changed ? ['This replaces earlier feedback on this route.', ''] : []),
    `View the route: ${link}`,
  ];
  return { subject: `Route ${routeCode}: ${customerName} says ${routeFeedbackLabel('issue').toLowerCase()}`, text: lines.join('\n') };
}
