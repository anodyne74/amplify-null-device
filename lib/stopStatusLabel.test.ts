import { getStopStatusLabel } from './stopStatusLabel';
import { upsertMarker, PLACEMENT_DONE_MARKER, PLACEMENT_SKIPPED_MARKER, PICKUP_SKIPPED_MARKER } from './stopExecutionMarkers';

describe('getStopStatusLabel — in-progress route, phase-specific branch', () => {
  it('shows a skip reason when one is present', () => {
    const notes = upsertMarker('', PLACEMENT_SKIPPED_MARKER, '2026-08-31T10:00:00.000Z', 'Gate locked / no access');
    expect(getStopStatusLabel({ notes }, 'placement', 'in_progress')).toBe('Placement skipped · Gate locked / no access');
  });

  it('shows a bare skip label when no reason was recorded', () => {
    const notes = upsertMarker('', PICKUP_SKIPPED_MARKER, '2026-08-31T10:00:00.000Z');
    expect(getStopStatusLabel({ notes }, 'pickup', 'in_progress')).toBe('Pickup skipped');
  });

  it('shows the completed label for the current phase', () => {
    const notes = upsertMarker('', PLACEMENT_DONE_MARKER, '2026-08-31T10:00:00.000Z');
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

describe('getStopStatusLabel — completed/archived routes fall back to the legacy branch', () => {
  it('reports done for a legacy-imported stop regardless of executionPhase', () => {
    expect(
      getStopStatusLabel(
        { notes: null, serviceType: 'pickup', actualDepartureTime: '2026-08-31T10:00:00.000Z' },
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
