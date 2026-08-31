import {
  MIN_BILLED_MINUTES,
  minutesBetween,
  round5,
  defaultBilledMinutes,
  sumBilledMinutes,
  formatDuration,
} from './signRunBilling';

describe('minutesBetween', () => {
  it('returns the elapsed minutes between two ISO timestamps', () => {
    expect(minutesBetween('2026-08-31T10:00:00.000Z', '2026-08-31T10:42:00.000Z')).toBe(42);
  });

  it('rounds to the nearest minute', () => {
    expect(minutesBetween('2026-08-31T10:00:00.000Z', '2026-08-31T10:00:29.000Z')).toBe(0);
    expect(minutesBetween('2026-08-31T10:00:00.000Z', '2026-08-31T10:00:31.000Z')).toBe(1);
  });

  it('returns 0 when either timestamp is missing', () => {
    expect(minutesBetween(null, '2026-08-31T10:00:00.000Z')).toBe(0);
    expect(minutesBetween('2026-08-31T10:00:00.000Z', undefined)).toBe(0);
    expect(minutesBetween(undefined, undefined)).toBe(0);
  });

  it('returns 0 for an unparsable timestamp rather than NaN', () => {
    expect(minutesBetween('not-a-date', '2026-08-31T10:00:00.000Z')).toBe(0);
  });
});

describe('round5', () => {
  it('rounds to the nearest 5', () => {
    expect(round5(12)).toBe(10);
    expect(round5(13)).toBe(15);
    expect(round5(20)).toBe(20);
  });

  it('floors at 5 for small or zero values', () => {
    expect(round5(0)).toBe(5);
    expect(round5(2)).toBe(5);
  });
});

describe('defaultBilledMinutes', () => {
  it('rounds the measured minutes to the nearest 5', () => {
    expect(defaultBilledMinutes('placement', 22)).toBe(20);
  });

  it('floors load and unload at their 15 min minimum', () => {
    expect(defaultBilledMinutes('load', 0)).toBe(15);
    expect(defaultBilledMinutes('unload', 6)).toBe(15);
  });

  it('floors placement and pickup at their 5 min minimum', () => {
    expect(defaultBilledMinutes('placement', 0)).toBe(5);
    expect(defaultBilledMinutes('pickup', 1)).toBe(5);
  });

  it('exposes the same minimums used internally', () => {
    expect(MIN_BILLED_MINUTES).toEqual({ load: 15, placement: 5, pickup: 5, unload: 15 });
  });
});

describe('sumBilledMinutes', () => {
  it('sums all four phases', () => {
    expect(sumBilledMinutes({ load: 15, placement: 20, pickup: 25, unload: 15 })).toBe(75);
  });
});

describe('formatDuration', () => {
  it('formats sub-hour durations as minutes only', () => {
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(0)).toBe('0m');
  });

  it('formats hour-plus durations as hours and minutes', () => {
    expect(formatDuration(60)).toBe('1h 0m');
    expect(formatDuration(125)).toBe('2h 5m');
  });
});
