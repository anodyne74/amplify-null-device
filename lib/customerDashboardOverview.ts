/**
 * Pure aggregation helpers for the customer dashboard
 * (app/customer/dashboard/page.tsx). Kept separate from the page so the
 * date-bucketing and grouping logic is unit-testable without rendering —
 * same split as lib/adminDashboardOverview.ts, which this reuses where the
 * computation is generic (e.g. summarizeSignsInField).
 */
import { getDateGroup } from './aggregateRouteData';
import { getDeltaPercent } from './dashboardAnalytics';
import { getRouteDate } from './routeDetailHelpers';
import { getRoutePhaseKey, ROUTE_PHASE_KEYS, type RoutePhaseInput, type RoutePhaseKey } from './signRunPhase';
import { signsPlaced } from './signRunTotals';

export interface OverviewRoute {
  id: string;
  routeCode?: string | null;
  status?: string | null;
  executionPhase?: string | null;
  scheduledDate?: string | null;
  actualEndTime?: string | null;
  actualStartTime?: string | null;
  createdAt?: string | null;
  loadConfirmedAt?: string | null;
  placementEndTime?: string | null;
  pickupEndTime?: string | null;
  unloadConfirmedAt?: string | null;
}

function phaseKeyOf(route: OverviewRoute): RoutePhaseKey {
  return getRoutePhaseKey(route as unknown as RoutePhaseInput);
}

export interface OverviewStop {
  id: string;
  routeId?: string | null;
  numberOfSigns?: number | null;
  agent?: string | null;
  address?: string | null;
  formattedAddress?: string | null;
  actualArrivalTime?: string | null;
  actualDepartureTime?: string | null;
  estimatedArrivalTime?: string | null;
}

export interface OverviewInvoice {
  id: string;
  totalAmount?: number | null;
  status?: string | null;
  invoiceDate?: string | null;
  createdAt?: string | null;
}

export type TrendDirection = 'up' | 'down' | 'flat';

function trend(current: number, previous: number): { deltaPercent: number; direction: TrendDirection } {
  const raw = getDeltaPercent(current, previous);
  return { deltaPercent: Math.abs(raw), direction: raw === 0 ? 'flat' : raw > 0 ? 'up' : 'down' };
}

function routeActivityDate(route: OverviewRoute): string | null {
  return route.actualEndTime || route.actualStartTime || route.createdAt || null;
}

function stopServiceDate(stop: OverviewStop): string | null {
  return stop.actualArrivalTime || stop.actualDepartureTime || stop.estimatedArrivalTime || null;
}

function previousMonthKey(now: Date): string {
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return getDateGroup(previous.toISOString(), 'month');
}

export interface PeriodActivitySummary {
  invoicedCurrent: number;
  invoicedDeltaPercent: number;
  invoicedDirection: TrendDirection;
  routesCompletedCurrent: number;
  routesCompletedDeltaPercent: number;
  routesCompletedDirection: TrendDirection;
  stopsServiced: number;
  signsHandled: number;
  avgCostPerStop: number;
  avgCostPerStopDeltaPercent: number;
  avgCostPerStopDirection: TrendDirection;
}

/**
 * This-month-vs-last-month activity, scoped to completed routes only (the
 * design's "Invoiced this month" / "Routes completed this month" / "Avg cost
 * per stop" stat tiles). Distinct from adminDashboardOverview's
 * summarizeRoutesStopsThisMonth, which counts any route with activity this
 * month (not just completed ones) — the wrong scope for "completed" here.
 */
