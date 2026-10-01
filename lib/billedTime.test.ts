import {
  MIN_BILLED_MINUTES,
  adjustBilledMinutes,
  billedTime,
  billedTimePatch,
  defaultBilledMinutes,
  isBillableTotal,
  measuredPhaseMinutes,
  nextBillableTotal,
  parseDistanceKm,
  startingBilledMinutes,
  sumBilledMinutes,
} from './billedTime';

const PHASES = { load: 15, placement: 40, pickup: 30, unload: 15 };
const BILLED = {
  billedLoadMinutes: 15,
  billedPlacementMinutes: 40,
  billedPickupMinutes: 30,
  billedUnloadMinutes: 15,
};

describe('billedTime', () => {
  it('reads a finalised Route by phase, with the total as their sum', () => {
    expect(billedTime({ ...BILLED, overrideDurationMinutes: 100, overrideDistanceKm: 37.5 })).toEqual({
      phases: PHASES,
      totalMinutes: 100,
      distanceKm: 37.5,
    });
  });

  it('reads a Route whose total no longer matches its phases as total-only, and the total wins', () => {
    expect(billedTime({ ...BILLED, overrideDurationMinutes: 95 })).toMatchObject({ phases: null, totalMinutes: 95 });
  });

  it('reads a Route with only some phases billed as total-only', () => {
    expect(billedTime({ billedLoadMinutes: 15, overrideDurationMinutes: 60 })).toMatchObject({
      phases: null,
      totalMinutes: 60,
    });
  });

  it('sums the phases when the total was never cached', () => {
    expect(billedTime(BILLED)).toMatchObject({ phases: PHASES, totalMinutes: 100 });
  });

  it('falls back to the measured duration for a Route from before the Sign Run', () => {
    expect(billedTime({ actualDurationMinutes: 90 })).toMatchObject({ phases: null, totalMinutes: 90 });
  });

  it('prefers the billed total over the measured duration', () => {
    expect(billedTime({ actualDurationMinutes: 120, overrideDurationMinutes: 150 }).totalMinutes).toBe(150);
  });

  it('falls back to the two measured legs for distance', () => {
    expect(billedTime({ signsPlacedDistanceKm: 12.5, signsPickedUpDistanceKm: 10 }).distanceKm).toBe(22.5);
    expect(billedTime({ signsPlacedDistanceKm: 12.5 }).distanceKm).toBe(12.5);
  });

  it('prefers the billed distance over the measured legs, including 0', () => {
    expect(billedTime({ signsPlacedDistanceKm: 12.5, overrideDistanceKm: 0 }).distanceKm).toBe(0);
  });

  it('is null throughout while nothing has been billed or measured', () => {
    expect(billedTime({})).toEqual({ phases: null, totalMinutes: null, distanceKm: null });
  });
});

describe('billedTimePatch', () => {
  it('writes every phase, their sum and the distance, so the stored total always matches', () => {
    const patch = billedTimePatch(PHASES, 37.5);
    expect(patch).toEqual({ ...BILLED, overrideDurationMinutes: 100, overrideDistanceKm: 37.5 });
    expect(billedTime(patch).phases).toEqual(PHASES);
  });
});

describe('measuredPhaseMinutes', () => {
  it('measures each phase from its own start/end pair, to the nearest minute', () => {
    expect(
      measuredPhaseMinutes({
        loadStartedAt: '2026-08-31T07:37:00.000Z',
        loadConfirmedAt: '2026-08-31T08:00:00.000Z',
        placementStartTime: '2026-08-31T08:15:00.000Z',
        placementEndTime: '2026-08-31T08:37:31.000Z',
        pickupStartTime: '2026-08-31T08:40:00.000Z',
        pickupEndTime: '2026-08-31T08:52:29.000Z',
        unloadStartedAt: '2026-08-31T08:58:00.000Z',
        unloadConfirmedAt: '2026-08-31T09:10:00.000Z',
      })
    ).toEqual({ load: 23, placement: 23, pickup: 12, unload: 12 });
  });

  it('measures 0 for a phase missing either timestamp, or with one that will not parse', () => {
    expect(
      measuredPhaseMinutes({
        loadStartedAt: '2026-08-31T07:37:00.000Z',
        loadConfirmedAt: '2026-08-31T08:00:00.000Z',
        placementStartTime: 'not-a-date',
        placementEndTime: '2026-08-31T08:37:00.000Z',
        pickupStartTime: '2026-08-31T08:40:00.000Z',
      })
    ).toEqual({ load: 23, placement: 0, pickup: 0, unload: 0 });
  });
});

