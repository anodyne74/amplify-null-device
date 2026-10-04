import { signsPlaced, signsCollected, missingSigns, groupByAgent, timedSigns, type SignCountStop } from './signRunTotals';
import { settleStopNotes } from './stopProgress';

function pickupDoneStop(overrides: Partial<SignCountStop> = {}): SignCountStop {
  return {
    numberOfSigns: 4,
    missingSignsCount: 0,
    notes: settleStopNotes('', 'pickup', 'complete', '2026-08-31T10:00:00.000Z'),
    ...overrides,
  };
}

function pickupSkippedStop(overrides: Partial<SignCountStop> = {}): SignCountStop {
  return {
    numberOfSigns: 4,
    missingSignsCount: 0,
    notes: settleStopNotes('', 'pickup', 'couldntCollect', '2026-08-31T10:00:00.000Z', 'No access'),
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

describe('a Stop a Load Change removed', () => {
  it('counts toward no total', () => {
    const removed = pickupDoneStop({ numberOfSigns: 7, missingSignsCount: 2, removed: true });
    const stops = [pickupDoneStop({ numberOfSigns: 3, missingSignsCount: 1 }), removed];
    expect(signsPlaced(stops)).toBe(3);
    expect(signsCollected(stops)).toBe(2);
    expect(missingSigns(stops)).toBe(1);
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

describe('groupByAgent', () => {
  it('groups stops by agent, preserving first-seen order', () => {
    const groups = groupByAgent([
      { agent: "Betty O'Shea", numberOfSigns: 3 },
      { agent: 'David Mun', numberOfSigns: 2 },
      { agent: "Betty O'Shea", numberOfSigns: 1 },
    ]);

    expect(groups.map((g) => g.agent)).toEqual(["Betty O'Shea", 'David Mun']);
    expect(groups[0].stops).toHaveLength(2);
    expect(groups[1].stops).toHaveLength(1);
  });

  it('buckets stops with no agent under Unassigned rather than dropping them', () => {
    const groups = groupByAgent([{ agent: null }, { agent: '  ' }]);

    expect(groups).toHaveLength(1);
    expect(groups[0].agent).toBe('Unassigned');
    expect(groups[0].stops).toHaveLength(2);
  });

  it('returns an empty array for no stops', () => {
    expect(groupByAgent([])).toEqual([]);
  });
});

describe('timedSigns', () => {
  it('counts every sign at an auction property as timed', () => {
    expect(timedSigns({ numberOfSigns: 5, isAuction: true })).toBe(5);
  });

  it('counts one timed sign at any other property', () => {
    expect(timedSigns({ numberOfSigns: 5, isAuction: false })).toBe(1);
    expect(timedSigns({ numberOfSigns: 1 })).toBe(1);
  });

  it('counts none at a property with no signs', () => {
    expect(timedSigns({ numberOfSigns: 0, isAuction: true })).toBe(0);
    expect(timedSigns({ numberOfSigns: null })).toBe(0);
  });
});
