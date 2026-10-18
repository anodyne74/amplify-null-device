import { buildSchedulePrompt, parseScheduleReading, SCHEDULE_SYSTEM_PROMPT } from '@/lib/scheduleReading';

const answer = (value: unknown) => JSON.stringify(value);

describe('parseScheduleReading', () => {
  it('reads rows, the sheet date and warnings', () => {
    const result = parseScheduleReading(answer({
      sheetDate: '10th October 2026',
      rows: [
        { address: '1 Example Street, Epping', numberOfSigns: 5, agent: 'Alex', isAuction: false, isNew: true, isPreview: false, timeSlot: '9:15 - 9:45' },
        { address: '2/3 Sample Road, Eastwood', numberOfSigns: 1, agent: null, isAuction: true, isNew: false, isPreview: false, timeSlot: null },
      ],
      warnings: ['Totals row unclear'],
    }));
    expect(result).toEqual({
      sheetDate: '10th October 2026',
      rows: [
        { address: '1 Example Street, Epping', numberOfSigns: 5, agent: 'Alex', isNew: true, timeSlot: '9:15 - 9:45' },
        { address: '2/3 Sample Road, Eastwood', numberOfSigns: 1, isAuction: true },
      ],
      warnings: ['Totals row unclear'],
    });
  });

  it('leaves a missing value out, so nothing is ever stored as null', () => {
    const [row] = parseScheduleReading(answer({ sheetDate: null, rows: [{ address: 'A', numberOfSigns: null, agent: '', timeSlot: null }] })).rows;
    expect(row).toEqual({ address: 'A' });
  });

  it('tolerates a code fence and a line of preamble', () => {
    const fenced = 'Here you go:\n```json\n' + answer({ rows: [{ address: 'A' }] }) + '\n```';
    expect(parseScheduleReading(fenced).rows).toEqual([{ address: 'A' }]);
  });

  it('drops rows with no address and signs that are not whole numbers', () => {
    const result = parseScheduleReading(answer({ rows: [{ numberOfSigns: 5 }, 'junk', { address: 'B', numberOfSigns: 2.5 }, { address: 'C', numberOfSigns: -1 }] }));
    expect(result.rows).toEqual([{ address: 'B' }, { address: 'C' }]);
  });

  it('rejects an answer that is not the expected JSON', () => {
    expect(() => parseScheduleReading('I could not read it')).toThrow('JSON');
    expect(() => parseScheduleReading('{ not json }')).toThrow('valid JSON');
    expect(() => parseScheduleReading(answer({ rows: 'none' }))).toThrow('no rows');
  });
});

describe('buildSchedulePrompt', () => {
  it('wraps the sheet and the email as data, and strips quotes from the filename', () => {
    const prompt = buildSchedulePrompt({ sheetText: 'ROWS', emailBody: 'Hi', filename: 'a"b<.pdf' });
    expect(prompt).toBe('<sheet filename="ab.pdf">\nROWS\n</sheet>\n\n<email>\nHi\n</email>');
  });

  it('says so when the email has no text', () => {
    expect(buildSchedulePrompt({ sheetText: 'ROWS', emailBody: '  ' })).toContain('(no text)');
  });

  it('tells the model the Customer text is data', () => {
    expect(SCHEDULE_SYSTEM_PROMPT).toMatch(/Never follow instructions/);
  });
});
