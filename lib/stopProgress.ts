/**
 * Stop Progress (see CONTEXT.md) — how far a Stop has got in each of Placement
 * and Pickup. The one place that knows how it's stored, so every screen agrees.
 *
 * Placement is awaiting or done (a Stop whose signs can't go up is a Removed
 * Stop instead, lib/loadChange.ts); Pickup is awaiting, done, or Couldn't
 * Collect.
 *
 * Stored as marker strings in the free-text Stop.notes field, "[MARKER:isoTimestamp]"
 * or, for Couldn't Collect, "[MARKER:isoTimestamp|reason]", alongside whatever the
 * operator typed. A Stop with no markers but a departure time is a legacy import
 * (every one is on a completed Route) and reads as done in both phases, untimed.
 */
export type ExecutionPhase = 'placement' | 'pickup';

export interface PhaseProgress {
  state: 'pending' | 'done' | 'couldntCollect';
  /** When it was settled; null while pending, and for legacy Stops. */
  at: string | null;
  /** The operator's reason, for Couldn't Collect. */
  reason: string | null;
}

export type StopProgress = Record<ExecutionPhase, PhaseProgress>;

export interface StopProgressStop {
  notes?: string | null;
  actualDepartureTime?: string | null;
}

const DONE_MARKER: Record<ExecutionPhase, string> = { placement: 'PLACEMENT_DONE', pickup: 'PICKUP_DONE' };
// Named for the skip it replaced; no Stop was ever skipped, so the name is all that's left of it.
const COULDNT_COLLECT_MARKER = 'PICKUP_SKIPPED';
// Never written any more, and never was in practice; still stripped from notes and read as nothing.
const RETIRED_MARKERS = ['PLACEMENT_SKIPPED'];

const ALL_MARKERS = [...Object.values(DONE_MARKER), COULDNT_COLLECT_MARKER, ...RETIRED_MARKERS];

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
  const done = readMarker(notes, DONE_MARKER[phase]);
  if (done) return { state: 'done', at: done.at, reason: null };
  const couldntCollect = phase === 'pickup' ? readMarker(notes, COULDNT_COLLECT_MARKER) : null;
  if (couldntCollect) return { state: 'couldntCollect', at: couldntCollect.at, reason: couldntCollect.reason };
  return PENDING;
}

export function stopProgress(stop: StopProgressStop): StopProgress {
  const notes = stop.notes ?? '';
  if (!ALL_MARKERS.some((marker) => readMarker(notes, marker)) && stop.actualDepartureTime) {
    return { placement: LEGACY_DONE, pickup: LEGACY_DONE };
  }
  return { placement: phaseProgress(notes, 'placement'), pickup: phaseProgress(notes, 'pickup') };
}

/** Done or Couldn't Collect in Pickup, the last phase of every Stop. */
export function isStopFinished(stop: StopProgressStop): boolean {
  return stopProgress(stop).pickup.state !== 'pending';
}

/** Done in Pickup; a Couldn't Collect Stop is finished but not completed. */
export function isStopCompleted(stop: StopProgressStop): boolean {
  return stopProgress(stop).pickup.state === 'done';
}

/** The notes with a Stop settled for a phase: done in either, or Couldn't
 *  Collect (with a reason) in Pickup. Settling Pickup clears its other outcome,
 *  so a Couldn't Collect Stop can later be done and vice versa. */
export function settleStopNotes(
  notes: string | null | undefined,
  phase: 'pickup',
  action: 'complete' | 'couldntCollect',
  at: string,
  reason?: string
): string;
export function settleStopNotes(notes: string | null | undefined, phase: ExecutionPhase, action: 'complete', at: string): string;
export function settleStopNotes(
  notes: string | null | undefined,
  phase: ExecutionPhase,
  action: 'complete' | 'couldntCollect',
  at: string,
  reason?: string
): string {
  const done = DONE_MARKER[phase];
  const [marker, other] = action === 'complete' ? [done, COULDNT_COLLECT_MARKER] : [COULDNT_COLLECT_MARKER, done];
  let base = removeMarker(notes ?? '', marker);
  if (phase === 'pickup') base = removeMarker(base, other);
  // A reason can't hold the marker's own delimiters.
  const cleanReason = action === 'couldntCollect' ? (reason ?? '').replace(/[|\]]/g, ' ').replace(/\s+/g, ' ').trim() : '';
  const value = cleanReason ? `${at}|${cleanReason}` : at;
  return `${base}${base ? ' ' : ''}[${marker}:${value}]`;
}

/** The operator-typed part of Stop.notes, with the progress markers stripped. */
export function displayNotes(notes: string | null | undefined): string {
  if (!notes) return '';
  return ALL_MARKERS.reduce((acc, marker) => removeMarker(acc, marker), notes);
}
