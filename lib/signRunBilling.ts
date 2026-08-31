/**
 * Charged-time math for the Finalise screen of the Driver Sign Run flow — pure and
 * side-effect free, same style as lib/signRunPhase.ts / lib/stopExecutionMarkers.ts.
 * Ported from the design handoff's billFor()/round5()/dur() prototype methods.
 */
import type { RouteExecutionPhase } from '@/amplify/types';

/** Load and unload are charged at a 15 min minimum; placement and pickup at 5 min. */
export const MIN_BILLED_MINUTES: Record<RouteExecutionPhase, number> = {
  load: 15,
  placement: 5,
  pickup: 5,
  unload: 15,
};

/** Raw elapsed minutes between two ISO timestamps. 0 if either is missing. */
export function minutesBetween(startIso?: string | null, endIso?: string | null): number {
  if (!startIso || !endIso) return 0;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
}

/** Nearest 5 minutes, floored at 5. */
export function round5(minutes: number): number {
  return Math.max(5, Math.round(minutes / 5) * 5);
}

/** The initial billed value for a phase before the operator adjusts it — the measured
 * time rounded to the nearest 5 minutes, floored at that phase's minimum charge. */
export function defaultBilledMinutes(phase: RouteExecutionPhase, measuredMinutes: number): number {
  return Math.max(MIN_BILLED_MINUTES[phase], round5(measuredMinutes));
}

export function sumBilledMinutes(bill: Record<RouteExecutionPhase, number>): number {
  return bill.load + bill.placement + bill.pickup + bill.unload;
}

/** "Xh Ym" above an hour, otherwise "Ym". */
export function formatDuration(totalMinutes: number): string {
  return totalMinutes >= 60
    ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`
    : `${totalMinutes}m`;
}
