/**
 * Lays a PDF page's text items out as the page looks: one line per row of the
 * page, each item at the column its position puts it in. A sheet's columns
 * (time, signs, address, agent) stay apart, which lib/extractScheduleText.ts's
 * one-line-per-page text loses. The model that reads Schedules (ADR 0014)
 * gets this, so a layout the customer changed next week still reads as a table.
 */

export type PositionedText = { str: string; x: number; y: number };

export type LayoutOptions = {
  /** Items whose baselines differ by no more than this are on one line (PDF units). */
  lineTolerance?: number;
  /** Width of one character column (PDF units). */
  charWidth?: number;
};

export function layoutText(items: PositionedText[], { lineTolerance = 3, charWidth = 3 }: LayoutOptions = {}): string {
  const present = items.filter((item) => item.str.trim() !== '');
  // Top of the page first (PDF y grows upward), then left to right.
  const sorted = [...present].sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: PositionedText[][] = [];
  for (const item of sorted) {
    const line = lines[lines.length - 1];
    // Compare with the line's first item, so a line can't drift down a row at a time.
    if (line && Math.abs(line[0].y - item.y) <= lineTolerance) line.push(item);
    else lines.push([item]);
  }

  const rendered = lines
    .map((line) => {
      let text = '';
      for (const item of [...line].sort((a, b) => a.x - b.x)) {
        const column = Math.round(item.x / charWidth);
        if (text === '') text = ' '.repeat(Math.max(column, 0));
        else text += ' '.repeat(Math.max(column - text.length, 1));
        text += item.str.trim();
      }
      return text.trimEnd();
    });

  // The page margin is not part of the table.
  const margin = Math.min(...rendered.map((line) => line.length - line.trimStart().length));
  return rendered.map((line) => line.slice(margin)).join('\n');
}
