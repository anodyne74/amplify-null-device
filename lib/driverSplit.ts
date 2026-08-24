/**
 * Driver split computation — the share of a customer's billed amount owed to the
 * operator(s) assigned on their routes for a given period.
 *
 * Billed amount per route falls back to route.actualDurationMinutes × billingRatePerHour
 * for customers with no RateLine-driven LineItems, mirroring the same backward-compatible
 * flat-rate fallback used by invoice creation.
 */
import { getDataClient } from '@/lib/data-client';

export interface OperatorSplitSummary {
  operatorSub: string;
  /** Best-effort display name, denormalized from Route.assignedOperatorName — Operators
   * have no queryable directory of their own (see Route.assignedOperatorSub comment). */
  operatorName?: string;
  billedAmount: number;
  stopCount: number;
  driverShare: number;
}

export interface DriverSplitResult {
  periodStartDate: string;
  periodEndDate: string;
  totalBilled: number;
  totalStopCount: number;
  totalDriverShare: number;
  retained: number;
  byOperator: OperatorSplitSummary[];
}

export interface ComputeDriverSplitParams {
  customerId: string;
  billingRatePerHour: number;
  driverSplitPercent: number;
  paySplitOnCompletedStopsOnly?: boolean;
  periodStartDate: string; // YYYY-MM-DD
  periodEndDate: string; // YYYY-MM-DD
}

function inPeriod(dateStr: string | null | undefined, start: string, end: string) {
  if (!dateStr) return false;
  const day = dateStr.slice(0, 10);
  return day >= start && day <= end;
}

export async function computeDriverSplit(params: ComputeDriverSplitParams): Promise<DriverSplitResult> {
  const { customerId, billingRatePerHour, driverSplitPercent, paySplitOnCompletedStopsOnly, periodStartDate, periodEndDate } =
    params;

  const client = getDataClient();

  const { data: completedRoutes } = await client.models.Route.list({
    filter: { customerId: { eq: customerId }, status: { eq: 'completed' } },
    limit: 200,
  });

  let routes = (completedRoutes || []).filter((route) =>
    inPeriod(route.actualEndTime || route.updatedAt || route.createdAt, periodStartDate, periodEndDate)
  );

  const { data: customerStops } = await client.models.Stop.list({
    filter: { customerId: { eq: customerId } },
    limit: 1000,
  });

  const stopsByRoute = new Map<string, typeof customerStops>();
  for (const stop of customerStops || []) {
    if (!stop.routeId) continue;
    const list = stopsByRoute.get(stop.routeId) || [];
    list.push(stop);
    stopsByRoute.set(stop.routeId, list);
  }

  if (paySplitOnCompletedStopsOnly) {
    routes = routes.filter((route) => {
      const routeStops = stopsByRoute.get(route.id) || [];
      return routeStops.length > 0 && routeStops.every((stop) => !!stop.actualDepartureTime);
    });
  }

  const { data: customerLineItems } = await client.models.LineItem.list({
    filter: { customerId: { eq: customerId } },
    limit: 1000,
  });

  const lineItemTotalByRoute = new Map<string, number>();
  for (const item of customerLineItems || []) {
    if (!item.routeId) continue;
    lineItemTotalByRoute.set(item.routeId, (lineItemTotalByRoute.get(item.routeId) || 0) + (item.amount || 0));
  }

  const byOperatorMap = new Map<string, { operatorName?: string; billedAmount: number; stopCount: number }>();

  for (const route of routes) {
    const operatorSub = route.assignedOperatorSub || 'unassigned';
    const lineItemTotal = lineItemTotalByRoute.get(route.id);
    const billedAmount =
      lineItemTotal !== undefined ? lineItemTotal : ((route.actualDurationMinutes || 0) / 60) * billingRatePerHour;
    const stopCount = (stopsByRoute.get(route.id) || []).length;

    const existing = byOperatorMap.get(operatorSub) || { operatorName: route.assignedOperatorName || undefined, billedAmount: 0, stopCount: 0 };
    existing.billedAmount += billedAmount;
    existing.stopCount += stopCount;
    if (!existing.operatorName && route.assignedOperatorName) existing.operatorName = route.assignedOperatorName;
    byOperatorMap.set(operatorSub, existing);
  }

  const splitFraction = driverSplitPercent / 100;
  const byOperator: OperatorSplitSummary[] = Array.from(byOperatorMap.entries()).map(([operatorSub, totals]) => ({
    operatorSub,
    operatorName: totals.operatorName,
    billedAmount: Number(totals.billedAmount.toFixed(2)),
    stopCount: totals.stopCount,
    driverShare: Number((totals.billedAmount * splitFraction).toFixed(2)),
  }));

  const totalBilled = Number(byOperator.reduce((sum, o) => sum + o.billedAmount, 0).toFixed(2));
  const totalStopCount = byOperator.reduce((sum, o) => sum + o.stopCount, 0);
  const totalDriverShare = Number(byOperator.reduce((sum, o) => sum + o.driverShare, 0).toFixed(2));
  const retained = Number((totalBilled - totalDriverShare).toFixed(2));

  return {
    periodStartDate,
    periodEndDate,
    totalBilled,
    totalStopCount,
    totalDriverShare,
    retained,
    byOperator,
  };
}
