/**
 * Derives every portal's presentation of a route's place in its 6-phase
 * lifecycle: Planned -> Signs collected -> Signs placed -> Signs picked up
 * -> Signs returned -> Route completed.
 *
 * Originally scoped to the driving-mode "Driver Sign Run" flow, this is now
 * the single source of truth for route phase/status display everywhere it's
 * shown (administrator, operator, customer) — every route flows through this
 * model, not just drivingModeEnabled ones.
 *
 * Pure and side-effect free, same style as lib/routeStatusHelpers.ts /
 * lib/routeDetailHelpers.ts — this module has no knowledge of how the route
 * or its stop count were fetched.
 */
import type { Route, RouteExecutionPhase } from '@/amplify/types';

export type SignRunTrackState = 'done' | 'current' | 'upcoming';

/** Canonical 6-phase key, in flow order — the single source of truth for phase display. */
export type RoutePhaseKey =
  | 'planned'
  | 'signs_collected'
  | 'signs_placed'
  | 'signs_picked_up'
  | 'signs_returned'
  | 'completed';

/** ROUTE_PHASE_KEYS, in flow order. */
export const ROUTE_PHASE_KEYS: RoutePhaseKey[] = [
  'planned',
  'signs_collected',
  'signs_placed',
  'signs_picked_up',
  'signs_returned',
  'completed',
];

/** Human label for each phase key, in the same order as ROUTE_PHASE_KEYS — the
 *  single source of truth for phase names everywhere they're rendered
 *  (read-only overview trackers, badges, filters, summary counts). */
export const ROUTE_PHASE_LABELS: Record<RoutePhaseKey, string> = {
  planned: 'Planned',
  signs_collected: 'Signs collected',
  signs_placed: 'Signs placed',
  signs_picked_up: 'Signs picked up',
  signs_returned: 'Signs returned',
  completed: 'Route completed',
};

/** The only Route fields the phase model actually reads — lets pure/testable
 *  callers (e.g. lib/adminDashboardOverview.ts) work with a loosely-typed
 *  route shape without importing the full Route interface. */
export type RoutePhaseInput = Pick<Route, 'status' | 'executionPhase' | 'unloadConfirmedAt' | 'scheduledDate'>;

export interface SignRunPhaseInfo {
  /** 0-3 = Signs collected/placed/picked up/returned in progress, 4 = ready to finalise. */
  phaseIdx: 0 | 1 | 2 | 3 | 4;
  /** Canonical phase key across all 6 phases. */
  phase: RoutePhaseKey;
  /** Pill text: "Signs collected" | "Signs placed" | "Signs picked up" | "Signs returned" | "Ready to finalise". */
  phaseLabel: string;
  /** Caption under the progress bar: "Phase 1 of 4" ... "All four phases done". */
  phaseNumberLabel: string;
  /** Phase-screen header kicker: "PHASE 1 OF 4 · SIGNS COLLECTED". */
  phaseKicker: string;
  /** Signs collected/placed pills read indigo; picked up/returned/finalise read violet. */
  tint: 'indigo' | 'violet';
  /** Card CTA verb: "Collect signs" | "Place signs" | "Pick up signs" | "Return signs" | "Finalise". */
  actionLabel: string;
  /** Right-aligned status text — day label while planned, current phase while active. */
  statusLabel: string;
  /** 5 entries: the 4 work phases plus a trailing "Route completed" segment — the operator's work tracker. */
  track: SignRunTrackState[];
  /** 6 entries: Planned, then the 5 track segments above — the read-only overview tracker for admin/customer views. */
  overallTrack: SignRunTrackState[];
  isLocked: boolean;
  lockNote?: string;
}

const PHASE_ORDER: Array<{ key: RouteExecutionPhase; phase: RoutePhaseKey; label: string; action: string }> = [
  { key: 'load', phase: 'signs_collected', label: 'Signs collected', action: 'Collect signs' },
  { key: 'placement', phase: 'signs_placed', label: 'Signs placed', action: 'Place signs' },
  { key: 'pickup', phase: 'signs_picked_up', label: 'Signs picked up', action: 'Pick up signs' },
  { key: 'unload', phase: 'signs_returned', label: 'Signs returned', action: 'Return signs' },
];

