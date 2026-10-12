/**
 * Payout summaries for an Operator (see Payout and Outstanding in CONTEXT.md):
 * paid, outstanding, routes completed, average per route and largest payout,
 * for all time, the year to date and each month.
 *
 * A Payout belongs to the month of its period's end date, falling back to when
 * it was raised (marked estimated). A Route belongs to the month of its end time,
 * falling back to its scheduled date. A Payout or Route with no date at all is in
 * the all-time figures only.
 */
import { isRouteCompleted } from '@/lib/signRunPhase';

export interface SummaryPayout {
  id: string;
  amount: number;
  status?: string | null;
  periodEndDate?: string | null;
  createdAt?: string | null;
}

export interface SummaryRoute {
  id: string;
  status?: string | null;
  actualEndTime?: string | null;
  scheduledDate?: string | null;
}

export interface PayoutPeriodSummary {
  paid: number;
  outstanding: number;
  routesCompleted: number;
  /** (paid + outstanding) / routes completed; null when no route was completed. */
  averagePerRoute: number | null;
  /** The biggest single Payout; null when there were none. */
  largest: number | null;
}

export interface MonthSummary extends PayoutPeriodSummary {
  /** YYYY-MM */
  key: string;
}

export interface PayoutSummary {
  allTime: PayoutPeriodSummary;
  yearToDate: PayoutPeriodSummary;
  /** Every month with a Payout or a completed Route, newest first. */
  months: MonthSummary[];
}

const cents = (value: number) => Math.round(value * 100) / 100;

/** The day (YYYY-MM-DD) a Payout counts in, and whether it was guessed from when it was raised. */
export function payoutDate(payout: Pick<SummaryPayout, 'periodEndDate' | 'createdAt'>) {
  if (payout.periodEndDate) return { day: payout.periodEndDate.slice(0, 10), estimated: false };
  if (payout.createdAt) return { day: payout.createdAt.slice(0, 10), estimated: true };
  return null;
}

function routeDay(route: SummaryRoute): string | null {
  return (route.actualEndTime || route.scheduledDate || '').slice(0, 10) || null;
}

/** What is Outstanding: the total of the Pending Payouts. */
export function outstandingTotal(payouts: Pick<SummaryPayout, 'amount' | 'status'>[]): number {
  return cents(payouts.reduce((sum, p) => (p.status === 'pending' ? sum + p.amount : sum), 0));
}

function summarise(payouts: SummaryPayout[], routes: SummaryRoute[]): PayoutPeriodSummary {
  const paid = cents(payouts.reduce((sum, p) => (p.status === 'paid' ? sum + p.amount : sum), 0));
  const outstanding = outstandingTotal(payouts);
  return {
    paid,
    outstanding,
    routesCompleted: routes.length,
    averagePerRoute: routes.length > 0 ? cents((paid + outstanding) / routes.length) : null,
    largest: payouts.length > 0 ? Math.max(...payouts.map((p) => p.amount)) : null,
  };
}

export function summarisePayouts(
  payouts: SummaryPayout[],
  routes: SummaryRoute[],
  now: Date = new Date()
): PayoutSummary {
  const completed = routes.filter((route) => isRouteCompleted(route.status));
  const yearStart = `${now.getFullYear()}-01-01`;

  const dated = payouts.map((payout) => ({ payout, day: payoutDate(payout)?.day ?? null }));
  const datedRoutes = completed.map((route) => ({ route, day: routeDay(route) }));

  const monthKeys = new Set<string>();
  for (const { day } of [...dated, ...datedRoutes]) if (day) monthKeys.add(day.slice(0, 7));

  const months = [...monthKeys]
    .sort()
    .reverse()
    .map((key) => ({
      key,
      ...summarise(
        dated.filter((d) => d.day?.startsWith(key)).map((d) => d.payout),
        datedRoutes.filter((d) => d.day?.startsWith(key)).map((d) => d.route)
      ),
    }));

  return {
    allTime: summarise(payouts, completed),
    yearToDate: summarise(
      dated.filter((d) => d.day && d.day >= yearStart).map((d) => d.payout),
      datedRoutes.filter((d) => d.day && d.day >= yearStart).map((d) => d.route)
    ),
    months,
  };
}
