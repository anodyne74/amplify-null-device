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

  it("reads Couldn't Collect with its time and reason", () => {
    const notes = settleStopNotes(null, 'pickup', 'couldntCollect', LATER, 'Gate locked / no access');
    expect(stopProgress({ notes }).pickup).toEqual({ state: 'couldntCollect', at: LATER, reason: 'Gate locked / no access' });
  });

  it("keeps a reason from breaking the marker it's stored in", () => {
    const notes = settleStopNotes(null, 'pickup', 'couldntCollect', LATER, 'Gate [locked] | dog');
    expect(stopProgress({ notes }).pickup.reason).toBe('Gate [locked dog');
  });

  it('reads an old Placement skip marker as nothing: Placement is only ever awaiting or done', () => {
    expect(stopProgress({ notes: `[PLACEMENT_SKIPPED:${AT}|No access]` }).placement.state).toBe('pending');
    expect(displayNotes(`Gate code [PLACEMENT_SKIPPED:${AT}|No access]`)).toBe('Gate code');
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
    expect(isStopFinished({ notes: placed })).toBe(false);
    expect(isStopCompleted({ notes: placed })).toBe(false);
  });

  it('is both once the last phase is done', () => {
    const notes = settleStopNotes(placed, 'pickup', 'complete', LATER);
    expect(isStopFinished({ notes })).toBe(true);
    expect(isStopCompleted({ notes })).toBe(true);
  });

  it('places and picks up every Stop, whatever its service type', () => {
    for (const serviceType of ['delivery', 'pickup', 'inspection', null]) {
      expect(isStopFinished({ serviceType, notes: placed })).toBe(false);
      const notes = settleStopNotes(placed, 'pickup', 'complete', LATER);
      expect(isStopCompleted({ serviceType, notes })).toBe(true);
    }
  });

  it("counts Couldn't Collect as finished but not completed", () => {
    const notes = settleStopNotes(placed, 'pickup', 'couldntCollect', LATER, 'No access');
    expect(isStopFinished({ notes })).toBe(true);
    expect(isStopCompleted({ notes })).toBe(false);
  });

  it('reads a legacy Stop as completed', () => {
    expect(isStopCompleted({ actualDepartureTime: AT })).toBe(true);
  });
});

describe('settleStopNotes', () => {
  it('keeps the operator-typed notes', () => {
    expect(settleStopNotes('Gate code 4821', 'placement', 'complete', AT)).toBe(`Gate code 4821 [PLACEMENT_DONE:${AT}]`);
  });

  it('replaces an earlier settlement of the same phase rather than adding another', () => {
    const first = settleStopNotes(null, 'pickup', 'couldntCollect', AT, 'Owner or tenant refused');
    const second = settleStopNotes(first, 'pickup', 'couldntCollect', LATER, 'Access blocked');
    expect(stopProgress({ notes: second }).pickup).toEqual({ state: 'couldntCollect', at: LATER, reason: 'Access blocked' });
    expect(second.match(/PICKUP_SKIPPED/g)).toHaveLength(1);
  });

  it("lets a Couldn't Collect Stop be collected later, and a collected one Couldn't Collect", () => {
    const couldnt = settleStopNotes(null, 'pickup', 'couldntCollect', AT, 'No access');
    const done = settleStopNotes(couldnt, 'pickup', 'complete', LATER);
    expect(stopProgress({ notes: done }).pickup).toEqual({ state: 'done', at: LATER, reason: null });
    expect(stopProgress({ notes: settleStopNotes(done, 'pickup', 'couldntCollect', LATER, 'No access') }).pickup.state).toBe(
      'couldntCollect'
    );
  });

  it("completing Placement leaves a Pickup outcome alone", () => {
    const couldnt = settleStopNotes(null, 'pickup', 'couldntCollect', LATER, 'No access');
    expect(stopProgress({ notes: settleStopNotes(couldnt, 'placement', 'complete', AT) }).pickup.state).toBe('couldntCollect');
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
    const notes = settleStopNotes(settleStopNotes('Gate code 4821', 'placement', 'complete', AT), 'pickup', 'couldntCollect', LATER, 'No access');
    expect(displayNotes(notes)).toBe('Gate code 4821');
  });

  it('is empty for missing or marker-only notes', () => {
    expect(displayNotes(null)).toBe('');
    expect(displayNotes(undefined)).toBe('');
    expect(displayNotes(settleStopNotes(null, 'placement', 'complete', AT))).toBe('');
  });
});
