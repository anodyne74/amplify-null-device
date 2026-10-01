/**
 * Human-readable status text for a Stop, derived from its Stop Progress in
 * lib/stopProgress.ts — same split as lib/routeStatusHelpers.ts
 * (display) wrapping lib/signRunPhase.ts (facts). The single source of truth
 * for this copy so a wording fix (e.g. "Load signs" for planned routes, or a
 * skip reason suffix) lands once for every portal instead of being ported by
 * hand from one page's copy to another's.
 */
import { stopProgress, type ExecutionPhase } from './stopProgress';

export interface StatusLabelStop {
  notes?: string | null;
  serviceType?: string | null;
  actualDepartureTime?: string | null;
  actualArrivalTime?: string | null;
}

export function getStopStatusLabel(
  stop: StatusLabelStop,
  executionPhase?: ExecutionPhase | null,
  routeStatus?: string | null
) {
  // Completed/archived routes (including legacy imports, which force every
  // stop's serviceType to 'pickup' — see import-prep.js) always render fully
  // done, same convention as the route-level phase overview; the
  // placement/pickup phase split only applies to routes still in progress.
  if (executionPhase && routeStatus !== 'completed' && routeStatus !== 'archived') {
    const { state, reason } = stopProgress(stop)[executionPhase];
    if (state === 'skipped') {
      const base = executionPhase === 'pickup' ? 'Pickup skipped' : 'Placement skipped';
      return reason ? `${base} · ${reason}` : base;
    }
    if (state === 'done') {
      return executionPhase === 'pickup' ? 'Signs collected' : 'Signs placed';
    }
    // The route hasn't started yet, so there's nothing to be "awaiting" —
    // the operator still needs to load the signs onto the vehicle.
    if (routeStatus === 'planned' && executionPhase === 'placement') {
      return 'Load signs';
    }
    return executionPhase === 'pickup' ? 'Awaiting pickup' : 'Awaiting placement';
  }

  if (stop.actualDepartureTime) {
    return stop.serviceType === 'pickup' ? 'Signs collected' : 'Signs placed';
  }
  if (stop.actualArrivalTime) return 'At stop';
  return 'Signs pending';
}
