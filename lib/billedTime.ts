/**
 * Billed Time (see CONTEXT.md) — what a Customer is charged for a Route: the
 * minutes for each Sign Run phase, their total, and the distance. Pure and
 * side-effect free. The one place that knows how Billed Time is seeded from
 * what was measured, which rules it keeps, how it's stored on the Route, and
 * how it's read back, so Finalise, the invoice screens and the reports all
 * agree.
 *
 * Stored as billed{Load,Placement,Pickup,Unload}Minutes, with their sum cached
 * in overrideDurationMinutes, plus overrideDistanceKm. Routes from before the
 * Sign Run have a total only.
 */
import type { Route, RouteExecutionPhase } from '@/amplify/types';

export type BilledPhaseMinutes = Record<RouteExecutionPhase, number>;

/** Load and unload are charged at a 15 min minimum; placement and pickup at 5 min. */
export const MIN_BILLED_MINUTES: BilledPhaseMinutes = {
  load: 15,
  placement: 5,
  pickup: 5,
  unload: 15,
};

/** The most one phase can be billed at. */
const MAX_PHASE_MINUTES = 600;

export const BILLED_TIME_INCREMENT_MINUTES = 15;

export type BilledTimeRoute = Partial<
  Pick<
    Route,
    | 'billedLoadMinutes'
    | 'billedPlacementMinutes'
    | 'billedPickupMinutes'
    | 'billedUnloadMinutes'
    | 'overrideDurationMinutes'
    | 'actualDurationMinutes'
    | 'overrideDistanceKm'
    | 'signsPlacedDistanceKm'
    | 'signsPickedUpDistanceKm'
  >
>;

export interface BilledTime {
  /** Minutes per phase, or null for a Route with a total only: one from before
   *  the Sign Run, or one whose total no longer matches its phases (the total
   *  wins, since it's what was invoiced). */
  phases: BilledPhaseMinutes | null;
  /** null while nothing has been billed or measured yet. */
  totalMinutes: number | null;
  /** null while no distance has been billed or measured yet. */
  distanceKm: number | null;
}

const isNumber = (value: unknown): value is number => typeof value === 'number';

function storedPhases(route: BilledTimeRoute): BilledPhaseMinutes | null {
  const { billedLoadMinutes: load, billedPlacementMinutes: placement, billedPickupMinutes: pickup, billedUnloadMinutes: unload } = route;
  if (!isNumber(load) || !isNumber(placement) || !isNumber(pickup) || !isNumber(unload)) return null;
  return { load, placement, pickup, unload };
}

export function sumBilledMinutes(phases: BilledPhaseMinutes): number {
  return phases.load + phases.placement + phases.pickup + phases.unload;
}

/** A Route's Billed Time as stored. Legacy Routes fall back to the measured
 *  actualDurationMinutes and to the two measured leg distances. */
export function billedTime(route: BilledTimeRoute): BilledTime {
  const stored = storedPhases(route);
  const total = route.overrideDurationMinutes;
  const phases = stored && (!isNumber(total) || total === sumBilledMinutes(stored)) ? stored : null;

  const totalMinutes = isNumber(total)
    ? total
    : phases
      ? sumBilledMinutes(phases)
      : isNumber(route.actualDurationMinutes)
        ? route.actualDurationMinutes
        : null;

  const legs = [route.signsPlacedDistanceKm, route.signsPickedUpDistanceKm].filter(isNumber);
  const distanceKm = isNumber(route.overrideDistanceKm)
    ? route.overrideDistanceKm
    : legs.length > 0
      ? legs.reduce((sum, km) => sum + km, 0)
      : null;

  return { phases, totalMinutes, distanceKm };
}

/** The Route fields that store a per-phase Billed Time. */
export function billedTimePatch(phases: BilledPhaseMinutes, distanceKm: number) {
  return {
    billedLoadMinutes: phases.load,
    billedPlacementMinutes: phases.placement,
    billedPickupMinutes: phases.pickup,
    billedUnloadMinutes: phases.unload,
    overrideDurationMinutes: sumBilledMinutes(phases),
    overrideDistanceKm: distanceKm,
  };
}

// --- Seeding from what was measured ---

/** Raw elapsed minutes between two ISO timestamps. 0 if either is missing. */
function minutesBetween(startIso?: string | null, endIso?: string | null): number {
  if (!startIso || !endIso) return 0;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
}

export type PhaseTimestamps = Partial<
  Pick<
    Route,
    | 'loadStartedAt'
    | 'loadConfirmedAt'
    | 'placementStartTime'
    | 'placementEndTime'
    | 'pickupStartTime'
    | 'pickupEndTime'
    | 'unloadStartedAt'
    | 'unloadConfirmedAt'
  >
>;

/** Raw elapsed minutes for each phase, from its own start/end pair. A phase that hasn't
 * both started and finished measures 0. */
export function measuredPhaseMinutes(route: PhaseTimestamps): BilledPhaseMinutes {
  return {
    load: minutesBetween(route.loadStartedAt, route.loadConfirmedAt),
    placement: minutesBetween(route.placementStartTime, route.placementEndTime),
    pickup: minutesBetween(route.pickupStartTime, route.pickupEndTime),
    unload: minutesBetween(route.unloadStartedAt, route.unloadConfirmedAt),
  };
}

/** A phase's Billed Time before anyone adjusts it — the measured time rounded to the
 * nearest 5 minutes, floored at that phase's minimum charge. */
export function defaultBilledMinutes(phase: RouteExecutionPhase, measuredMinutes: number): number {
  return Math.max(MIN_BILLED_MINUTES[phase], Math.round(measuredMinutes / 5) * 5);
}

/** What Finalise starts from: each phase as already billed, otherwise its default. */
export function startingBilledMinutes(route: BilledTimeRoute & PhaseTimestamps): BilledPhaseMinutes {
  const measured = measuredPhaseMinutes(route);
  return {
    load: route.billedLoadMinutes ?? defaultBilledMinutes('load', measured.load),
    placement: route.billedPlacementMinutes ?? defaultBilledMinutes('placement', measured.placement),
    pickup: route.billedPickupMinutes ?? defaultBilledMinutes('pickup', measured.pickup),
    unload: route.billedUnloadMinutes ?? defaultBilledMinutes('unload', measured.unload),
  };
}

// --- Adjusting ---

/** Steps one phase, kept between its minimum and the per-phase maximum. */
export function adjustBilledMinutes(
  phases: BilledPhaseMinutes,
  phase: RouteExecutionPhase,
  step: number
): BilledPhaseMinutes {
  const next = Math.max(MIN_BILLED_MINUTES[phase], Math.min(MAX_PHASE_MINUTES, phases[phase] + step));
  return { ...phases, [phase]: next };
}

/** Whether a total lands on a 15-minute increment, as an invoice needs. */
export function isBillableTotal(totalMinutes: number): boolean {
  return totalMinutes % BILLED_TIME_INCREMENT_MINUTES === 0;
}

/** The next 15-minute increment at or above a total. */
export function nextBillableTotal(totalMinutes: number): number {
  return Math.ceil(totalMinutes / BILLED_TIME_INCREMENT_MINUTES) * BILLED_TIME_INCREMENT_MINUTES;
}

/** A typed distance in km, rounded to 0.1, or null when it isn't a number of 0 or more. */
export function parseDistanceKm(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 10) / 10;
}
