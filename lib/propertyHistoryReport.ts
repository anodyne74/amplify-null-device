/**
 * Property History Reports (CONTEXT.md "Property History Report", #291): the
 * pure half of generating, filing and showing them. A report is a frozen PDF
 * snapshot of one search (ADR 0002), rendered on the server (ADR 0003) by
 * lib/server/propertyHistoryReports.ts.
 */
import type { PropertyGroup, PropertyHistoryAudience, PropertyHistoryFilters, PropertyHistoryResult, PropertyHistorySearch } from '@/lib/propertyHistory';
import { propertyKeyLabel, streetLabel, suburbLabel } from '@/lib/propertyKey';
import { reportState, type ReportDates, type ReportState } from '@/lib/reportRetention';

export { reportRetention } from '@/lib/reportRetention';

const REFERENCE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** A report as the Reports tab lists it. */
export interface PropertyHistoryReportSummary {
  id: string;
  referenceNumber: string;
  audience: PropertyHistoryAudience;
  customerId: string | null;
  /** Null for an all-customers report. */
  customerName: string | null;
  generatedByName: string;
  generatedAt: string;
  searchLabel: string;
  filterLabels: string[];
  propertyCount: number;
  visitCount: number;
  /** Customers only ever see active reports (lib/reportRetention.ts). */
  state: ReportState;
  activeUntil: string;
  purgeAfter: string;
}

/** Whose reports a caller may list and open. */
export type ReportViewer = { audience: 'customer'; customerId: string } | { audience: 'administrator' };

/** e.g. PHR-20260927-4K7Q2M: the generation date (UTC) and six random characters. */
export function newReportReference(now: Date, random: () => number = Math.random): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Array.from({ length: 6 }, () => REFERENCE_ALPHABET[Math.floor(random() * REFERENCE_ALPHABET.length)]).join('');
  return `PHR-${date}-${suffix}`;
}

/** Where the PDF lives: under its Customer, or all-customers for a report across them. */
export function reportObjectKey(customerId: string | null, referenceNumber: string): string {
  return `reports/${customerId ?? 'all-customers'}/${referenceNumber}.pdf`;
}

/** Every Property in a result, in the order it's shown. */
export function resultProperties(result: PropertyHistoryResult): PropertyGroup[] {
  switch (result.level) {
    case 'suburb':
      return result.streets.flatMap((street) => street.properties);
    case 'street':
      return result.properties;
    case 'address':
      return result.property ? [result.property] : [];
  }
}

export function countPropertyHistory(result: PropertyHistoryResult): { propertyCount: number; visitCount: number } {
  const properties = resultProperties(result);
  return { propertyCount: properties.length, visitCount: properties.reduce((total, property) => total + property.visitCount, 0) };
}

/** The search as a report's header names it. */
export function describeSearch(search: PropertyHistorySearch, result: PropertyHistoryResult): string {
  switch (search.level) {
    case 'suburb':
      return `Suburb: ${suburbLabel(search.suburb, search.postcode ?? '')}`;
    case 'street':
      return `Street: ${streetLabel(search)}`;
    case 'address': {
      const found = result.level === 'address' ? result.property?.address : undefined;
      return `Address: ${found || propertyKeyLabel(search.propertyKey)}`;
    }
  }
}

/** The filters as a report's header lists them. */
export function describeFilters(filters: PropertyHistoryFilters, customerName: string | null): string[] {
  const labels = [
    filters.dateFrom && `From ${filters.dateFrom}`,
    filters.dateTo && `To ${filters.dateTo}`,
    filters.agent && `Agent: ${filters.agent}`,
    filters.auction !== undefined && (filters.auction ? 'Auction only' : 'Not auction'),
    filters.customerId && `Customer: ${customerName ?? filters.customerId}`,
  ].filter((label): label is string => typeof label === 'string');
  return labels.length > 0 ? labels : ['No filters'];
}

/** What the report rules need to know about a report. */
export type ReportAccessFacts = { audience: PropertyHistoryAudience; customerId?: string | null } & ReportDates;

/**
 * Account Owners share their Customer's active customer reports; reports an
 * administrator generated are for administrators only, whichever Customer
 * they cover. Administrators also see deleted and purged reports (#292).
 */
export function canSeeReport(report: ReportAccessFacts, viewer: ReportViewer, now: Date): boolean {
  if (viewer.audience === 'administrator') return true;
  return report.audience === 'customer' && report.customerId === viewer.customerId && reportState(report, now) === 'active';
}

/** A purged report is a stub: its PDF is gone. */
export function canOpenReport(report: ReportAccessFacts, viewer: ReportViewer, now: Date): boolean {
  return canSeeReport(report, viewer, now) && reportState(report, now) !== 'purged';
}

/** An Account Owner's manual delete: an early soft delete of an active report they can see. */
export function canDeleteReport(report: ReportAccessFacts, viewer: ReportViewer, now: Date): boolean {
  return viewer.audience === 'customer' && canSeeReport(report, viewer, now);
}

/** Only administrators restore, and only a soft-deleted report -- a purged one is gone for good. */
export function canRestoreReport(report: ReportAccessFacts, viewer: ReportViewer, now: Date): boolean {
  return viewer.audience === 'administrator' && reportState(report, now) === 'deleted';
}