export function summarizePeriodActivity(
  routes: OverviewRoute[],
  stops: OverviewStop[],
  invoices: OverviewInvoice[],
  now = new Date()
): PeriodActivitySummary {
  const thisMonthKey = getDateGroup(now.toISOString(), 'month');
  const lastMonthKey = previousMonthKey(now);

  const completedRoutes = routes.filter((route) => phaseKeyOf(route) === 'completed');
  const routesFor = (key: string) =>
    completedRoutes.filter((route) => {
      const date = routeActivityDate(route);
      return date ? getDateGroup(date, 'month') === key : false;
    });
  const currentRoutes = routesFor(thisMonthKey);
  const previousRoutes = routesFor(lastMonthKey);

  const stopsFor = (routeList: OverviewRoute[]) => {
    const routeIds = new Set(routeList.map((route) => route.id));
    return stops.filter((stop) => stop.routeId && routeIds.has(stop.routeId));
  };
  const currentStops = stopsFor(currentRoutes);
  const previousStops = stopsFor(previousRoutes);

  const invoicesFor = (key: string) =>
    invoices.filter((invoice) => invoice.invoiceDate && getDateGroup(invoice.invoiceDate, 'month') === key);
  const invoicedCurrent = invoicesFor(thisMonthKey).reduce((sum, invoice) => sum + (invoice.totalAmount || 0), 0);
  const invoicedPrevious = invoicesFor(lastMonthKey).reduce((sum, invoice) => sum + (invoice.totalAmount || 0), 0);

  const avgCostPerStop = currentStops.length === 0 ? 0 : invoicedCurrent / currentStops.length;
  const avgCostPerStopPrevious = previousStops.length === 0 ? 0 : invoicedPrevious / previousStops.length;

  const invoicedTrend = trend(invoicedCurrent, invoicedPrevious);
  const routesCompletedTrend = trend(currentRoutes.length, previousRoutes.length);
  const avgCostPerStopTrend = trend(avgCostPerStop, avgCostPerStopPrevious);

  return {
    invoicedCurrent,
    invoicedDeltaPercent: invoicedTrend.deltaPercent,
    invoicedDirection: invoicedTrend.direction,
    routesCompletedCurrent: currentRoutes.length,
    routesCompletedDeltaPercent: routesCompletedTrend.deltaPercent,
    routesCompletedDirection: routesCompletedTrend.direction,
    stopsServiced: currentStops.length,
    signsHandled: signsPlaced(currentStops),
    avgCostPerStop,
    avgCostPerStopDeltaPercent: avgCostPerStopTrend.deltaPercent,
    avgCostPerStopDirection: avgCostPerStopTrend.direction,
  };
}

/**
 * Picks the single most relevant route for the read-only "Current route" stat
 * tile — same phase-priority ordering as the dashboard's route tracker list
 * (earliest active phase first, since that route has the most work left),
 * planned next, completed/archived last. Returns null when the customer has
 * no routes at all.
 */
export function summarizeCurrentRoute(routes: OverviewRoute[]): OverviewRoute | null {
  if (routes.length === 0) return null;

  const priority = (route: OverviewRoute) => {
    const phaseKey = phaseKeyOf(route);
    if (phaseKey === 'planned') return ROUTE_PHASE_KEYS.length;
    if (phaseKey === 'completed') return ROUTE_PHASE_KEYS.length + 1;
    return ROUTE_PHASE_KEYS.indexOf(phaseKey);
  };

  return [...routes].sort((a, b) => {
    const delta = priority(a) - priority(b);
    if (delta !== 0) return delta;
    return String(getRouteDate(b) ?? '').localeCompare(String(getRouteDate(a) ?? ''));
  })[0];
}

/** Count of stops serviced (arrived/departed/estimated) in the current calendar week. */
export function summarizeStopsThisWeek(stops: OverviewStop[], now = new Date()): number {
  const thisWeekKey = getDateGroup(now.toISOString(), 'week');
  return stops.filter((stop) => {
    const date = stopServiceDate(stop);
    return date ? getDateGroup(date, 'week') === thisWeekKey : false;
  }).length;
}

export interface WeekListingRow {
  id: string;
  phaseKey: RoutePhaseKey;
  label: string;
  when: string;
}

