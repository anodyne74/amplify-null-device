import {
  getDisplayNotes,
  getMarkerReason,
  getMarkerTimestamp,
  isStopCompletedForPhase,
  isStopSkippedForPhase,
  PICKUP_SKIPPED_MARKER,
  PLACEMENT_DONE_MARKER,
  PLACEMENT_SKIPPED_MARKER,
  removeMarker,
  upsertMarker,
} from './stopExecutionMarkers';

describe('upsertMarker / removeMarker / getMarkerTimestamp / getMarkerReason', () => {
  it('adds a marker with just a timestamp', () => {
    const notes = upsertMarker('', PLACEMENT_DONE_MARKER, '2026-08-31T10:00:00.000Z');
    expect(notes).toBe('[PLACEMENT_DONE:2026-08-31T10:00:00.000Z]');
    expect(getMarkerTimestamp(notes, PLACEMENT_DONE_MARKER)).toBe('2026-08-31T10:00:00.000Z');
    expect(getMarkerReason(notes, PLACEMENT_DONE_MARKER)).toBeNull();
  });

  it('adds a marker with a reason', () => {
    const notes = upsertMarker(null, PLACEMENT_SKIPPED_MARKER, '2026-08-31T10:00:00.000Z', 'Gate locked / no access');
    expect(getMarkerTimestamp(notes, PLACEMENT_SKIPPED_MARKER)).toBe('2026-08-31T10:00:00.000Z');
    expect(getMarkerReason(notes, PLACEMENT_SKIPPED_MARKER)).toBe('Gate locked / no access');
  });

  it('preserves existing free-text notes alongside a marker', () => {
    const notes = upsertMarker('Gate code 4821', PLACEMENT_DONE_MARKER, '2026-08-31T10:00:00.000Z');
    expect(notes).toBe('Gate code 4821 [PLACEMENT_DONE:2026-08-31T10:00:00.000Z]');
  });

  it('replaces a marker of the same kind rather than duplicating it', () => {
    const first = upsertMarker('', PLACEMENT_SKIPPED_MARKER, '2026-08-31T10:00:00.000Z', 'Owner or tenant refused');
    const second = upsertMarker(first, PLACEMENT_SKIPPED_MARKER, '2026-08-31T10:05:00.000Z', 'Property not ready');
    expect(getMarkerTimestamp(second, PLACEMENT_SKIPPED_MARKER)).toBe('2026-08-31T10:05:00.000Z');
    expect(getMarkerReason(second, PLACEMENT_SKIPPED_MARKER)).toBe('Property not ready');
    expect(second.match(/\[PLACEMENT_SKIPPED:/g)).toHaveLength(1);
  });

  it('removeMarker strips only the named marker, leaving other text intact', () => {
    const withBoth = 'Gate code 4821 [PLACEMENT_DONE:2026-08-31T10:00:00.000Z] [PICKUP_DONE:2026-08-31T11:00:00.000Z]';
    expect(removeMarker(withBoth, PLACEMENT_DONE_MARKER)).toBe(
      'Gate code 4821 [PICKUP_DONE:2026-08-31T11:00:00.000Z]'
    );
  });

  it('getMarkerTimestamp/getMarkerReason return null when absent', () => {
    expect(getMarkerTimestamp(null, PLACEMENT_DONE_MARKER)).toBeNull();
    expect(getMarkerTimestamp('no markers here', PLACEMENT_DONE_MARKER)).toBeNull();
    expect(getMarkerReason('no markers here', PLACEMENT_DONE_MARKER)).toBeNull();
  });
});

describe('isStopSkippedForPhase / isStopCompletedForPhase', () => {
  it('reads placement skip/done independently of pickup', () => {
    const notes = upsertMarker('', PLACEMENT_DONE_MARKER, '2026-08-31T10:00:00.000Z');
    expect(isStopCompletedForPhase({ notes }, 'placement')).toBe(true);
    expect(isStopSkippedForPhase({ notes }, 'placement')).toBe(false);
    expect(isStopCompletedForPhase({ notes }, 'pickup')).toBe(false);
  });

  it('treats a skip as completed for that phase', () => {
    const notes = upsertMarker('', PICKUP_SKIPPED_MARKER, '2026-08-31T10:00:00.000Z', 'Signs already on site');
    expect(isStopSkippedForPhase({ notes }, 'pickup')).toBe(true);
    expect(isStopCompletedForPhase({ notes }, 'pickup')).toBe(true);
  });

  it('falls back to actualDepartureTime + serviceType when no marker is present', () => {
    expect(
      isStopCompletedForPhase({ notes: null, serviceType: 'delivery', actualDepartureTime: '2026-08-31T10:00:00.000Z' }, 'placement')
    ).toBe(true);
    expect(
      isStopCompletedForPhase({ notes: null, serviceType: 'pickup', actualDepartureTime: '2026-08-31T10:00:00.000Z' }, 'placement')
    ).toBe(false);
    expect(
      isStopCompletedForPhase({ notes: null, serviceType: 'pickup', actualDepartureTime: '2026-08-31T10:00:00.000Z' }, 'pickup')
    ).toBe(true);
  });
});

describe('getDisplayNotes', () => {
  it('strips every marker kind, keeping driver-authored text', () => {
    const notes = [
      'Gate code 4821',
      `[${PLACEMENT_DONE_MARKER}:2026-08-31T10:00:00.000Z]`,
      `[${PICKUP_SKIPPED_MARKER}:2026-08-31T11:00:00.000Z|Owner or tenant refused]`,
    ].join(' ');
    expect(getDisplayNotes(notes)).toBe('Gate code 4821');
  });

  it('returns an empty string for null/undefined/marker-only notes', () => {
    expect(getDisplayNotes(null)).toBe('');
    expect(getDisplayNotes(undefined)).toBe('');
    expect(getDisplayNotes(`[${PLACEMENT_DONE_MARKER}:2026-08-31T10:00:00.000Z]`)).toBe('');
  });
});
