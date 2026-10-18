/**
 * Instructions found in a Route Request's email or Schedule (Schedule Diff,
 * CONTEXT.md, ADR 0014), as lines to accept: one about a property goes to that
 * Stop's notes, one about the whole Route to the Route's customer instructions.
 * They are the customer's words, kept as written, and nothing existing is
 * replaced: a Stop's note is added to, the Route's feed is appended to.
 *
 * Where a property's instruction goes is worked out against the draft Stops as
 * they are when it is accepted (copied, or added from the sheet), by Property,
 * the way a sheet's rows are matched (lib/scheduleDiff.ts).
 */
import { scheduleDiff, type DiffStop } from '@/lib/scheduleDiff';
import type { ScheduleReadingInstruction } from '@/lib/scheduleReading';

export type InstructionLine = {
  /** Position in the reading's instructions. */
  index: number;
  text: string;
  source?: 'email' | 'sheet';
  /** The property it names, as written; absent for the whole Route. */
  address?: string;
  /** Where it goes. */
  target:
    | { kind: 'route' }
    | { kind: 'stop'; draftIndex: number; address: string; existingNote: string | undefined }
    | { kind: 'unplaced'; reason: string };
  /** Already said by the Stop's note, or the Customer's standing instructions: nothing to add. */
  alreadyHeld: boolean;
};

const flat = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Whole words only, so a short instruction ("gate") is not taken as said by "investigate".
const says = (existing: string | null | undefined, text: string) =>
  Boolean(existing) && Boolean(flat(text)) && ` ${flat(existing!)} `.includes(` ${flat(text)} `);

/** A note with `text` added after what it already says. */
export function addToNote(note: string | null | undefined, text: string): string {
  const existing = note?.trim();
  return existing ? `${existing}; ${text.trim()}` : text.trim();
}

export function instructionLines(
  instructions: readonly ScheduleReadingInstruction[],
  draft: ReadonlyArray<DiffStop & { notes?: string | null }>,
  standingInstructions: string | null | undefined
): InstructionLine[] {
  return instructions.map((instruction, index): InstructionLine => {
    const base = { index, text: instruction.text, source: instruction.source, address: instruction.address };
    if (!instruction.address) {
      return { ...base, target: { kind: 'route' }, alreadyHeld: says(standingInstructions, instruction.text) };
    }

    const [match] = scheduleDiff([{ address: instruction.address }], draft).matched;
    if (!match) {
      return {
        ...base,
        target: { kind: 'unplaced', reason: 'No Stop at that address on the Route yet. Accept its Add first, or put it in by hand' },
        alreadyHeld: false,
      };
    }
    const draftIndex = draft.indexOf(match.stop);
    const existingNote = match.stop.notes?.trim() || undefined;
    return { ...base, target: { kind: 'stop', draftIndex, address: match.stop.address, existingNote }, alreadyHeld: says(existingNote, instruction.text) };
  });
}

/** A note without `text` added by addToNote: the same note as before that was added, whatever came after it is kept. */
export function removeFromNote(note: string | null | undefined, text: string): string | undefined {
  const existing = note?.trim() ?? '';
  const added = text.trim();
  if (existing === added) return undefined;
  const parts = existing.split('; ');
  const at = parts.lastIndexOf(added);
  if (at < 0) return existing || undefined;
  parts.splice(at, 1);
  return parts.join('; ') || undefined;
}
