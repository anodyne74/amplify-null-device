import { nextRouteCode, routeCodeWeekPrefix } from './routeCode';

// Local-time dates, as the browser makes them: (year, month 1-12, day).
const on = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

describe('routeCodeWeekPrefix', () => {
  it('counts weeks in blocks of seven days from 1 January, two days back', () => {
    expect(routeCodeWeekPrefix(on(2026, 10, 17))).toBe('W42-26');
    expect(routeCodeWeekPrefix(on(2026, 1, 9))).toBe('W01-26');
    expect(routeCodeWeekPrefix(on(2026, 1, 10))).toBe('W02-26');
  });

  it('reads the first two days of the year as the previous year, as it always has', () => {
    expect(routeCodeWeekPrefix(on(2026, 1, 1))).toBe('W52-25');
    expect(routeCodeWeekPrefix(on(2026, 1, 2))).toBe('W53-25');
    expect(routeCodeWeekPrefix(on(2026, 1, 3))).toBe('W01-26');
  });

  it('pads the week and takes the last two digits of the year', () => {
    expect(routeCodeWeekPrefix(on(2105, 2, 1))).toBe('W05-05');
  });
});

describe('nextRouteCode', () => {
  const date = on(2026, 10, 17);

  it('starts a week at 001', () => {
    expect(nextRouteCode([], date)).toBe('W42-26-001');
  });

  it('takes the first unused number, filling a gap', () => {
    expect(nextRouteCode(['W42-26-001', 'W42-26-003'], date)).toBe('W42-26-002');
  });

  it('ignores other weeks, other years, blanks and codes not in the format', () => {
    expect(nextRouteCode(['W40-26-001', 'W42-25-001', null, undefined, '', 'W42-26-abc', 'W42-26-0001', 'custom'], date)).toBe('W42-26-001');
  });

  it('counts past 999 without padding more', () => {
    const codes = Array.from({ length: 999 }, (_, i) => `W42-26-${String(i + 1).padStart(3, '0')}`);
    expect(nextRouteCode(codes, date)).toBe('W42-26-1000');
  });
});
