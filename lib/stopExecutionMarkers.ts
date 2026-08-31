/**
 * Stop completion/skip state for the placement and pickup phases is not stored in
 * dedicated Stop schema fields — it's encoded as marker strings embedded in the
 * free-text Stop.notes field: "[MARKER:isoTimestamp]" or, for skips,
 * "[MARKER:isoTimestamp|reason]". This convention originated in the existing 2-phase
 * flow (app/operator/routes/detail/page.tsx) and is reused as-is by the Driver Sign
 * Run screens (Placement, Pickup) so both flows agree on the same Stop records.
 */
export type ExecutionPhase = 'placement' | 'pickup';

export const PLACEMENT_DONE_MARKER = 'PLACEMENT_DONE';
export const PICKUP_DONE_MARKER = 'PICKUP_DONE';
export const PLACEMENT_SKIPPED_MARKER = 'PLACEMENT_SKIPPED';
export const PICKUP_SKIPPED_MARKER = 'PICKUP_SKIPPED';

const ALL_MARKERS = [
  PLACEMENT_DONE_MARKER,
  PICKUP_DONE_MARKER,
  PLACEMENT_SKIPPED_MARKER,
  PICKUP_SKIPPED_MARKER,
];

export function removeMarker(notes: string, marker: string) {
  return notes.replace(new RegExp(`(?:^|\\s)\\[${marker}:[^\\]]*\\]`, 'g'), ' ').replace(/\s+/g, ' ').trim();
}

export function upsertMarker(notes: string | null | undefined, marker: string, atIso: string, reason?: string) {
  const base = removeMarker(notes ?? '', marker);
  const value = reason ? `${atIso}|${reason}` : atIso;
  return `${base}${base ? ' ' : ''}[${marker}:${value}]`;
}

export function getMarkerTimestamp(notes: string | null | undefined, marker: string) {
  if (!notes) return null;
  const match = notes.match(new RegExp(`\\[${marker}:([^\\]]+)\\]`));
  return match?.[1]?.split('|')[0] ?? null;
}

export function getMarkerReason(notes: string | null | undefined, marker: string) {
  if (!notes) return null;
  const match = notes.match(new RegExp(`\\[${marker}:([^\\]]+)\\]`));
  const [, reason] = match?.[1]?.split('|') ?? [];
  return reason || null;
}

export function isStopSkippedForPhase(stop: { notes?: string | null }, phase: ExecutionPhase) {
  if (phase === 'placement') {
    return Boolean(getMarkerTimestamp(stop.notes, PLACEMENT_SKIPPED_MARKER));
  }
  return Boolean(getMarkerTimestamp(stop.notes, PICKUP_SKIPPED_MARKER));
}

export function isStopCompletedForPhase(
  stop: { notes?: string | null; serviceType?: string | null; actualDepartureTime?: string | null },
  phase: ExecutionPhase
) {
  if (phase === 'placement') {
    return (
      Boolean(getMarkerTimestamp(stop.notes, PLACEMENT_DONE_MARKER)) ||
      Boolean(getMarkerTimestamp(stop.notes, PLACEMENT_SKIPPED_MARKER)) ||
      (stop.serviceType !== 'pickup' && Boolean(stop.actualDepartureTime))
    );
  }

  return (
    Boolean(getMarkerTimestamp(stop.notes, PICKUP_DONE_MARKER)) ||
    Boolean(getMarkerTimestamp(stop.notes, PICKUP_SKIPPED_MARKER)) ||
    (stop.serviceType === 'pickup' && Boolean(stop.actualDepartureTime))
  );
}

/** The driver-authored portion of Stop.notes, with every phase marker stripped —
 * for display, since notes is shared between free-text instructions and markers. */
export function getDisplayNotes(notes: string | null | undefined) {
  if (!notes) return '';
  return ALL_MARKERS.reduce((acc, marker) => removeMarker(acc, marker), notes);
}
