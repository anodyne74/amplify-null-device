/**
 * Pure aggregation helpers for the administrator dashboard overview
 * (app/administrator/dashboard/page.tsx). Kept separate from the page so the
 * date-bucketing and grouping logic is unit-testable without rendering.
 */
import { getDateGroup } from './aggregateRouteData';
import { getDeltaPercent, formatCurrency } from './dashboardAnalytics';

export interface OverviewRoute {
  id: string;
  customerId?: string | null;
  status?: string | null;
  actualEndTime?: string | null;
  actualStartTime?: string | null;
  createdAt?: string | null;
}

export interface OverviewInvoice {
  id: string;
  customerId?: string | null;
  totalAmount?: number | null;
  invoiceDate?: string | null;
  // Loosely typed: some callers carry a legacy 'finalized' status alongside the
  // current draft/sent/paid enum — only 'paid' and 'sent' are checked here.
  status?: string | null;
}

export interface OverviewStop {
  id: string;
  routeId?: string | null;
  numberOfSigns?: number | null;
}

export interface OverviewCustomer {
  id: string;
  name?: string | null;
}

export interface OverviewCustomerUser {
  customerId?: string | null;
  role?: string | null;
}

export type TrendDirection = 'up' | 'down' | 'flat';

const PAST_DUE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function routeActivityDate(route: OverviewRoute): string | null {
  return route.actualEndTime || route.actualStartTime || route.createdAt || null;
}

function previousMonthKey(now: Date): string {
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return getDateGroup(previous.toISOString(), 'month');
}

function trend(current: number, previous: number): { deltaPercent: number; direction: TrendDirection } {
  const raw = getDeltaPercent(current, previous);
  return { deltaPercent: Math.abs(raw), direction: raw === 0 ? 'flat' : raw > 0 ? 'up' : 'down' };
}

export interface BilledSummary {
  currentTotal: number;
  previousTotal: number;
  deltaPercent: number;
  direction: TrendDirection;
  customerCount: number;
}

/** Sums invoiced totals for the current calendar month vs the previous one. */
export function summarizeBilledThisMonth(invoices: OverviewInvoice[], now = new Date()): BilledSummary {
  const thisMonthKey = getDateGroup(now.toISOString(), 'month');
  const lastMonthKey = previousMonthKey(now);

  const currentInvoices = invoices.filter((inv) => inv.invoiceDate && getDateGroup(inv.invoiceDate, 'month') === thisMonthKey);
  const previousInvoices = invoices.filter((inv) => inv.invoiceDate && getDateGroup(inv.invoiceDate, 'month') === lastMonthKey);

  const currentTotal = currentInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
  const previousTotal = previousInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);

  return {
    currentTotal,
    previousTotal,
    customerCount: new Set(currentInvoices.map((inv) => inv.customerId).filter(Boolean)).size,
    ...trend(currentTotal, previousTotal),
  };
}

export interface RoutesStopsSummary {
  currentRoutes: number;
  previousRoutes: number;
  deltaPercent: number;
  direction: TrendDirection;
  stopsServiced: number;
}

/** Counts routes serviced this month (vs last) and the stops on them. */
export function summarizeRoutesStopsThisMonth(
  routes: OverviewRoute[],
  stops: OverviewStop[],
  now = new Date()
): RoutesStopsSummary {
  const thisMonthKey = getDateGroup(now.toISOString(), 'month');
  const lastMonthKey = previousMonthKey(now);

  const currentRoutes = routes.filter((route) => {
    const date = routeActivityDate(route);
    return date ? getDateGroup(date, 'month') === thisMonthKey : false;
  });
  const previousRoutes = routes.filter((route) => {
    const date = routeActivityDate(route);
    return date ? getDateGroup(date, 'month') === lastMonthKey : false;
  });

  const currentRouteIds = new Set(currentRoutes.map((route) => route.id));
  const stopsServiced = stops.filter((stop) => stop.routeId && currentRouteIds.has(stop.routeId)).length;

  return {
    currentRoutes: currentRoutes.length,
    previousRoutes: previousRoutes.length,
    stopsServiced,
    ...trend(currentRoutes.length, previousRoutes.length),
  };
}

export interface OutstandingSummary {
  total: number;
  pastDueCount: number;
}

/** Total unpaid invoice value, plus a count of sent invoices unpaid 30+ days. */
export function summarizeOutstanding(invoices: OverviewInvoice[], now = new Date()): OutstandingSummary {
  const unpaid = invoices.filter((inv) => inv.status && inv.status !== 'paid');
  const total = unpaid.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);

  const pastDueCount = unpaid.filter((inv) => {
    if (inv.status !== 'sent' || !inv.invoiceDate) return false;
    const ageDays = (now.getTime() - new Date(inv.invoiceDate).getTime()) / DAY_MS;
    return ageDays >= PAST_DUE_DAYS;
  }).length;

  return { total, pastDueCount };
}

