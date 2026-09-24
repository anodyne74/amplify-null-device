/**
 * Human-readable status text for a Stop, derived from the marker facts in
 * lib/stopExecutionMarkers.ts — same split as lib/routeStatusHelpers.ts
 * (display) wrapping lib/signRunPhase.ts (facts). The single source of truth
 * for this copy so a wording fix (e.g. "Load signs" for planned routes, or a
 * skip reason suffix) lands once for every portal instead of being ported by
 * hand from one page's copy to another's.
 */
import {
  getMarkerReason,
  isStopCompletedForPhase,
  isStopSkippedForPhase,
  PICKUP_SKIPPED_MARKER,
  PLACEMENT_SKIPPED_MARKER,
  type ExecutionPhase,
} from './stopExecutionMarkers';

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
    if (isStopSkippedForPhase(stop, executionPhase)) {
      const marker = executionPhase === 'pickup' ? PICKUP_SKIPPED_MARKER : PLACEMENT_SKIPPED_MARKER;
      const reason = getMarkerReason(stop.notes, marker);
      const base = executionPhase === 'pickup' ? 'Pickup skipped' : 'Placement skipped';
      return reason ? `${base} · ${reason}` : base;
    }
    if (isStopCompletedForPhase(stop, executionPhase)) {
      return executionPhase === 'pickup' ? 'Signs collected' : 'Signs placed';
    }
    // The route hasn't started yet, so there's nothing to be "awaiting" —
    // the operator still needs to load the signs onto the vehicle.
    if (routeStatus === 'planned' && executionPhase === 'placement') {
      return 'Load signs';
    }
    return executionPhase === 'pickup' ? 'Awaiting pickup' : 'Awaiting placement';
  }

  if (stop.notes?.startsWith('[SKIPPED]')) return 'Signs skipped';
  if (stop.actualDepartureTime) {
    return stop.serviceType === 'pickup' ? 'Signs collected' : 'Signs placed';
  }
  if (stop.actualArrivalTime) return 'At stop';
  return 'Signs pending';
}
