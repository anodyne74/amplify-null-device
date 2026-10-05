/**
 * The Missing Signs Report (CONTEXT.md): one email after a Route is finalised,
 * listing each Property where signs went missing. Sent only when an
 * administrator has switched reports on for the Customer, the Customer still
 * wants them, and some signs are missing. Pure, so the API route that sends it
 * (app/api/missing-signs-report) and its tests share the rules.
 */
import type { Route, Stop } from '@/amplify/types';
import { activeStops } from './loadChange';
import { missingSigns } from './signRunTotals';
import { formatRouteDate } from './routeDetailHelpers';

export interface MissingSignsProperty {
  address: string;
  missing: number;
}

type ReportRoute = Pick<Route, 'status'> & { missingSignsReportSentAt?: string | null };
type ReportCustomer = { missingSignsReportEnabled?: boolean | null; sendMissingSignsReport?: boolean | null };
type ReportStop = Pick<Stop, 'address' | 'formattedAddress' | 'missingSignsCount' | 'removed'>;

/** Whether to send this Route's report, and what it lists; or why not. */
export function missingSignsReportDecision({
  route,
  customer,
  stops,
}: {
  route: ReportRoute;
  customer: ReportCustomer;
  stops: ReportStop[];
}): { send: true; total: number; properties: MissingSignsProperty[] } | { send: false; reason: string } {
  if (route.status !== 'completed' && route.status !== 'archived') return { send: false, reason: 'route not finalised' };
  if (route.missingSignsReportSentAt) return { send: false, reason: 'already sent' };
  if (customer.missingSignsReportEnabled !== true) return { send: false, reason: 'reports not switched on for this customer' };
  if (customer.sendMissingSignsReport === false) return { send: false, reason: 'customer has turned reports off' };

  const total = missingSigns(stops);
  if (total === 0) return { send: false, reason: 'no missing signs' };

  const properties = activeStops(stops)
    .filter((stop) => (stop.missingSignsCount ?? 0) > 0)
    .map((stop) => ({ address: stop.formattedAddress || stop.address || 'Unknown address', missing: stop.missingSignsCount ?? 0 }));
  return { send: true, total, properties };
}

/**
 * Who gets it: the invoice recipient and the Customer's billing CCs, with
 * admin@ copied. Each address once, whatever its case. With no Customer
 * address it goes to admin@ alone.
 */
export function missingSignsReportRecipients({
  invoiceRecipient,
  billingCcEmails,
  adminEmail,
}: {
  invoiceRecipient: string | null | undefined;
  billingCcEmails: ReadonlyArray<string | null> | null | undefined;
  adminEmail: string;
}): { to: string[]; cc: string[] } {
  const seen = new Set<string>([adminEmail.toLowerCase()]);
  const to: string[] = [];
  for (const raw of [invoiceRecipient, ...(billingCcEmails ?? [])]) {
    const address = raw?.trim();
    if (!address || seen.has(address.toLowerCase())) continue;
    seen.add(address.toLowerCase());
    to.push(address);
  }
  return to.length > 0 ? { to, cc: [adminEmail] } : { to: [adminEmail], cc: [] };
}

const signs = (count: number) => `${count} ${count === 1 ? 'sign' : 'signs'}`;

/** The email itself: Properties and signs only, as the Customer sees them. */
export function missingSignsReportEmail({
  routeCode,
  customerName,
  placementDate,
  pickupDate,
  properties,
  total,
}: {
  routeCode: string;
  customerName: string;
  placementDate?: string | null;
  pickupDate?: string | null;
  properties: MissingSignsProperty[];
  total: number;
}): { subject: string; text: string } {
  const lines = [
    `Hello ${customerName},`,
    '',
    `When we collected the signs for Route ${routeCode}, some couldn't be found:`,
    '',
    ...properties.map((property) => `• ${property.address} — ${signs(property.missing)}`),
    '',
    `${signs(total)} missing in total.`,
    '',
    `Placed ${formatRouteDate(placementDate)}, collected ${formatRouteDate(pickupDate)}.`,
  ];
  return { subject: `Missing signs on Route ${routeCode}`, text: lines.join('\n') };
}