/** Signs currently placed (not yet picked up), summed across in-progress routes. */
export function summarizeSignsInField(routes: OverviewRoute[], stops: OverviewStop[]): number {
  const placedRouteIds = new Set(routes.filter((route) => route.status === 'signs_placed').map((route) => route.id));
  return stops
    .filter((stop) => stop.routeId && placedRouteIds.has(stop.routeId))
    .reduce((sum, stop) => sum + (stop.numberOfSigns || 0), 0);
}

export const ROUTE_STATUS_ORDER = ['planned', 'in_progress', 'signs_placed', 'signs_picked_up', 'completed'] as const;
export type OrderedRouteStatus = (typeof ROUTE_STATUS_ORDER)[number];

/** Route counts by status, across every customer — archived routes are excluded (not operationally active). */
export function summarizeRouteStatusCounts(routes: OverviewRoute[]): Record<OrderedRouteStatus, number> {
  const counts = Object.fromEntries(ROUTE_STATUS_ORDER.map((status) => [status, 0])) as Record<OrderedRouteStatus, number>;
  routes.forEach((route) => {
    const status = route.status as OrderedRouteStatus;
    if (status && status in counts) counts[status] += 1;
  });
  return counts;
}

export interface CustomerVolumeRow {
  id: string;
  name: string;
  routes: number;
  stops: number;
  signs: number;
  billed: number;
}

/** Per-customer routes/stops/signs/billed totals over the trailing window (default 30 days). */
export function summarizeCustomersByVolume(
  customers: OverviewCustomer[],
  routes: OverviewRoute[],
  stops: OverviewStop[],
  invoices: OverviewInvoice[],
  now = new Date(),
  windowDays = 30
): CustomerVolumeRow[] {
  const cutoff = now.getTime() - windowDays * DAY_MS;

  const recentRoutes = routes.filter((route) => {
    const date = routeActivityDate(route);
    return date ? new Date(date).getTime() >= cutoff : false;
  });

  const routeIdsByCustomer = new Map<string, Set<string>>();
  recentRoutes.forEach((route) => {
    if (!route.customerId) return;
    if (!routeIdsByCustomer.has(route.customerId)) routeIdsByCustomer.set(route.customerId, new Set());
    routeIdsByCustomer.get(route.customerId)!.add(route.id);
  });

  const recentInvoices = invoices.filter((inv) => inv.invoiceDate && new Date(inv.invoiceDate).getTime() >= cutoff);

  return customers
    .map((customer) => {
      const routeIds = routeIdsByCustomer.get(customer.id) ?? new Set<string>();
      const customerStops = stops.filter((stop) => stop.routeId && routeIds.has(stop.routeId));
      const billed = recentInvoices
        .filter((inv) => inv.customerId === customer.id)
        .reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);

      return {
        id: customer.id,
        name: customer.name || customer.id,
        routes: routeIds.size,
        stops: customerStops.length,
        signs: customerStops.reduce((sum, stop) => sum + (stop.numberOfSigns || 0), 0),
        billed,
      };
    })
    .filter((row) => row.routes > 0 || row.billed > 0)
    .sort((a, b) => b.stops - a.stops || b.billed - a.billed);
}

export interface AttentionItem {
  id: string;
  title: string;
  detail: string;
  amount?: string;
  tone: 'danger' | 'warning';
}

/** Money (past-due invoices) and access (customers with no account owner) issues, worst first. */
export function summarizeNeedsAttention(
  invoices: OverviewInvoice[],
  customers: OverviewCustomer[],
  customerUsers: OverviewCustomerUser[],
  now = new Date()
): AttentionItem[] {
  const customerName = (id?: string | null) => customers.find((customer) => customer.id === id)?.name || 'Unknown customer';

  const overdue = invoices
    .filter((inv) => inv.status === 'sent' && inv.invoiceDate)
    .map((inv) => ({
      inv,
      ageDays: Math.floor((now.getTime() - new Date(inv.invoiceDate as string).getTime()) / DAY_MS),
    }))
    .filter(({ ageDays }) => ageDays >= PAST_DUE_DAYS)
    .sort((a, b) => b.ageDays - a.ageDays)
    .map(({ inv, ageDays }): AttentionItem => ({
      id: `overdue-${inv.id}`,
      title: customerName(inv.customerId),
      detail: `${ageDays} days overdue`,
      amount: formatCurrency(inv.totalAmount || 0),
      tone: 'danger',
    }));

  const customersWithOwner = new Set(
    customerUsers.filter((user) => user.role === 'account_owner' && user.customerId).map((user) => user.customerId as string)
  );
  const missingOwner = customers
    .filter((customer) => !customersWithOwner.has(customer.id))
    .map((customer): AttentionItem => ({
      id: `owner-${customer.id}`,
      title: customer.name || customer.id,
      detail: 'No account owner set',
      tone: 'warning',
    }));

  return [...overdue, ...missingOwner].slice(0, 6);
}

/** Short "11 Aug" label for a week-bucket's ISO start date (from getDateGroup(date, 'week')). */
export function formatWeekLabel(weekStartIso: string): string {
  const date = new Date(weekStartIso);
  if (Number.isNaN(date.getTime())) return weekStartIso;
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}
