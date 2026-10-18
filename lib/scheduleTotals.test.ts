import { totalsWarnings } from '@/lib/scheduleTotals';

// Invented sheet: three properties, two agents, shaped like the real ones (a grand total and a total per agent).
const rows = [
  { numberOfSigns: 5, agent: 'Alex' },
  { numberOfSigns: 5, agent: 'Blake' },
  { numberOfSigns: 4, agent: 'Alex' },
];
const stated = { signs: 14, agents: [{ agent: 'Alex', signs: 9 }, { agent: 'Blake', signs: 5 }] };

describe('totalsWarnings', () => {
  it('makes no warning for a sheet that adds up', () => {
    expect(totalsWarnings({ rows, statedTotals: stated })).toEqual([]);
  });

  it('names both figures when the grand total is off', () => {
    expect(totalsWarnings({ rows: rows.slice(0, 2), statedTotals: { signs: 14 } })).toEqual([
      'The properties read add up to 10 signs, but the sheet says 14. Check the list against the file.',
    ]);
  });

  it('names the agent and both figures when one agent is off', () => {
    expect(totalsWarnings({ rows, statedTotals: { agents: [{ agent: 'Alex', signs: 12 }, { agent: 'Blake', signs: 5 }] } })).toEqual([
      "Alex's properties read add up to 9 signs, but the sheet says 12.",
    ]);
  });

  it('reports the grand total and an agent together', () => {
    expect(totalsWarnings({ rows, statedTotals: { signs: 20, agents: [{ agent: 'Blake', signs: 6 }] } })).toHaveLength(2);
  });

  it('joins a row to its agent however the sheet writes it', () => {
    const written = [{ numberOfSigns: 5, agent: 'AJ' }, { numberOfSigns: 5, agent: 'Blkae' }, { numberOfSigns: 4, agent: 'alex' }];
    expect(totalsWarnings({ rows: written, statedTotals: stated })).toEqual([]);
  });

  it('makes no warning when the sheet printed no totals', () => {
    expect(totalsWarnings({ rows })).toEqual([]);
    expect(totalsWarnings({ rows, statedTotals: null })).toEqual([]);
    expect(totalsWarnings({ rows, statedTotals: {} })).toEqual([]);
  });

  it('makes no warning when a row’s signs are unknown, since the sums would be short for the wrong reason', () => {
    expect(totalsWarnings({ rows: [...rows, { agent: 'Alex' }], statedTotals: stated })).toEqual([]);
    expect(totalsWarnings({ rows: [...rows, { numberOfSigns: null, agent: 'Alex' }], statedTotals: stated })).toEqual([]);
  });

  it('says one sign, not one signs', () => {
    expect(totalsWarnings({ rows: [{ numberOfSigns: 1 }], statedTotals: { signs: 2 } })[0]).toContain('add up to 1 sign,');
  });

  it('counts an agent whose rows are all missing as zero, so a lost agent shows', () => {
    expect(totalsWarnings({ rows: [{ numberOfSigns: 5, agent: 'Alex' }], statedTotals: { agents: [{ agent: 'Blake', signs: 5 }] } })).toEqual([
      "Blake's properties read add up to 0 signs, but the sheet says 5.",
    ]);
  });

  it('copes with empty and null entries', () => {
    expect(totalsWarnings({ rows: [null, ...rows], statedTotals: { signs: 14, agents: [null, ...stated.agents] } })).toEqual([]);
  });
});
