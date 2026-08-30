/**
 * Derives the operator Today screen's presentation of a route's place in the
 * Driver Sign Run flow: Load -> Placement -> Pickup -> Unload -> Finalise.
 *
 * Pure and side-effect free, same style as lib/routeStatusHelpers.ts /
 * lib/routeDetailHelpers.ts — this module has no knowledge of how the route
 * or its stop count were fetched.
 */
import type { Route, RouteExecutionPhase } from '@/amplify/types';

export type SignRunTrackState = 'done' | 'current' | 'upcoming';

export interface SignRunPhaseInfo {
  /** 0-3 = Load/Placement/Pickup/Unload in progress, 4 = ready to finalise. */
  phaseIdx: 0 | 1 | 2 | 3 | 4;
  /** Pill text: "Load" | "Placement" | "Pickup" | "Unload" | "Ready to finalise". */
  phaseLabel: string;
  /** Caption under the progress bar: "Phase 1 of 4" ... "All four phases done". */
  phaseNumberLabel: string;
  /** Load/Placement pills read indigo; Pickup/Unload/finalise read violet. */
  tint: 'indigo' | 'violet';
  /** Card CTA verb: "Load signs" | "Place signs" | "Pick up signs" | "Return signs" | "Finalise". */
  actionLabel: string;
  /** Right-aligned status text — day label while planned, current phase while active. */
  statusLabel: string;
  /** Always 4 entries, one per phase segment of the progress bar. */
  track: SignRunTrackState[];
  isLocked: boolean;
  lockNote?: string;
}

const PHASE_ORDER: Array<{ key: RouteExecutionPhase; label: string; action: string }> = [
  { key: 'load', label: 'Load', action: 'Load signs' },
  { key: 'placement', label: 'Placement', action: 'Place signs' },
  { key: 'pickup', label: 'Pickup', action: 'Pick up signs' },
  { key: 'unload', label: 'Unload', action: 'Return signs' },
];

function dayLabel(scheduledDate?: string | null): string {
  if (!scheduledDate) return '—';
  const date = new Date(scheduledDate);
  if (Number.isNaN(date.getTime())) return '—';

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(date) - startOfDay(new Date())) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * Returns null for routes outside the sign-run flow (drivingModeEnabled not set)
 * or already finished (completed/archived) — the Today screen only shows active
 * and upcoming work, matching the existing dashboard's filter.
 */
export function getSignRunPhase(route: Route, stopCount: number): SignRunPhaseInfo | null {
  if (!route.drivingModeEnabled) return null;
  if (route.status === 'completed' || route.status === 'archived') return null;

  // Unload confirmed but Finalise hasn't run yet — completed routes were already
  // excluded above, so any remaining route with this set is still mid-flow.
  const readyToFinalise = Boolean(route.unloadConfirmedAt);
  const executionIdx = PHASE_ORDER.findIndex((p) => p.key === route.executionPhase);
  const phaseIdx = (readyToFinalise ? 4 : executionIdx < 0 ? 0 : executionIdx) as SignRunPhaseInfo['phaseIdx'];

  const track: SignRunTrackState[] = PHASE_ORDER.map((_, i) =>
    i < phaseIdx ? 'done' : i === phaseIdx ? 'current' : 'upcoming'
  );

  const phaseLabel = phaseIdx === 4 ? 'Ready to finalise' : PHASE_ORDER[phaseIdx].label;
  const phaseNumberLabel = phaseIdx === 4 ? 'All four phases done' : `Phase ${phaseIdx + 1} of 4`;
  const actionLabel = phaseIdx === 4 ? 'Finalise' : PHASE_ORDER[phaseIdx].action;
  const tint: SignRunPhaseInfo['tint'] = phaseIdx >= 2 ? 'violet' : 'indigo';
  const statusLabel = route.status === 'planned' ? dayLabel(route.scheduledDate) : phaseLabel;

  // Not released yet — no schema flag for this, approximated as a planned route
  // the planner hasn't added any stops to.
  const isLocked = route.status === 'planned' && stopCount === 0;

  return {
    phaseIdx,
    phaseLabel,
    phaseNumberLabel,
    tint,
    actionLabel,
    statusLabel,
    track,
    isLocked,
    lockNote: isLocked ? 'Not released yet — planner is still adding stops' : undefined,
  };
}
