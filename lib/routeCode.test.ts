import { nextRouteCode, routeCodeClashes, routeCodeWeekPrefix } from './routeCode';

describe('routeCodeWeekPrefix', () => {
  it('counts weeks in blocks of seven days from 1 January, in the Placement Date\'s year', () => {
    expect(routeCodeWeekPrefix('2026-01-01')).toBe('W01-26');
    expect(routeCodeWeekPrefix('2026-01-07')).toBe('W01-26');
    expect(routeCodeWeekPrefix('2026-01-08')).toBe('W02-26');
    expect(routeCodeWeekPrefix('2026-10-17')).toBe('W42-26');
  });

  it('keeps the year of the Placement Date across New Year', () => {
    expect(routeCodeWeekPrefix('2026-12-31')).toBe('W52-26');
    expect(routeCodeWeekPrefix('2027-01-01')).toBe('W01-27');
  });

  it('never goes past week 52, in a leap year too', () => {
    expect(routeCodeWeekPrefix('2026-12-30')).toBe('W52-26');
    expect(routeCodeWeekPrefix('2028-12-31')).toBe('W52-28');
  });

  it('does not depend on the time zone or daylight saving', () => {
    expect(routeCodeWeekPrefix('2026-03-29')).toBe('W13-26');
    expect(routeCodeWeekPrefix('2026-10-04')).toBe('W40-26');
  });

  it('is null for something that is not a date yet', () => {
    expect(routeCodeWeekPrefix('')).toBeNull();
    expect(routeCodeWeekPrefix('2026-1-5')).toBeNull();
  });
});

describe('nextRouteCode', () => {
  const placement = '2026-10-17';

  it('starts a week at 001', () => {
    expect(nextRouteCode([], placement)).toBe('W42-26-001');
  });

  it('takes the first unused number, filling a gap', () => {
    expect(nextRouteCode(['W42-26-001', 'W42-26-003'], placement)).toBe('W42-26-002');
  });

  it('ignores other weeks, other years, blanks and codes not in the format', () => {
    expect(nextRouteCode(['W41-26-001', 'W42-25-001', null, undefined, '', 'W42-26-abc', 'W42-26-0001', 'custom'], placement)).toBe(
      'W42-26-001'
    );
  });

  it('numbers a Route placed on 31 December in its own year, not the next', () => {
    expect(nextRouteCode(['W52-26-001'], '2026-12-31')).toBe('W52-26-002');
    expect(nextRouteCode(['W52-26-001'], '2027-01-01')).toBe('W01-27-001');
  });

  it('counts past 999 without padding more', () => {
    const codes = Array.from({ length: 999 }, (_, i) => `W42-26-${String(i + 1).padStart(3, '0')}`);
    expect(nextRouteCode(codes, placement)).toBe('W42-26-1000');
  });

  it('is null until there is a Placement Date', () => {
    expect(nextRouteCode([], '')).toBeNull();
  });
});

describe('routeCodeClashes', () => {
  const routes = [
    { id: 'r1', routeCode: 'W42-26-001' },
    { id: 'r2', routeCode: 'w42-26-002 ' },
    { id: 'r3', routeCode: null },
    { id: 'r4' },
  ];

  it('finds the Route using a code, ignoring case and surrounding spaces', () => {
    expect(routeCodeClashes(routes, ' W42-26-002')).toEqual([routes[1]]);
    expect(routeCodeClashes(routes, 'w42-26-001')).toEqual([routes[0]]);
  });

  it('finds every Route that shares it', () => {
    const shared = [...routes, { id: 'r5', routeCode: 'W42-26-001' }];
    expect(routeCodeClashes(shared, 'W42-26-001').map((route) => route.id)).toEqual(['r1', 'r5']);
  });

  it('does not count the Route being edited', () => {
    expect(routeCodeClashes(routes, 'W42-26-001', 'r1')).toEqual([]);
  });

  it('finds nothing for a code nobody uses, or no code yet', () => {
    expect(routeCodeClashes(routes, 'W42-26-003')).toEqual([]);
    expect(routeCodeClashes(routes, '  ')).toEqual([]);
  });
});