describe('defaultBilledMinutes', () => {
  it('rounds the measured minutes to the nearest 5', () => {
    expect(defaultBilledMinutes('placement', 22)).toBe(20);
    expect(defaultBilledMinutes('placement', 23)).toBe(25);
  });

  it('floors load and unload at their 15 min minimum', () => {
    expect(defaultBilledMinutes('load', 0)).toBe(15);
    expect(defaultBilledMinutes('unload', 6)).toBe(15);
  });

  it('floors placement and pickup at their 5 min minimum', () => {
    expect(defaultBilledMinutes('placement', 0)).toBe(5);
    expect(defaultBilledMinutes('pickup', 1)).toBe(5);
  });

  it('exposes the minimums', () => {
    expect(MIN_BILLED_MINUTES).toEqual({ load: 15, placement: 5, pickup: 5, unload: 15 });
  });
});

describe('startingBilledMinutes', () => {
  it('starts from what was already billed, phase by phase, and defaults the rest', () => {
    expect(
      startingBilledMinutes({
        billedPlacementMinutes: 40,
        placementStartTime: '2026-08-31T08:15:00.000Z',
        placementEndTime: '2026-08-31T08:37:00.000Z',
        pickupStartTime: '2026-08-31T08:40:00.000Z',
        pickupEndTime: '2026-08-31T08:52:00.000Z',
      })
    ).toEqual({ load: 15, placement: 40, pickup: 10, unload: 15 });
  });
});

describe('adjustBilledMinutes', () => {
  it('steps one phase and leaves the others', () => {
    expect(adjustBilledMinutes(PHASES, 'pickup', 5)).toEqual({ ...PHASES, pickup: 35 });
  });

  it('never goes below the phase minimum', () => {
    expect(adjustBilledMinutes(PHASES, 'load', -5).load).toBe(15);
  });

  it('never goes above 600 minutes', () => {
    expect(adjustBilledMinutes({ ...PHASES, placement: 598 }, 'placement', 5).placement).toBe(600);
  });
});

describe('sumBilledMinutes', () => {
  it('sums all four phases', () => {
    expect(sumBilledMinutes({ load: 15, placement: 20, pickup: 25, unload: 15 })).toBe(75);
  });
});

describe('billable totals', () => {
  it('accepts only 15-minute increments', () => {
    expect(isBillableTotal(90)).toBe(true);
    expect(isBillableTotal(95)).toBe(false);
  });

  it('rounds up to the next 15-minute increment', () => {
    expect(nextBillableTotal(95)).toBe(105);
    expect(nextBillableTotal(90)).toBe(90);
  });
});

describe('parseDistanceKm', () => {
  it.each([
    ['0', 0],
    ['37.5', 37.5],
    ['37.46', 37.5],
    [' 12 ', 12],
    ['8.', 8],
    ['.5', 0.5],
    ['1200', 1200],
  ])('reads %p as %p km', (text, km) => {
    expect(parseDistanceKm(text)).toBe(km);
  });

  it.each(['', ' ', 'abc', '-3', '1.2.3', '1,5', '5km'])('rejects %p', (text) => {
    expect(parseDistanceKm(text)).toBeNull();
  });
});
