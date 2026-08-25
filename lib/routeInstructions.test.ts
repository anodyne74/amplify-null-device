import { appendRouteInstruction, parseRouteInstructions, sortRouteInstructionsNewestFirst } from './routeInstructions';

describe('parseRouteInstructions', () => {
  it('returns an empty list for null/undefined/blank input', () => {
    expect(parseRouteInstructions(null)).toEqual([]);
    expect(parseRouteInstructions(undefined)).toEqual([]);
    expect(parseRouteInstructions('   ')).toEqual([]);
  });

  it('treats a plain-text legacy value as a single unattributed entry', () => {
    expect(parseRouteInstructions('Gate code is 4521')).toEqual([
      { text: 'Gate code is 4521', createdAt: '' },
    ]);
  });

  it('parses a structured payload back into its entries', () => {
    const raw = JSON.stringify({
      v: 1,
      entries: [
        { text: 'Watch for the dog', agentLabel: 'Betty O\'Shea', authorSub: 'sub-1', createdAt: '2026-08-20T01:00:00.000Z' },
      ],
    });
    expect(parseRouteInstructions(raw)).toEqual([
      { text: 'Watch for the dog', agentLabel: "Betty O'Shea", authorSub: 'sub-1', createdAt: '2026-08-20T01:00:00.000Z' },
    ]);
  });

  it('drops malformed entries (missing/blank text) rather than throwing', () => {
    const raw = JSON.stringify({ v: 1, entries: [{ text: '  ' }, { agentLabel: 'no text' }, { text: 'ok' }] });
    expect(parseRouteInstructions(raw)).toEqual([{ text: 'ok' }]);
  });

  it('falls back to a legacy entry for JSON that is not our shape', () => {
    expect(parseRouteInstructions('{"foo":"bar"}')).toEqual([{ text: '{"foo":"bar"}', createdAt: '' }]);
  });
});

describe('appendRouteInstruction', () => {
  it('appends to an empty/legacy value', () => {
    const result = appendRouteInstruction(null, { text: 'Extra signs at the front', createdAt: '2026-08-20T01:00:00.000Z' });
    expect(parseRouteInstructions(result)).toEqual([
      { text: 'Extra signs at the front', agentLabel: undefined, authorSub: undefined, createdAt: '2026-08-20T01:00:00.000Z' },
    ]);
  });

  it('preserves prior entries when appending a new one', () => {
    const first = appendRouteInstruction(null, { text: 'first', createdAt: '2026-08-20T01:00:00.000Z' });
    const second = appendRouteInstruction(first, { text: 'second', agentLabel: 'David Mun', authorSub: 'sub-2', createdAt: '2026-08-21T01:00:00.000Z' });
    expect(parseRouteInstructions(second)).toEqual([
      { text: 'first', agentLabel: undefined, authorSub: undefined, createdAt: '2026-08-20T01:00:00.000Z' },
      { text: 'second', agentLabel: 'David Mun', authorSub: 'sub-2', createdAt: '2026-08-21T01:00:00.000Z' },
    ]);
  });

  it('carries a pre-existing legacy plain-text value forward as the first entry', () => {
    const result = appendRouteInstruction('Old freeform note', { text: 'new note', createdAt: '2026-08-21T01:00:00.000Z' });
    expect(parseRouteInstructions(result)).toEqual([
      { text: 'Old freeform note', createdAt: '' },
      { text: 'new note', agentLabel: undefined, authorSub: undefined, createdAt: '2026-08-21T01:00:00.000Z' },
    ]);
  });

  it('trims whitespace and caps text length', () => {
    const long = 'a'.repeat(1500);
    const result = appendRouteInstruction(null, { text: `  ${long}  `, createdAt: '2026-08-20T01:00:00.000Z' });
    const [entry] = parseRouteInstructions(result);
    expect(entry.text).toHaveLength(1000);
  });
});

describe('sortRouteInstructionsNewestFirst', () => {
  it('orders entries by createdAt descending', () => {
    const entries = [
      { text: 'older', createdAt: '2026-08-01T00:00:00.000Z' },
      { text: 'newer', createdAt: '2026-08-20T00:00:00.000Z' },
    ];
    expect(sortRouteInstructionsNewestFirst(entries).map((e) => e.text)).toEqual(['newer', 'older']);
  });

  it('does not mutate the input array', () => {
    const entries = [
      { text: 'a', createdAt: '2026-08-01T00:00:00.000Z' },
      { text: 'b', createdAt: '2026-08-20T00:00:00.000Z' },
    ];
    const copy = [...entries];
    sortRouteInstructionsNewestFirst(entries);
    expect(entries).toEqual(copy);
  });
});
