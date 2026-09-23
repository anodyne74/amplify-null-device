import { signsPlaced, signsCollected, missingSigns, type SignCountStop } from './signRunTotals';
import { PICKUP_DONE_MARKER, PICKUP_SKIPPED_MARKER, upsertMarker } from './stopExecutionMarkers';

function pickupDoneStop(overrides: Partial<SignCountStop> = {}): SignCountStop {
  return {
    numberOfSigns: 4,
    missingSignsCount: 0,
    notes: upsertMarker('', PICKUP_DONE_MARKER, '2026-08-31T10:00:00.000Z'),
    ...overrides,
  };
}

function pickupSkippedStop(overrides: Partial<SignCountStop> = {}): SignCountStop {
  return {
    numberOfSigns: 4,
    missingSignsCount: 0,
    notes: upsertMarker('', PICKUP_SKIPPED_MARKER, '2026-08-31T10:00:00.000Z', 'No access'),
    ...overrides,
  };
}

function pickupNotYetDoneStop(overrides: Partial<SignCountStop> = {}): SignCountStop {
  return {
    numberOfSigns: 4,
    missingSignsCount: 0,
    notes: '',
    ...overrides,
  };
}

describe('signsPlaced', () => {
  it('sums numberOfSigns across every stop, no exclusions', () => {
    const stops = [pickupDoneStop({ numberOfSigns: 3 }), pickupSkippedStop({ numberOfSigns: 5 }), pickupNotYetDoneStop({ numberOfSigns: 2 })];
    expect(signsPlaced(stops)).toBe(10);
  });

  it('treats missing numberOfSigns as 0', () => {
    expect(signsPlaced([{ numberOfSigns: null }, { numberOfSigns: undefined }])).toBe(0);
  });

  it('does not subtract missingSignsCount', () => {
    const stops = [pickupDoneStop({ numberOfSigns: 5, missingSignsCount: 3 })];
    expect(signsPlaced(stops)).toBe(5);
  });
});

describe('signsCollected', () => {
  it('counts a completed, non-skipped stop net of its own missing signs', () => {
    const stops = [pickupDoneStop({ numberOfSigns: 5, missingSignsCount: 2 })];
    expect(signsCollected(stops)).toBe(3);
  });

  it('excludes stops that were skipped at pickup entirely', () => {
    const stops = [pickupSkippedStop({ numberOfSigns: 5, missingSignsCount: 0 })];
    expect(signsCollected(stops)).toBe(0);
  });

  it('excludes stops not yet completed at pickup — a route in progress reports a partial total', () => {
    const stops = [pickupDoneStop({ numberOfSigns: 4 }), pickupNotYetDoneStop({ numberOfSigns: 6 })];
    expect(signsCollected(stops)).toBe(4);
  });

  it('never goes negative for a stop where missingSignsCount exceeds numberOfSigns', () => {
    const stops = [pickupDoneStop({ numberOfSigns: 2, missingSignsCount: 5 })];
    expect(signsCollected(stops)).toBe(0);
  });

  it('sums across multiple completed stops', () => {
    const stops = [
      pickupDoneStop({ numberOfSigns: 5, missingSignsCount: 1 }),
      pickupDoneStop({ numberOfSigns: 3, missingSignsCount: 0 }),
      pickupSkippedStop({ numberOfSigns: 10 }),
    ];
    expect(signsCollected(stops)).toBe(7);
  });
});

describe('missingSigns', () => {
  it('sums missingSignsCount across every stop, regardless of completion status', () => {
    const stops = [
      pickupDoneStop({ missingSignsCount: 2 }),
      pickupSkippedStop({ missingSignsCount: 1 }),
      pickupNotYetDoneStop({ missingSignsCount: 3 }),
    ];
    expect(missingSigns(stops)).toBe(6);
  });

  it('treats missing missingSignsCount as 0', () => {
    expect(missingSigns([{ missingSignsCount: null }, { missingSignsCount: undefined }])).toBe(0);
  });
});
