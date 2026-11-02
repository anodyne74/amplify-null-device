/**
 * The changes a Schedule row asks of the Stop it matched (Schedule Diff,
 * CONTEXT.md, ADR 0014): its agent, number of signs, auction mark and notes. A
 * change is proposed only where the sheet states a value that differs from the
 * Stop's, so a blank cell never clears anything.
 *
 * The sheet's agent is read against the agents the copied Route already uses:
 * `BO`, `Betty` and `Daivd` are one agent if the Route has `Betty`, and
 * nothing is proposed. An agent that matches none of them is a new agent, and
 * the change says so.
 */

export type ChangeRow = {
  numberOfSigns?: number | null;
  agent?: string | null;
  isAuction?: boolean | null;
  isPreview?: boolean | null;
};

export type ChangeStop = {
  numberOfSigns?: number | null;
  agent?: string | null;
  isAuction?: boolean | null;
  notes?: string | null;
};

export type ChangeField = 'agent' | 'numberOfSigns' | 'isAuction' | 'notes';

export type FieldChange =
  | { field: 'agent'; from: string | undefined; to: string; newAgent: boolean }
  | { field: 'numberOfSigns'; from: number | undefined; to: number }
  | { field: 'isAuction'; from: boolean; to: boolean }
  | { field: 'notes'; from: string | undefined; to: string };

export type AgentMatch = { agent: string; newAgent: boolean };

const letters = (text: string) => text.toLowerCase().replace(/[^a-z]/g, '');

/** Edit distance counting a swap of two neighbours as one edit ("Daivd" is one edit from "David"). */
function typoDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const isInitials = (text: string) => /^[A-Za-z]{2,3}$/.test(text.trim()) && text.trim() === text.trim().toUpperCase();

/** The one entry of `vocabulary` that `candidates` picks out, or undefined if none or more than one. */
function only(vocabulary: string[], matches: (known: string) => boolean): string | undefined {
  const found = vocabulary.filter(matches);
  return found.length === 1 ? found[0] : undefined;
}

/**
 * Which of the Route's agents the sheet's `agent` is, in the Route's own spelling, or the sheet's text
 * as a new agent. Initials match a name that starts with the same letter, and the other way round, when
 * that picks out one agent; a single slip of the keys is forgiven for names of four letters or more.
 */
export function matchAgent(agent: string, vocabulary: readonly string[]): AgentMatch {
  const sheet = agent.trim();
  const known = [...new Set(vocabulary.map((name) => name.trim()).filter(Boolean))];
  const flat = letters(sheet);

  const match =
    known.find((name) => name === sheet) ??
    only(known, (name) => letters(name) === flat) ??
    (isInitials(sheet)
      ? only(known, (name) => !isInitials(name) && letters(name)[0] === flat[0])
      : only(known, (name) => isInitials(name) && letters(name)[0] === flat[0])) ??
    (flat.length >= 4 ? only(known, (name) => letters(name).length >= 4 && typoDistance(letters(name), flat) === 1) : undefined);

  return match ? { agent: match, newAgent: false } : { agent: sheet, newAgent: true };
}

/** The agents the Stops already have: what a sheet's agent is read against. */
export function agentVocabulary(stops: readonly ChangeStop[]): string[] {
  return [...new Set(stops.map((stop) => stop.agent?.trim()).filter((agent): agent is string => Boolean(agent)))];
}

/** The note a Preview adds to a Stop's own notes, unless it already says so. */
export function withPreviewNote(notes: string | null | undefined): string | undefined {
  const existing = notes?.trim();
  if (!existing) return 'Preview';
  return /\bpreview\b/i.test(existing) ? undefined : `${existing}; Preview`;
}

/** The changes `row` asks of the Stop it matched; none when the sheet agrees with the Stop. */
export function fieldChanges(row: ChangeRow, stop: ChangeStop, vocabulary: readonly string[]): FieldChange[] {
  const changes: FieldChange[] = [];

  if (row.agent?.trim()) {
    const { agent, newAgent } = matchAgent(row.agent, vocabulary);
    if (agent !== stop.agent?.trim()) changes.push({ field: 'agent', from: stop.agent?.trim() || undefined, to: agent, newAgent });
  }
  if (typeof row.numberOfSigns === 'number' && row.numberOfSigns !== stop.numberOfSigns) {
    changes.push({ field: 'numberOfSigns', from: stop.numberOfSigns ?? undefined, to: row.numberOfSigns });
  }
  const auction = Boolean(row.isAuction);
  if (auction !== Boolean(stop.isAuction)) changes.push({ field: 'isAuction', from: Boolean(stop.isAuction), to: auction });
  if (row.isPreview) {
    const to = withPreviewNote(stop.notes);
    if (to) changes.push({ field: 'notes', from: stop.notes?.trim() || undefined, to });
  }
  return changes;
}
