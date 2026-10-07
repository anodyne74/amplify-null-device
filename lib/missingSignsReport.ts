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
 * Who gets it: the Customer's invoice recipients (lib/invoiceRecipients.ts)
 * with admin@ copied, each address once whatever its case. With no Billing
 * email the billing CCs are addressed instead; with no Customer address at
 * all it goes to admin@ alone.
 */
export function missingSignsReportRecipients({
  invoiceRecipients,
  adminEmail,
}: {
  invoiceRecipients: { to: string | null; cc: string[] };
  adminEmail: string;
}): { to: string[]; cc: string[] } {
  const customerCc = invoiceRecipients.to ? invoiceRecipients.cc : [];
  const to = invoiceRecipients.to ? [invoiceRecipients.to] : invoiceRecipients.cc;
  if (to.length === 0) return { to: [adminEmail], cc: [] };
  const all = [...to, ...customerCc].map((address) => address.toLowerCase());
  return { to, cc: all.includes(adminEmail.toLowerCase()) ? customerCc : [...customerCc, adminEmail] };
}

const signs = (count: number) => `${count} ${count === 1 ? 'sign' : 'signs'}`;

/** What the Missing Signs Report SES template (amplify/ses/missingSignsReportTemplate.ts) fills in. */
export interface MissingSignsReportTemplateData {
  customerName: string;
  routeCode: string;
  placedDate: string;
  collectedDate: string;
  properties: { address: string; missingLabel: string }[];
  totalLabel: string;
  logoUrl: string;
  year: string;
}

/**
 * The email itself: Properties and signs only, as the Customer sees them.
 * Values are left as written -- the template escapes them.
 */
export function missingSignsReportEmail({
  routeCode,
  customerName,
  placementDate,
  pickupDate,
  properties,
  total,
  logoUrl,
  year,
}: {
  routeCode: string;
  customerName: string;
  placementDate?: string | null;
  pickupDate?: string | null;
  properties: MissingSignsProperty[];
  total: number;
  logoUrl: string;
  year: string;
}): { subject: string; templateData: MissingSignsReportTemplateData } {
  return {
    subject: `Missing signs on Route ${routeCode}`,
    templateData: {
      customerName,
      routeCode,
      placedDate: formatRouteDate(placementDate),
      collectedDate: formatRouteDate(pickupDate),
      properties: properties.map((property) => ({ address: property.address, missingLabel: signs(property.missing) })),
      totalLabel: signs(total),
      logoUrl,
      year,
    },
  };
}
