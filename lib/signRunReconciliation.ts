/**
 * Reconciles what came back against what went out — Pickup's PICKUP_DONE/
 * PICKUP_SKIPPED markers and missingSignsCount (lib/stopExecutionMarkers.ts, set by
 * app/operator/routes/pickup/page.tsx) against Load's loadedSignsCount. Shared by
 * Unload and Finalise, which both reconcile the same Route the same way; Finalise
 * only displays a subset of the fields this returns.
 */
import { isStopCompletedForPhase, isStopSkippedForPhase } from './stopExecutionMarkers';
import { signsCollected, missingSigns, type SignCountStop } from './signRunTotals';

export interface ReconciliationRoute {
  loadedSignsCount?: number | null;
}

export interface SignRunReconciliation {
  returnedTotal: number;
  doneCount: number;
  skipCount: number;
  missingTotal: number;
  loadedTotal: number;
  stillOnSite: number;
}

export function reconcileSignRun(route: ReconciliationRoute, stops: SignCountStop[]): SignRunReconciliation {
  let doneCount = 0;
  let skipCount = 0;

  for (const stop of stops) {
    if (isStopSkippedForPhase(stop, 'pickup')) {
      skipCount += 1;
    } else if (isStopCompletedForPhase(stop, 'pickup')) {
      doneCount += 1;
    }
  }

  const returnedTotal = signsCollected(stops);
  const missingTotal = missingSigns(stops);
  const loadedTotal = route.loadedSignsCount ?? 0;
  const stillOnSite = Math.max(0, loadedTotal - returnedTotal - missingTotal);

  return { returnedTotal, doneCount, skipCount, missingTotal, loadedTotal, stillOnSite };
}
