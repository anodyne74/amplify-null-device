import { findBilledTimeMismatches } from '../report-billed-time-mismatches.js';

const PHASES = {
  billedLoadMinutes: 15,
  billedPlacementMinutes: 40,
  billedPickupMinutes: 30,
  billedUnloadMinutes: 15,
};

describe('findBilledTimeMismatches', () => {
  it('lists a Route whose total no longer matches its phases, and whether it was invoiced', () => {
    const routes = [
      { id: 'r1', routeCode: 'W40-26-001', status: 'completed', overrideDurationMinutes: 95, ...PHASES },
      { id: 'r2', routeCode: 'W40-26-002', status: 'archived', overrideDurationMinutes: 120, ...PHASES },
    ];
    expect(findBilledTimeMismatches(routes, new Set(['r2']))).toEqual([
      { id: 'r1', routeCode: 'W40-26-001', status: 'completed', totalMinutes: 95, phaseSum: 100, invoiced: false },
      { id: 'r2', routeCode: 'W40-26-002', status: 'archived', totalMinutes: 120, phaseSum: 100, invoiced: true },
    ]);
  });

  it('skips Routes whose total matches, or that have no total or not all four phases', () => {
    const routes = [
      { id: 'match', overrideDurationMinutes: 100, ...PHASES },
      { id: 'no-total', ...PHASES },
      { id: 'legacy', overrideDurationMinutes: 90 },
      { id: 'partial', overrideDurationMinutes: 60, billedLoadMinutes: 15 },
    ];
    expect(findBilledTimeMismatches(routes)).toEqual([]);
  });
});