/** This week's stop activity for the "This week" card — most recent first. */
export function summarizeThisWeekListings(
  stops: OverviewStop[],
  routes: OverviewRoute[],
  limit = 4,
  now = new Date()
): WeekListingRow[] {
  const routesById = new Map(routes.map((route) => [route.id, route]));
  const thisWeekKey = getDateGroup(now.toISOString(), 'week');

  return stops
    .map((stop) => ({ stop, date: stopServiceDate(stop) }))
    .filter((entry): entry is { stop: OverviewStop; date: string } => {
      if (!entry.date) return false;
      return getDateGroup(entry.date, 'week') === thisWeekKey;
    })
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map(({ stop, date }) => {
      const route = stop.routeId ? routesById.get(stop.routeId) : undefined;
      return {
        id: stop.id,
        phaseKey: route ? phaseKeyOf(route) : 'planned',
        label: stop.formattedAddress || stop.address || 'Address unavailable',
        when: new Date(date).toLocaleDateString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit' }),
      };
    });
}

export interface WeeklyStopsPoint {
  weekStart: string;
  stops: number;
}

/** Stops serviced per week, oldest to newest, for the read-only trend chart. */
export function summarizeStopsByWeek(stops: OverviewStop[], weeks = 5): WeeklyStopsPoint[] {
  const counts = new Map<string, number>();
  stops.forEach((stop) => {
    const date = stopServiceDate(stop);
    if (!date) return;
    const weekStart = getDateGroup(date, 'week');
    counts.set(weekStart, (counts.get(weekStart) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([weekStart, count]) => ({ weekStart, stops: count }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .slice(-weeks);
}

export interface WeeklySpendPoint {
  weekStart: string;
  amount: number;
}

/** Invoiced amount per week, oldest to newest, for the account owner's spend chart. */
export function summarizeSpendByWeek(invoices: OverviewInvoice[], weeks = 5): WeeklySpendPoint[] {
  const totals = new Map<string, number>();
  invoices.forEach((invoice) => {
    if (!invoice.invoiceDate) return;
    const weekStart = getDateGroup(invoice.invoiceDate, 'week');
    totals.set(weekStart, (totals.get(weekStart) || 0) + (invoice.totalAmount || 0));
  });

  return Array.from(totals.entries())
    .map(([weekStart, amount]) => ({ weekStart, amount }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .slice(-weeks);
}

export interface AgentActivityRow {
  id: string;
  agent: string;
  stops: number;
  signs: number;
}

/** Stops/signs grouped by the agent named on each stop, most active first. */
export function summarizeAgentActivity(stops: OverviewStop[]): AgentActivityRow[] {
  const stopsByAgent = new Map<string, OverviewStop[]>();

  stops.forEach((stop) => {
    const agent = stop.agent?.trim() || 'Unassigned';
    const agentStops = stopsByAgent.get(agent) ?? [];
    agentStops.push(stop);
    stopsByAgent.set(agent, agentStops);
  });

  return Array.from(stopsByAgent.entries())
    .map(([agent, agentStops]) => ({
      id: agent,
      agent,
      stops: agentStops.length,
      signs: signsPlaced(agentStops),
    }))
    .sort((a, b) => b.stops - a.stops);
}

export interface LatestInvoiceSummary {
  id: string;
  status: string;
  invoiceDate: string | null;
  totalAmount: number;
}

/** Most recently issued invoice, for the "Latest invoice" card. */
export function summarizeLatestInvoice(invoices: OverviewInvoice[]): LatestInvoiceSummary | null {
  if (invoices.length === 0) return null;

  const latest = [...invoices].sort((a, b) =>
    String(b.invoiceDate ?? b.createdAt ?? '').localeCompare(String(a.invoiceDate ?? a.createdAt ?? ''))
  )[0];

  return {
    id: latest.id,
    status: latest.status || 'draft',
    invoiceDate: latest.invoiceDate ?? null,
    totalAmount: latest.totalAmount || 0,
  };
}
