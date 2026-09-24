import { updateStopExecution } from '@/lib/queries';
import {
  removeMarker,
  upsertMarker,
  PLACEMENT_DONE_MARKER,
  PLACEMENT_SKIPPED_MARKER,
  PICKUP_DONE_MARKER,
  PICKUP_SKIPPED_MARKER,
  type ExecutionPhase,
} from '@/lib/stopExecutionMarkers';
import type { Stop } from '@/amplify/types';

function markersForPhase(phase: ExecutionPhase) {
  return phase === 'placement'
    ? { done: PLACEMENT_DONE_MARKER, skipped: PLACEMENT_SKIPPED_MARKER }
    : { done: PICKUP_DONE_MARKER, skipped: PICKUP_SKIPPED_MARKER };
}

export interface StopSettlementPatch {
  actualArrivalTime: string;
  actualDepartureTime: string;
  notes: Stop['notes'];
}

interface SettleSignRunStopParams {
  stopId: string;
  stops: Stop[];
  phase: ExecutionPhase;
  action: 'complete' | 'skip';
  /** Only meaningful for action: 'skip' — an operator-entered reason for skipping. */
  reason?: string;
  onSettled: (stopId: string, patch: StopSettlementPatch) => void;
  onError?: (message: string) => void;
}

/**
 * Marks a stop done or skipped for the placement/pickup phase, embedding the
 * marker in Stop.notes (see lib/stopExecutionMarkers.ts). Shared by every
 * caller that settles a stop this way (operator's Placement/Pickup screens,
 * admin's in-page phase execution) — they differ in how they apply the
 * result (splice into local state vs. refetch), hence a plain function with
 * an onSettled callback rather than a hook tied to one state-management style.
 */
export async function settleSignRunStop({
  stopId,
  stops,
  phase,
  action,
  reason,
  onSettled,
  onError,
}: SettleSignRunStopParams): Promise<boolean> {
  const { done, skipped } = markersForPhase(phase);
  const marker = action === 'complete' ? done : skipped;
  const otherMarker = action === 'complete' ? skipped : done;

  try {
    const now = new Date().toISOString();
    const existingStop = stops.find((stop) => stop.id === stopId);
    const withMarker = upsertMarker(existingStop?.notes, marker, now, reason);
    const notes = removeMarker(withMarker, otherMarker);
    const patch: StopSettlementPatch = {
      actualArrivalTime: existingStop?.actualArrivalTime ?? now,
      actualDepartureTime: now,
      notes,
    };

    const { errors } = await updateStopExecution(stopId, patch);
    if (errors && errors.length > 0) {
      onError?.('Could not save that stop. Try again.');
      return false;
    }

    onSettled(stopId, patch);
    return true;
  } catch {
    onError?.('Could not save that stop. Try again.');
    return false;
  }
}
