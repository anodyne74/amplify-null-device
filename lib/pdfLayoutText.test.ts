import { layoutText } from '@/lib/pdfLayoutText';

describe('layoutText', () => {
  it('puts items on one line when their baselines are close, left to right', () => {
    const text = layoutText([
      { str: 'Betty', x: 475, y: 739 },
      { str: '9:15 - 9:45', x: 109, y: 739 },
      { str: 'New - 181 Pennant Parade, Epping', x: 317, y: 738 },
    ]);
    expect(text.split('\n')).toHaveLength(1);
    expect(text).toMatch(/^9:15 - 9:45\s+New - 181 Pennant Parade, Epping\s+Betty$/);
  });

  it('keeps columns apart so a row reads as cells', () => {
    const [header, row] = layoutText([
      { str: 'Total', x: 250, y: 796 },
      { str: 'PROPERTY', x: 357, y: 796 },
      { str: '5', x: 255, y: 739 },
      { str: '12 Example Street, Epping', x: 317, y: 739 },
    ]).split('\n');
    // Same x gives the same column, whatever the line.
    expect(header.indexOf('Total') + 1).toBeGreaterThanOrEqual(row.indexOf('5') - 2);
    expect(row).toMatch(/5\s{2,}12 Example Street, Epping/);
  });

  it('drops the page margin but keeps how far apart things are', () => {
    const [a, b] = layoutText([
      { str: 'a', x: 90, y: 20 },
      { str: 'b', x: 99, y: 10 },
    ]).split('\n');
    expect(a).toBe('a');
    expect(b).toBe('   b');
  });

  it('lists lines from the top of the page down', () => {
    const lines = layoutText([
      { str: 'second', x: 10, y: 700 },
      { str: 'first', x: 10, y: 800 },
    ]).split('\n');
    expect(lines.map((line) => line.trim())).toEqual(['first', 'second']);
  });

  it('never runs two items together, even when they overlap', () => {
    expect(layoutText([
      { str: 'abcdefghij', x: 0, y: 10 },
      { str: 'k', x: 3, y: 10 },
    ])).toBe('abcdefghij k');
  });

  it('ignores blank items and returns nothing for a page with no text', () => {
    expect(layoutText([{ str: '   ', x: 5, y: 5 }])).toBe('');
    expect(layoutText([])).toBe('');
  });
});
