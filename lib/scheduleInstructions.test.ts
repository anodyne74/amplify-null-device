import { addToNote, instructionLines, removeFromNote } from '@/lib/scheduleInstructions';

const stop = (address: string, number: string, street: string, extra: object = {}) => ({
  address,
  addressStreetNumber: number,
  addressStreet: street,
  addressSuburb: 'Hillview',
  ...extra,
});
const ALDER = stop('12 Alder Street, Hillview', '12', 'Alder Street', { notes: 'Side gate' });
const GROVE = stop('15 Grove Crescent, Hillview', '15', 'Grove Crescent');

describe('instructionLines', () => {
  it('puts an instruction about a property on that Stop, however the address is written, with its existing note beside it', () => {
    const [line] = instructionLines([{ text: 'Ring the bell first', address: '12 Alder St Hillview' }], [GROVE, ALDER], null);
    expect(line.target).toEqual({ kind: 'stop', draftIndex: 1, address: '12 Alder Street, Hillview', existingNote: 'Side gate' });
    expect(line.alreadyHeld).toBe(false);
  });

  it('puts an instruction with no address on the Route', () => {
    const [line] = instructionLines([{ text: 'Call the office on arrival' }], [ALDER], null);
    expect(line.target).toEqual({ kind: 'route' });
  });

  it('says so when a property has no Stop yet, instead of guessing', () => {
    const [line] = instructionLines([{ text: 'Use the side street', address: '31 Hazel Road Riverbend' }], [ALDER], null);
    expect(line.target).toMatchObject({ kind: 'unplaced', reason: expect.stringContaining('Accept its Add first') });
  });

  it('sets aside an address it cannot place with confidence', () => {
    const [line] = instructionLines([{ text: 'Mind the dog', address: '12 Alder Street' }], [ALDER], null);
    expect(line.target.kind).toBe('unplaced');
  });

  it('does not propose what the Stop’s note or the standing instructions already say', () => {
    const lines = instructionLines(
      [
        { text: 'side gate', address: '12 Alder Street, Hillview' },
        { text: 'Please call the agent before placing.' },
        { text: 'Something new' },
      ],
      [ALDER],
      'Standing: please CALL the agent before placing'
    );
    expect(lines.map((line) => line.alreadyHeld)).toEqual([true, true, false]);
  });

  it('counts only whole words as already said', () => {
    const [short, whole] = instructionLines(
      [{ text: 'gate', address: '15 Grove Crescent, Hillview' }, { text: 'back gate', address: '12 Alder Street, Hillview' }],
      [{ ...GROVE, notes: 'Investigate the front' }, { ...ALDER, notes: 'Use the back gate, ring first' }],
      null
    );
    expect(short.alreadyHeld).toBe(false);
    expect(whole.alreadyHeld).toBe(true);
  });

  it('keeps each instruction’s position in the reading, its words and its source', () => {
    const lines = instructionLines([{ text: 'A', source: 'email' }, { text: 'B', source: 'sheet' }], [], null);
    expect(lines.map(({ index, text, source }) => [index, text, source])).toEqual([[0, 'A', 'email'], [1, 'B', 'sheet']]);
  });

  it('proposes nothing when there are no instructions', () => {
    expect(instructionLines([], [ALDER], 'Standing')).toEqual([]);
  });
});

describe('addToNote', () => {
  it('adds after what the note says, and starts a note that is empty', () => {
    expect(addToNote('Side gate', ' Ring first ')).toBe('Side gate; Ring first');
    expect(addToNote(null, 'Ring first')).toBe('Ring first');
    expect(addToNote('  ', 'Ring first')).toBe('Ring first');
  });
});

describe('removeFromNote', () => {
  it('takes back what addToNote added, keeping the rest', () => {
    expect(removeFromNote(addToNote('Side gate', 'Ring first'), 'Ring first')).toBe('Side gate');
    expect(removeFromNote(addToNote(null, 'Ring first'), 'Ring first')).toBeUndefined();
    expect(removeFromNote('Ring first; Side gate', 'Ring first')).toBe('Side gate');
  });

  it('leaves a note alone when the text is no longer in it', () => {
    expect(removeFromNote('Side gate', 'Ring first')).toBe('Side gate');
  });
});
