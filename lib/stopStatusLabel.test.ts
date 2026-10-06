import { getStopStatusLabel, stopProgressTone } from './stopStatusLabel';
import { settleStopNotes } from './stopProgress';

describe('getStopStatusLabel — in-progress route, phase-specific branch', () => {
  it("shows Couldn't Collect with its reason", () => {
    const notes = settleStopNotes('', 'pickup', 'couldntCollect', '2026-08-31T10:00:00.000Z', 'Gate locked / no access');
    expect(getStopStatusLabel({ notes }, 'pickup', 'in_progress')).toBe("Couldn't collect · Gate locked / no access");
  });

  it("shows a bare Couldn't Collect label when no reason was recorded", () => {
    const notes = settleStopNotes('', 'pickup', 'couldntCollect', '2026-08-31T10:00:00.000Z');
    expect(getStopStatusLabel({ notes }, 'pickup', 'in_progress')).toBe("Couldn't collect");
  });

  it('shows the completed label for the current phase', () => {
    const notes = settleStopNotes('', 'placement', 'complete', '2026-08-31T10:00:00.000Z');
    expect(getStopStatusLabel({ notes }, 'placement', 'in_progress')).toBe('Signs placed');
  });

  it('shows "Load signs" instead of "Awaiting placement" for a planned route', () => {
    expect(getStopStatusLabel({ notes: null }, 'placement', 'planned')).toBe('Load signs');
  });

  it('shows "Awaiting pickup" for a pending stop on an in-progress pickup phase', () => {
    expect(getStopStatusLabel({ notes: null }, 'pickup', 'in_progress')).toBe('Awaiting pickup');
  });

  it('shows "Awaiting placement" for a pending stop on a non-planned placement phase', () => {
    expect(getStopStatusLabel({ notes: null }, 'placement', 'in_progress')).toBe('Awaiting placement');
  });
});

describe('getStopStatusLabel — completed/archived routes label each stop by Pickup, its last phase', () => {
  const placed = settleStopNotes('', 'placement', 'complete', '2026-08-31T09:00:00.000Z');

  it('reports a stop collected once its pickup is done, whatever the route last showed', () => {
    const notes = settleStopNotes(placed, 'pickup', 'complete', '2026-08-31T10:00:00.000Z');
    expect(getStopStatusLabel({ notes }, 'pickup', 'completed')).toBe('Signs collected');
  });

  it("keeps Couldn't Collect, with its reason, after the route is completed", () => {
    const notes = settleStopNotes(placed, 'pickup', 'couldntCollect', '2026-08-31T10:00:00.000Z', 'Gate locked');
    expect(getStopStatusLabel({ notes }, 'pickup', 'completed')).toBe("Couldn't collect · Gate locked");
  });

  it('labels a stop by its pickup whatever its service type', () => {
    const notes = settleStopNotes(placed, 'pickup', 'complete', '2026-08-31T10:00:00.000Z');
    expect(getStopStatusLabel({ notes, serviceType: 'inspection' }, 'pickup', 'completed')).toBe('Signs collected');
  });

  it('reports done for a legacy-imported stop regardless of executionPhase', () => {
    expect(
      getStopStatusLabel(
        { notes: null, actualDepartureTime: '2026-08-31T10:00:00.000Z' },
        'placement',
        'completed'
      )
    ).toBe('Signs collected');
  });

  it('reports "At stop" for a stop that arrived but has not departed', () => {
    expect(
      getStopStatusLabel({ notes: null, actualArrivalTime: '2026-08-31T10:00:00.000Z' }, null, 'archived')
    ).toBe('At stop');
  });

  it('reports "Signs pending" for a stop with no activity yet', () => {
    expect(getStopStatusLabel({ notes: null }, null, 'archived')).toBe('Signs pending');
  });
});

describe('stopProgressTone', () => {
  const placed = settleStopNotes('', 'placement', 'complete', '2026-08-31T09:00:00.000Z');
  const pickedUp = settleStopNotes(placed, 'pickup', 'complete', '2026-08-31T10:00:00.000Z');
  const couldntCollect = settleStopNotes(placed, 'pickup', 'couldntCollect', '2026-08-31T10:00:00.000Z', 'No access');

  it('goes from awaiting to placed to picked up', () => {
    expect(stopProgressTone({ notes: null }, 'placement')).toBe('awaiting');
    expect(stopProgressTone({ notes: placed }, 'placement')).toBe('placed');
    expect(stopProgressTone({ notes: placed }, 'pickup')).toBe('placed');
    expect(stopProgressTone({ notes: pickedUp }, 'pickup')).toBe('pickedUp');
  });

  it("reads Couldn't Collect in Pickup, and placed while Placement is shown, as the label does", () => {
    expect(stopProgressTone({ notes: couldntCollect }, 'pickup')).toBe('couldntCollect');
    expect(stopProgressTone({ notes: couldntCollect }, 'placement')).toBe('placed');
    // Collected later: picked up, like its label.
    const recovered = settleStopNotes(couldntCollect, 'pickup', 'complete', '2026-08-31T11:00:00.000Z');
    expect(stopProgressTone({ notes: recovered }, 'pickup')).toBe('pickedUp');
    expect(getStopStatusLabel({ notes: recovered }, 'pickup', 'completed')).toBe('Signs collected');
  });

  it('ignores a stored service type', () => {
    const stop = { notes: placed };
    expect(stopProgressTone({ ...stop, serviceType: 'pickup' } as typeof stop, 'pickup')).toBe(stopProgressTone(stop, 'pickup'));
  });
});
