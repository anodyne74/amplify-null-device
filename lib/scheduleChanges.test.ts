import { fieldChanges, matchAgent, withPreviewNote } from '@/lib/scheduleChanges';

// Invented agents, in the two styles the real sheets have used: first names one month, initials another.
const NAMES = ['Alex', 'Blake', 'Casey'];
const INITIALS = ['AJ', 'BK', 'CM'];

describe('matchAgent', () => {
  it('takes the Route’s own spelling', () => {
    expect(matchAgent('alex', NAMES)).toEqual({ agent: 'Alex', newAgent: false });
    expect(matchAgent(' Alex ', NAMES)).toEqual({ agent: 'Alex', newAgent: false });
  });

  it('reads initials as the name that starts with them, and a name as the initials', () => {
    expect(matchAgent('AJ', NAMES)).toEqual({ agent: 'Alex', newAgent: false });
    expect(matchAgent('Blake', INITIALS)).toEqual({ agent: 'BK', newAgent: false });
  });

  it('forgives a swap or a slip of the keys', () => {
    expect(matchAgent('Blkae', NAMES)).toEqual({ agent: 'Blake', newAgent: false });
    expect(matchAgent('Caesy', NAMES)).toEqual({ agent: 'Casey', newAgent: false });
  });

  it('does not forgive a slip in a short name, where one edit is another person', () => {
    expect(matchAgent('Jo', ['Bo']).newAgent).toBe(true);
    expect(matchAgent('Ann', ['Amy']).newAgent).toBe(true);
  });

  it('flags an agent the Route does not have, as written', () => {
    expect(matchAgent('Dana', NAMES)).toEqual({ agent: 'Dana', newAgent: true });
    expect(matchAgent('DK', NAMES)).toEqual({ agent: 'DK', newAgent: true });
  });

  it('flags initials that two agents could be, instead of choosing', () => {
    expect(matchAgent('AB', ['Alex', 'Ariel']).newAgent).toBe(true);
  });

  it('flags every agent when the Route has none', () => {
    expect(matchAgent('Alex', [])).toEqual({ agent: 'Alex', newAgent: true });
  });
});

describe('fieldChanges', () => {
  const stop = { numberOfSigns: 5, agent: 'Alex', isAuction: false, notes: null };

  it('proposes nothing when the sheet agrees, however the agent is written', () => {
    expect(fieldChanges({ numberOfSigns: 5, agent: 'AJ', isAuction: false }, stop, NAMES)).toEqual([]);
  });

  it('proposes nothing for what the sheet leaves blank', () => {
    expect(fieldChanges({ numberOfSigns: null, agent: null }, stop, NAMES)).toEqual([]);
    expect(fieldChanges({ agent: '  ' }, stop, NAMES)).toEqual([]);
  });

  it('proposes the agent as the Route spells it, or as a new agent', () => {
    expect(fieldChanges({ agent: 'blake' }, stop, NAMES)).toEqual([{ field: 'agent', from: 'Alex', to: 'Blake', newAgent: false }]);
    expect(fieldChanges({ agent: 'Dana' }, stop, NAMES)).toEqual([{ field: 'agent', from: 'Alex', to: 'Dana', newAgent: true }]);
  });

  it('proposes an agent for a Stop that had none', () => {
    expect(fieldChanges({ agent: 'Alex' }, { agent: null }, NAMES)).toEqual([{ field: 'agent', from: undefined, to: 'Alex', newAgent: false }]);
  });

  it('proposes the number of signs, including from none', () => {
    expect(fieldChanges({ numberOfSigns: 1 }, stop, NAMES)).toEqual([{ field: 'numberOfSigns', from: 5, to: 1 }]);
    expect(fieldChanges({ numberOfSigns: 4 }, {}, NAMES)).toEqual([{ field: 'numberOfSigns', from: undefined, to: 4 }]);
    expect(fieldChanges({ numberOfSigns: 0 }, stop, NAMES)).toEqual([{ field: 'numberOfSigns', from: 5, to: 0 }]);
  });

  it('proposes the auction mark both ways', () => {
    expect(fieldChanges({ isAuction: true }, stop, NAMES)).toEqual([{ field: 'isAuction', from: false, to: true }]);
    expect(fieldChanges({ isAuction: false }, { isAuction: true }, NAMES)).toEqual([{ field: 'isAuction', from: true, to: false }]);
    expect(fieldChanges({}, { isAuction: null }, NAMES)).toEqual([]);
  });

  it('proposes carrying a Preview into the notes, once', () => {
    expect(fieldChanges({ isPreview: true }, stop, NAMES)).toEqual([{ field: 'notes', from: undefined, to: 'Preview' }]);
    expect(fieldChanges({ isPreview: true }, { ...stop, notes: 'Side gate' }, NAMES)).toEqual([{ field: 'notes', from: 'Side gate', to: 'Side gate; Preview' }]);
    expect(fieldChanges({ isPreview: true }, { ...stop, notes: 'Preview only' }, NAMES)).toEqual([]);
  });

  it('lists every change, agent first', () => {
    const changes = fieldChanges({ agent: 'Dana', numberOfSigns: 2, isAuction: true, isPreview: true }, stop, NAMES);
    expect(changes.map(({ field }) => field)).toEqual(['agent', 'numberOfSigns', 'isAuction', 'notes']);
  });
});

describe('withPreviewNote', () => {
  it('leaves a note that already says Preview alone', () => {
    expect(withPreviewNote('A preview')).toBeUndefined();
    expect(withPreviewNote('Previews')).toBe('Previews; Preview');
  });
});
