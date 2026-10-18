/**
 * Checking a Schedule reading against the totals the sheet prints (ADR 0014,
 * Schedule Diff in CONTEXT.md): the rows' signs should add up to the sheet's own
 * total, in all and per agent. A mismatch is a warning with both figures, never
 * a block: it means a row was misread or left out, or that the sheet itself does
 * not add up. Where the sheet prints no totals, or a row's signs are unknown, there
 * is nothing sound to compare and no warning is made.
 */
import { matchAgent } from '@/lib/scheduleChanges';

export type TotalsRow = { numberOfSigns?: number | null; agent?: string | null };
export type TotalsReading = {
  rows?: ReadonlyArray<TotalsRow | null | undefined> | null;
  statedTotals?: { signs?: number | null; agents?: ReadonlyArray<{ agent: string; signs: number } | null | undefined> | null } | null;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function totalsWarnings(reading: TotalsReading): string[] {
  const stated = reading.statedTotals;
  const rows = (reading.rows ?? []).filter((row): row is TotalsRow => Boolean(row));
  if (!stated) return [];
  // A row with no sign count cannot be added up, so the sums would be short for the wrong reason.
  const unknown = rows.filter((row) => typeof row.numberOfSigns !== 'number').length;
  if (unknown > 0) return [];

  const warnings: string[] = [];
  const sum = (list: TotalsRow[]) => list.reduce((total, row) => total + (row.numberOfSigns as number), 0);

  if (typeof stated.signs === 'number') {
    const read = sum(rows);
    if (read !== stated.signs) {
      warnings.push(`The properties read add up to ${plural(read, 'sign')}, but the sheet says ${stated.signs}. Check the list against the file.`);
    }
  }

  const agents = (stated.agents ?? []).filter((item): item is { agent: string; signs: number } => Boolean(item));
  if (agents.length > 0) {
    const names = agents.map((item) => item.agent);
    for (const { agent, signs } of agents) {
      // The sheet writes the same agent in different ways (Betty, BO, a typo), so rows join their total by the same reading as elsewhere.
      const read = sum(rows.filter((row) => row.agent && matchAgent(row.agent, names).agent === agent));
      if (read !== signs) {
        warnings.push(`${agent}'s properties read add up to ${plural(read, 'sign')}, but the sheet says ${signs}.`);
      }
    }
  }
  return warnings;
}
