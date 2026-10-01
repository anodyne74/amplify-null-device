/**
 * Stop Progress (see CONTEXT.md) — how far a Stop has got in each of Placement
 * and Pickup. The one place that knows how it's stored, so every screen agrees.
 *
 * Stored as marker strings in the free-text Stop.notes field, "[MARKER:isoTimestamp]"
 * or, for skips, "[MARKER:isoTimestamp|reason]", alongside whatever the operator
 * typed. A Stop with no markers but a departure time is a legacy import (every one
 * is on a completed Route) and reads as done in both phases, untimed.
 */
export type ExecutionPhase = 'placement' | 'pickup';

export interface PhaseProgress {
  state: 'pending' | 'done' | 'skipped';
  /** When it was settled; null while pending, and for legacy Stops. */
  at: string | null;
  /** The operator's reason, for a skip that recorded one. */
  reason: string | null;
}

export type StopProgress = Record<ExecutionPhase, PhaseProgress>;

export interface StopProgressStop {
  notes?: string | null;
  actualDepartureTime?: string | null;
  serviceType?: string | null;
}

const MARKERS: Record<ExecutionPhase, { done: string; skipped: string }> = {
  placement: { done: 'PLACEMENT_DONE', skipped: 'PLACEMENT_SKIPPED' },
  pickup: { done: 'PICKUP_DONE', skipped: 'PICKUP_SKIPPED' },
};

const ALL_MARKERS = Object.values(MARKERS).flatMap(({ done, skipped }) => [done, skipped]);

const PENDING: PhaseProgress = { state: 'pending', at: null, reason: null };
const LEGACY_DONE: PhaseProgress = { state: 'done', at: null, reason: null };

function readMarker(notes: string, marker: string): { at: string; reason: string | null } | null {
  const match = notes.match(new RegExp(`\\[${marker}:([^\\]]+)\\]`));
  if (!match) return null;
  const [at, reason] = match[1].split('|');
  return { at, reason: reason || null };
}

function removeMarker(notes: string, marker: string) {
  return notes.replace(new RegExp(`(?:^|\\s)\\[${marker}:[^\\]]*\\]`, 'g'), ' ').replace(/\s+/g, ' ').trim();
}

function phaseProgress(notes: string, phase: ExecutionPhase): PhaseProgress {
  const done = readMarker(notes, MARKERS[phase].done);
  if (done) return { state: 'done', at: done.at, reason: null };
  const skipped = readMarker(notes, MARKERS[phase].skipped);
  if (skipped) return { state: 'skipped', at: skipped.at, reason: skipped.reason };
  return PENDING;
}

export function stopProgress(stop: StopProgressStop): StopProgress {
  const notes = stop.notes ?? '';
  if (!ALL_MARKERS.some((marker) => readMarker(notes, marker)) && stop.actualDepartureTime) {
    return { placement: LEGACY_DONE, pickup: LEGACY_DONE };
  }
  return { placement: phaseProgress(notes, 'placement'), pickup: phaseProgress(notes, 'pickup') };
}

/** Whether a Stop is visited in a phase: pickup Stops have no Placement, and
 *  inspection Stops no Pickup. */
export function takesPartIn(stop: StopProgressStop, phase: ExecutionPhase): boolean {
  return stop.serviceType !== (phase === 'placement' ? 'pickup' : 'inspection');
}

/** The last phase a Stop is visited in: Placement for inspections, otherwise Pickup. */
export function lastPhase(stop: StopProgressStop): ExecutionPhase {
  return takesPartIn(stop, 'pickup') ? 'pickup' : 'placement';
}

/** Done or skipped in its last phase. */
export function isStopFinished(stop: StopProgressStop): boolean {
  return stopProgress(stop)[lastPhase(stop)].state !== 'pending';
}

/** Done in its last phase; a skipped Stop is finished but not completed. */
export function isStopCompleted(stop: StopProgressStop): boolean {
  return stopProgress(stop)[lastPhase(stop)].state === 'done';
}

/** The notes with a Stop settled done or skipped for a phase, clearing the
 *  opposite one so a skipped Stop can later be done and vice versa. */
export function settleStopNotes(
  notes: string | null | undefined,
  phase: ExecutionPhase,
  action: 'complete' | 'skip',
  at: string,
  reason?: string
): string {
  const { done, skipped } = MARKERS[phase];
  const [marker, other] = action === 'complete' ? [done, skipped] : [skipped, done];
  const base = removeMarker(removeMarker(notes ?? '', marker), other);
  const value = reason ? `${at}|${reason}` : at;
  return `${base}${base ? ' ' : ''}[${marker}:${value}]`;
}

/** The operator-typed part of Stop.notes, with the progress markers stripped. */
export function displayNotes(notes: string | null | undefined): string {
  if (!notes) return '';
  return ALL_MARKERS.reduce((acc, marker) => removeMarker(acc, marker), notes);
}
