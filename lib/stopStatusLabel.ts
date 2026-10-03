/**
 * Human-readable status text for a Stop, derived from its Stop Progress in
 * lib/stopProgress.ts — same split as lib/routeStatusHelpers.ts
 * (display) wrapping lib/signRunPhase.ts (facts). The single source of truth
 * for this copy so a wording fix (e.g. "Load signs" for planned routes, or a
 * skip reason suffix) lands once for every portal instead of being ported by
 * hand from one page's copy to another's.
 */
import { stopProgress, type ExecutionPhase, type StopProgressStop } from './stopProgress';

export interface StatusLabelStop {
  notes?: string | null;
  actualDepartureTime?: string | null;
  actualArrivalTime?: string | null;
}

/**
 * The phase a Stop's status is shown for. On a completed/archived route (and
 * with no phase given) each stop is labelled by Pickup, its last phase, so a
 * stop skipped at pickup still reads as skipped after the route is done.
 */
export function labelledPhase(executionPhase?: ExecutionPhase | null, routeStatus?: string | null): ExecutionPhase {
  const routeDone = routeStatus === 'completed' || routeStatus === 'archived';
  return executionPhase && !routeDone ? executionPhase : 'pickup';
}

export function getStopStatusLabel(
  stop: StatusLabelStop,
  executionPhase?: ExecutionPhase | null,
  routeStatus?: string | null
) {
  const routeDone = routeStatus === 'completed' || routeStatus === 'archived';
  const phase = labelledPhase(executionPhase, routeStatus);
  const { state, reason } = stopProgress(stop)[phase];
  if (state === 'skipped') {
    const base = phase === 'pickup' ? 'Pickup skipped' : 'Placement skipped';
    return reason ? `${base} · ${reason}` : base;
  }
  if (state === 'done') {
    return phase === 'pickup' ? 'Signs collected' : 'Signs placed';
  }

  if (executionPhase && !routeDone) {
    // The route hasn't started yet, so there's nothing to be "awaiting" —
    // the operator still needs to load the signs onto the vehicle.
    if (routeStatus === 'planned' && executionPhase === 'placement') {
      return 'Load signs';
    }
    return executionPhase === 'pickup' ? 'Awaiting pickup' : 'Awaiting placement';
  }

  if (stop.actualArrivalTime) return 'At stop';
  return 'Signs pending';
}

/** How far a Stop has got in the phase it's shown for, which colours its
 *  marker or number circle so the colour always agrees with its label. */
export type StopProgressTone = 'awaiting' | 'placed' | 'pickedUp' | 'skipped';

export function stopProgressTone(stop: StopProgressStop, phase: ExecutionPhase): StopProgressTone {
  const progress = stopProgress(stop);
  const { state } = progress[phase];
  if (state === 'skipped') return 'skipped';
  if (state === 'done') return phase === 'pickup' ? 'pickedUp' : 'placed';
  return phase === 'pickup' && progress.placement.state === 'done' ? 'placed' : 'awaiting';
}
