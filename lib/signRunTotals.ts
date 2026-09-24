/**
 * Sign-count facts about a Route's stops — pure and side-effect free, same style as
 * lib/signRunPhase.ts / lib/signRunBilling.ts. The single source of truth for "how
 * many signs" a Route has, so every portal reports the same number for the same
 * question instead of each screen re-deriving its own variant.
 */
import { isStopCompletedForPhase, isStopSkippedForPhase } from './stopExecutionMarkers';

export interface SignCountStop {
  notes?: string | null;
  serviceType?: string | null;
  actualDepartureTime?: string | null;
  numberOfSigns?: number | null;
  missingSignsCount?: number | null;
}

/** Gross count of signs placed on a Route — sum of numberOfSigns, no exclusions.
 * "How many signs are on this route," independent of what happens afterward. */
export function signsPlaced(stops: SignCountStop[]): number {
  return stops.reduce((sum, stop) => sum + (stop.numberOfSigns ?? 0), 0);
}

/** Net count of signs actually recovered during Pickup — summed only over stops that
 * were completed (not skipped), each stop's contribution reduced by its own missing
 * signs. Missing signs never count as collected — see Stop.missingSignsCount's schema
 * comment. A route with stops still in progress reports a partial, growing total. */
export function signsCollected(stops: SignCountStop[]): number {
  return stops.reduce((sum, stop) => {
    if (!isStopCompletedForPhase(stop, 'pickup') || isStopSkippedForPhase(stop, 'pickup')) {
      return sum;
    }
    return sum + Math.max(0, (stop.numberOfSigns ?? 0) - (stop.missingSignsCount ?? 0));
  }, 0);
}

/** Total signs logged missing across every stop, regardless of completion status —
 * tracked independently of reconciliation/billing to identify locations with high
 * loss rates (sign attrition). */
export function missingSigns(stops: SignCountStop[]): number {
  return stops.reduce((sum, stop) => sum + (stop.missingSignsCount ?? 0), 0);
}

/** Groups stops by agent, preserving first-appearance order, with stops that have no
 * agent bucketed under "Unassigned" rather than dropped. Bare grouping only — callers
 * derive their own per-group aggregate (e.g. a sign count, or a timed/blank split). */
export function groupByAgent<T extends { agent?: string | null }>(
  stops: T[]
): Array<{ agent: string; stops: T[] }> {
  const order: string[] = [];
  const byAgent = new Map<string, T[]>();

  for (const stop of stops) {
    const agent = stop.agent?.trim() || 'Unassigned';
    if (!byAgent.has(agent)) {
      byAgent.set(agent, []);
      order.push(agent);
    }
    byAgent.get(agent)!.push(stop);
  }

  return order.map((agent) => ({ agent, stops: byAgent.get(agent)! }));
}