// Oldest legacy data predates the executionPhase field entirely, so
// signs_placed/signs_picked_up routes can show up with no executionPhase
// set at all. When that happens, fall back to the phase implied by the
// status itself rather than defaulting everything to phase 0 — that legacy
// status *is* the record of which phase most recently completed.
const LEGACY_STATUS_PHASE_IDX: Partial<Record<NonNullable<Route['status']>, number>> = {
  in_progress: 0,
  signs_placed: 1,
  signs_picked_up: 2,
};

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
 * Returns null for routes already finished (completed/archived) — those have
 * no active work phase left to track. Consumers that need a read-only view
 * of a finished route (admin/customer overview trackers) render that state
 * directly from route.status instead of calling this function.
 */
export function getSignRunPhase(route: RoutePhaseInput, stopCount: number): SignRunPhaseInfo | null {
  if (route.status === 'completed' || route.status === 'archived') return null;

  // Unload confirmed but Finalise hasn't run yet — completed routes were already
  // excluded above, so any remaining route with this set is still mid-flow.
  const readyToFinalise = Boolean(route.unloadConfirmedAt);
  const executionIdx = PHASE_ORDER.findIndex((p) => p.key === route.executionPhase);
  const legacyFallbackIdx = route.status ? LEGACY_STATUS_PHASE_IDX[route.status] : undefined;
  const phaseIdx = (
    readyToFinalise ? 4 : executionIdx >= 0 ? executionIdx : (legacyFallbackIdx ?? 0)
  ) as SignRunPhaseInfo['phaseIdx'];

  // 5-segment work tracker: the 4 work phases plus a trailing "Route completed" segment.
  const track: SignRunTrackState[] = [0, 1, 2, 3, 4].map((i) =>
    i < phaseIdx ? 'done' : i === phaseIdx ? 'current' : 'upcoming'
  );

  // 6-segment overview tracker: while still planned, only the Planned segment
  // is current (the work phases haven't actually started yet, even though the
  // 5-segment work tracker above points at the first one for CTA purposes).
  const overallTrack: SignRunTrackState[] =
    route.status === 'planned'
      ? ['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']
      : ['done', ...track];

  const phase: RoutePhaseKey = phaseIdx === 4 ? 'completed' : PHASE_ORDER[phaseIdx].phase;
  const phaseLabel = phaseIdx === 4 ? 'Ready to finalise' : PHASE_ORDER[phaseIdx].label;
  const phaseNumberLabel = phaseIdx === 4 ? 'All four phases done' : `Phase ${phaseIdx + 1} of 4`;
  const phaseKicker = phaseIdx === 4 ? 'FINALISE' : `PHASE ${phaseIdx + 1} OF 4 · ${PHASE_ORDER[phaseIdx].label.toUpperCase()}`;
  const actionLabel = phaseIdx === 4 ? 'Finalise' : PHASE_ORDER[phaseIdx].action;
  const tint: SignRunPhaseInfo['tint'] = phaseIdx >= 2 ? 'violet' : 'indigo';
  const statusLabel = route.status === 'planned' ? dayLabel(route.scheduledDate) : phaseLabel;

  // Not released yet — no schema flag for this, approximated as a planned route
  // the planner hasn't added any stops to.
  const isLocked = route.status === 'planned' && stopCount === 0;

  return {
    phaseIdx,
    phase,
    phaseLabel,
    phaseNumberLabel,
    phaseKicker,
    tint,
    actionLabel,
    statusLabel,
    track,
    overallTrack,
    isLocked,
    lockNote: isLocked ? 'Not released yet — planner is still adding stops' : undefined,
  };
}

/**
 * Which of the 6 phases a route currently sits in — the single source of
 * truth for badges, filters, and summary counts across every portal. Unlike
 * getSignRunPhase, this covers every route including completed/archived
 * (archived is legacy-only and reads as "completed" — see the decision to
 * soft-deprecate it, noted on the Route status enum).
 */
export function getRoutePhaseKey(route: RoutePhaseInput): RoutePhaseKey {
  if (route.status === 'completed' || route.status === 'archived') return 'completed';
  if (!route.status || route.status === 'planned') return 'planned';

  const info = getSignRunPhase(route, 0);
  if (!info) return 'completed';

  const currentIdx = info.overallTrack.indexOf('current');
  return ROUTE_PHASE_KEYS[currentIdx === -1 ? ROUTE_PHASE_KEYS.length - 1 : currentIdx];
}
