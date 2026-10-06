import { formatStopProperty, groupStopsByAgent, groupStopsByAgentAlphabetically } from './stopFormatting';

describe('formatStopProperty', () => {
  it('strips state/postcode and country, keeping street + suburb', () => {
    expect(formatStopProperty({ formattedAddress: '52 Beecroft Rd, Epping NSW 2121, Australia' })).toBe(
      '52 Beecroft Rd, Epping'
    );
  });

  it('falls back to address when formattedAddress is missing', () => {
    expect(formatStopProperty({ address: '10 Smith St, Ryde NSW 2112' })).toBe('10 Smith St, Ryde');
  });

  it('falls back to a placeholder when no address is present', () => {
    expect(formatStopProperty({})).toBe('Unknown property');
  });
});

describe('groupStopsByAgent', () => {
  it('groups stops by agent, preserving first-seen order', () => {
    const groups = groupStopsByAgent([
      { agent: 'Betty O\'Shea', numberOfSigns: 3 },
      { agent: 'David Mun', numberOfSigns: 2 },
      { agent: 'Betty O\'Shea', numberOfSigns: 1 },
    ]);

    expect(groups.map((g) => g.agent)).toEqual(["Betty O'Shea", 'David Mun']);
    expect(groups[0].signCount).toBe(4);
    expect(groups[0].stops).toHaveLength(2);
    expect(groups[1].signCount).toBe(2);
  });

  it('buckets stops with no agent under Unassigned rather than dropping them', () => {
    const groups = groupStopsByAgent([{ agent: null, numberOfSigns: 5 }, { agent: '  ', numberOfSigns: 1 }]);

    expect(groups).toHaveLength(1);
    expect(groups[0].agent).toBe('Unassigned');
    expect(groups[0].signCount).toBe(6);
  });

  it('returns an empty array for no stops', () => {
    expect(groupStopsByAgent([])).toEqual([]);
  });
});

describe('groupStopsByAgentAlphabetically', () => {
  it('sorts groups by agent ignoring case, with Unassigned last and stops in run order', () => {
    const groups = groupStopsByAgentAlphabetically([
      { agent: 'GZ', sequence: 1 },
      { agent: null, sequence: 2 },
      { agent: 'bo', sequence: 3 },
      { agent: 'KP', sequence: 4 },
      { agent: 'DM', sequence: 5 },
      { agent: 'bo', sequence: 6 },
    ]);

    expect(groups.map((g) => g.agent)).toEqual(['bo', 'DM', 'GZ', 'KP', 'Unassigned']);
    expect(groups[0].stops.map((s) => s.sequence)).toEqual([3, 6]);
  });
});
