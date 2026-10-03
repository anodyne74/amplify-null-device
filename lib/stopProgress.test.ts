import {
  displayNotes,
  isStopCompleted,
  isStopFinished,
  settleStopNotes,
  stopProgress,
} from './stopProgress';

const AT = '2026-08-31T10:00:00.000Z';
const LATER = '2026-08-31T11:00:00.000Z';

describe('stopProgress', () => {
  it('reads both phases as pending for a Stop not yet settled', () => {
    expect(stopProgress({ notes: 'Gate code 4821' })).toEqual({
      placement: { state: 'pending', at: null, reason: null },
      pickup: { state: 'pending', at: null, reason: null },
    });
    expect(stopProgress({})).toEqual(stopProgress({ notes: null }));
  });

  it('reads each phase independently', () => {
    const notes = settleStopNotes(null, 'placement', 'complete', AT);
    expect(stopProgress({ notes })).toEqual({
      placement: { state: 'done', at: AT, reason: null },
      pickup: { state: 'pending', at: null, reason: null },
    });
  });

  it('reads a skip with its time and reason', () => {
    const notes = settleStopNotes(null, 'pickup', 'skip', LATER, 'Gate locked / no access');
    expect(stopProgress({ notes }).pickup).toEqual({ state: 'skipped', at: LATER, reason: 'Gate locked / no access' });
  });

  it('reads a skip without a reason', () => {
    expect(stopProgress({ notes: settleStopNotes(null, 'pickup', 'skip', LATER) }).pickup.reason).toBeNull();
  });

  it('reads a legacy Stop, with a departure time but no markers, as done in both phases, untimed', () => {
    expect(stopProgress({ notes: 'Gate code 4821', actualDepartureTime: AT })).toEqual({
      placement: { state: 'done', at: null, reason: null },
      pickup: { state: 'done', at: null, reason: null },
    });
  });

  it('trusts only the markers once any are present, since settling always writes a departure time', () => {
    const notes = settleStopNotes(null, 'placement', 'complete', AT);
    expect(stopProgress({ notes, actualDepartureTime: AT }).pickup.state).toBe('pending');
  });
});

describe('finished and completed', () => {
  const placed = settleStopNotes(null, 'placement', 'complete', AT);

  it('is neither until the last phase is settled', () => {
    expect(isStopFinished({ serviceType: 'delivery', notes: placed })).toBe(false);
    expect(isStopCompleted({ serviceType: 'delivery', notes: placed })).toBe(false);
  });

  it('is both once the last phase is done', () => {
    const notes = settleStopNotes(placed, 'pickup', 'complete', LATER);
    expect(isStopFinished({ serviceType: 'delivery', notes })).toBe(true);
    expect(isStopCompleted({ serviceType: 'delivery', notes })).toBe(true);
  });

  it('places and picks up every Stop, whatever its service type', () => {
    for (const serviceType of ['delivery', 'pickup', 'inspection', null]) {
      expect(isStopFinished({ serviceType, notes: placed })).toBe(false);
      const notes = settleStopNotes(placed, 'pickup', 'complete', LATER);
      expect(isStopCompleted({ serviceType, notes })).toBe(true);
    }
  });

  it('counts a skip as finished but not completed', () => {
    const notes = settleStopNotes(placed, 'pickup', 'skip', LATER, 'No access');
    expect(isStopFinished({ serviceType: 'delivery', notes })).toBe(true);
    expect(isStopCompleted({ serviceType: 'delivery', notes })).toBe(false);
  });

  it('reads a legacy Stop as completed', () => {
    expect(isStopCompleted({ serviceType: 'pickup', actualDepartureTime: AT })).toBe(true);
  });
});

describe('settleStopNotes', () => {
  it('keeps the operator-typed notes', () => {
    expect(settleStopNotes('Gate code 4821', 'placement', 'complete', AT)).toBe(`Gate code 4821 [PLACEMENT_DONE:${AT}]`);
  });

  it('replaces an earlier settlement of the same phase rather than adding another', () => {
    const first = settleStopNotes(null, 'placement', 'skip', AT, 'Owner or tenant refused');
    const second = settleStopNotes(first, 'placement', 'skip', LATER, 'Property not ready');
    expect(stopProgress({ notes: second }).placement).toEqual({ state: 'skipped', at: LATER, reason: 'Property not ready' });
    expect(second.match(/PLACEMENT_SKIPPED/g)).toHaveLength(1);
  });

  it('lets a skipped Stop be done later, and a done one skipped', () => {
    const skipped = settleStopNotes(null, 'placement', 'skip', AT, 'No access');
    const done = settleStopNotes(skipped, 'placement', 'complete', LATER);
    expect(stopProgress({ notes: done }).placement).toEqual({ state: 'done', at: LATER, reason: null });
    expect(stopProgress({ notes: settleStopNotes(done, 'placement', 'skip', LATER) }).placement.state).toBe('skipped');
  });

  it('leaves the other phase alone', () => {
    const placed = settleStopNotes(null, 'placement', 'complete', AT);
    const both = settleStopNotes(placed, 'pickup', 'complete', LATER);
    expect(stopProgress({ notes: both })).toEqual({
      placement: { state: 'done', at: AT, reason: null },
      pickup: { state: 'done', at: LATER, reason: null },
    });
  });
});

describe('displayNotes', () => {
  it('strips every progress marker, keeping the operator-typed text', () => {
    const notes = settleStopNotes(settleStopNotes('Gate code 4821', 'placement', 'complete', AT), 'pickup', 'skip', LATER, 'No access');
    expect(displayNotes(notes)).toBe('Gate code 4821');
  });

  it('is empty for missing or marker-only notes', () => {
    expect(displayNotes(null)).toBe('');
    expect(displayNotes(undefined)).toBe('');
    expect(displayNotes(settleStopNotes(null, 'placement', 'complete', AT))).toBe('');
  });
});
