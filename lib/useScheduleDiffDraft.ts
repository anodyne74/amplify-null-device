import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { ScheduleReading } from '@/lib/routeRequests';
import { scheduleDiff, type DiffStop, type ScheduleDiff } from '@/lib/scheduleDiff';
import { agentVocabulary, fieldChanges, matchAgent, withPreviewNote, type ChangeField, type ChangeStop } from '@/lib/scheduleChanges';
import { addToNote, instructionLines, removeFromNote } from '@/lib/scheduleInstructions';
import { addToDraft, dropFromDraft, removeAddFromDraft, restoreToDraft, type DraftMarks } from '@/lib/scheduleDiffDraft';

/**
 * Accepting and rejecting a Schedule Diff's lines on New route (ADR 0014): the one
 * place that knows what each kind of line does to the draft Stops, and what taking
 * it back does. A Drop takes a copied Stop out, an Add puts a Stop found on the map
 * in, a Change sets one field of one Stop, an Instruction goes to the Route or to a
 * Stop's notes. Rejecting a line that was accepted undoes it; rejecting any other
 * leaves the copy as it was.
 *
 * The form keeps owning the draft Stops: this reads them and changes them through
 * `setStops`, and touches only Stops carrying its own marks (lib/scheduleDiffDraft.ts).
 * The map lookup behind an Add is `locate`, so tests can supply their own.
 * `reset` drops every decision, and an Add still being found when it is called is
 * discarded rather than landing in a draft it no longer belongs to. A new reading
 * of the Schedule, once any line has been decided, does the same and starts the
 * draft over from the copy: a new proposal is reviewed from a clean draft.
 */

export type DiffDecision = 'accepted' | 'rejected';

/**
 * One line of the Diff. `index` is its row's position in the reading (Add) or the instruction's (Instruction),
 * or the Stop's position in the copy (Drop, Change); a Change is for one `field` of that Stop.
 */
export type DiffLine = { kind: 'add' | 'drop' | 'instruction'; index: number; field?: undefined } | { kind: 'change'; index: number; field: ChangeField };

export const lineKey = (line: DiffLine) => (line.kind === 'change' ? `change:${line.index}:${line.field}` : `${line.kind}:${line.index}`);

type Row = NonNullable<NonNullable<ScheduleReading['rows']>[number]>;

/** A reading's rows against the Stops copied from the previous Route. */
export type ReadingDiff<S extends DiffStop> = { rows: Row[]; diff: ScheduleDiff<Row, S> };

export function readingDiff<S extends DiffStop>(reading: ScheduleReading, stops: readonly S[]): ReadingDiff<S> {
  const rows = (reading.rows ?? []).filter((row): row is Row => Boolean(row));
  return { rows, diff: scheduleDiff(rows, stops) };
}

/** What an Add asks the map lookup to find. */
export type LocateDraft = { address: string; numberOfSigns?: number; agent?: string; isAuction?: boolean; notes?: string };

export type ScheduleDiffDraftOptions<S extends DraftMarks & DiffStop & ChangeStop> = {
  reading: ScheduleReading | null;
  /** The Stops as copied, which the Diff compares with. */
  copiedStops: S[] | null;
  /** The draft Stops as they are now. */
  draftStops: S[];
  setStops: Dispatch<SetStateAction<S[]>>;
  locate: (drafts: LocateDraft[]) => Promise<{ stops: S[]; unpinned: number }>;
};

export function useScheduleDiffDraft<S extends DraftMarks & DiffStop & ChangeStop>({
  reading,
  copiedStops,
  draftStops,
  setStops,
  locate,
}: ScheduleDiffDraftOptions<S>) {
  const [decisions, setDecisions] = useState<Record<string, DiffDecision>>({});
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  // Route-wide instructions accepted, by their position in the reading.
  const [acceptedRouteInstructions, setAcceptedRouteInstructions] = useState<Record<number, string>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const decisionsRef = useRef<Record<string, DiffDecision>>({});
  // Copied Stops taken out by an accepted Drop, as the administrator last had them, for taking it back.
  const droppedRef = useRef(new Map<number, S>());
  // Where each Stop instruction went, for taking it back.
  const instructionStopsRef = useRef(new Map<number, DraftMarks>());
  // Bumped by every reset, so an Add still being found on the map is dropped.
  const runRef = useRef(0);
  const draftRef = useRef<S[]>(draftStops);
  useEffect(() => {
    draftRef.current = draftStops;
  }, [draftStops]);

  const computed = useMemo(() => (reading && copiedStops ? readingDiff(reading, copiedStops) : null), [reading, copiedStops]);

  const reset = useCallback(() => {
    runRef.current += 1;
    decisionsRef.current = {};
    setDecisions({});
    setBusy(new Set());
    droppedRef.current.clear();
    instructionStopsRef.current.clear();
    setAcceptedRouteInstructions({});
    setWarnings([]);
    setError(null);
  }, []);

  // A new reading starts the draft over from the copy, but only if a line had been decided against the last one.
  const lastReadAtRef = useRef<string | null>(null);
  useEffect(() => {
    const readAt = reading?.readAt ?? null;
    const changed = lastReadAtRef.current !== null && readAt !== lastReadAtRef.current;
    lastReadAtRef.current = readAt;
    if (changed && copiedStops && Object.keys(decisionsRef.current).length > 0) {
      reset();
      setStops(copiedStops.map((stop, i) => ({ ...stop, copiedFrom: i })));
    }
  }, [reading, copiedStops, reset, setStops]);

  const decided = (key: string, decision: DiffDecision) => {
    decisionsRef.current = { ...decisionsRef.current, [key]: decision };
    setDecisions(decisionsRef.current);
  };

  const setLineBusy = (key: string, on: boolean) =>
    setBusy((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  // The change a Change line stands for, worked out from the reading and the copy it was shown against.
  const changeFor = (line: DiffLine & { kind: 'change' }) => {
    const original = copiedStops?.[line.index];
    if (!original || !computed) return undefined;
    const match = computed.diff.matched.find(({ stop }) => stop === original);
    return match ? fieldChanges(match.row, original, agentVocabulary(copiedStops ?? [])).find((change) => change.field === line.field) : undefined;
  };

  const decide = async (lines: DiffLine[], decision: DiffDecision) => {
    const run = runRef.current;
    for (const line of lines) {
      const key = lineKey(line);
      const previous = decisionsRef.current[key];
      if (previous === decision) continue;

      if (line.kind === 'instruction') {
        const instruction = reading?.instructions?.[line.index];
        if (!instruction) continue;
        const text = instruction.text;
        if (decision === 'accepted') {
          if (!instruction.address) {
            setAcceptedRouteInstructions((current) => ({ ...current, [line.index]: text }));
          } else {
            // Placed against the draft as it is now, so an Add accepted a moment ago counts.
            const placed = instructionLines([{ text, address: instruction.address }], draftRef.current, null)[0];
            if (placed.target.kind !== 'stop') continue;
            const target = draftRef.current[placed.target.draftIndex];
            instructionStopsRef.current.set(line.index, { copiedFrom: target.copiedFrom, fromRow: target.fromRow });
            setStops((draft) => draft.map((stop) => (stop === target ? { ...stop, notes: addToNote(stop.notes, text) } : stop)));
          }
        } else if (previous === 'accepted') {
          if (!instruction.address) {
            setAcceptedRouteInstructions(({ [line.index]: _taken, ...rest }) => rest);
          } else {
            const where = instructionStopsRef.current.get(line.index);
            setStops((draft) =>
              draft.map((stop) =>
                where && stop.copiedFrom === where.copiedFrom && stop.fromRow === where.fromRow
                  ? { ...stop, notes: removeFromNote(stop.notes, text) }
                  : stop
              )
            );
          }
        }
      } else if (line.kind === 'change') {
        // Only the one field of the one Stop; undoing it puts back what the copy had.
        const original = copiedStops?.[line.index];
        const change = changeFor(line);
        if (!original || !change) continue;
        const value = decision === 'accepted' ? change.to : previous === 'accepted' ? change.from : undefined;
        if (decision === 'accepted' || previous === 'accepted') {
          setStops((draft) =>
            draft.map((stop) => {
              if (stop.copiedFrom !== line.index) return stop;
              // A Preview is added to the note as it stands now, which may have been edited since the copy.
              if (line.field === 'notes' && decision === 'accepted') return { ...stop, notes: withPreviewNote(stop.notes) ?? stop.notes };
              return { ...stop, [line.field]: value };
            })
          );
        }
      } else if (decision === 'accepted' && line.kind === 'drop') {
        setStops((draft) => {
          const result = dropFromDraft(draft, line.index);
          if (result.dropped) droppedRef.current.set(line.index, result.dropped);
          return result.draft;
        });
      } else if (decision === 'accepted') {
        const row = reading?.rows?.[line.index];
        if (!row) continue;
        setLineBusy(key, true);
        try {
          const located = await locate([
            {
              address: row.address,
              numberOfSigns: row.numberOfSigns ?? undefined,
              // In the spelling the Route already uses for that agent.
              agent: row.agent ? matchAgent(row.agent, agentVocabulary(copiedStops ?? [])).agent : undefined,
              isAuction: row.isAuction ?? undefined,
              notes: row.isPreview ? withPreviewNote(null) : undefined,
            },
          ]);
          if (runRef.current !== run) return;
          const [stop] = located.stops;
          if (!stop) {
            setError(`${row.address} has no suburb that could be found on the map, so it was not added. Add it to the Route once it's created, with the suburb.`);
            continue;
          }
          if (located.unpinned > 0) {
            setWarnings((current) => [...current, `${row.address} couldn't be found on the map and will be created without a pin. It still appears in Property History.`]);
          }
          setStops((draft) => addToDraft(draft, { ...stop, fromRow: line.index }));
        } finally {
          setLineBusy(key, false);
        }
      } else if (previous === 'accepted' && line.kind === 'drop') {
        const original = copiedStops?.[line.index];
        const stop = droppedRef.current.get(line.index) ?? (original && ({ ...original, copiedFrom: line.index } as S));
        if (stop) setStops((draft) => restoreToDraft(draft, stop));
      } else if (previous === 'accepted') {
        setStops((draft) => removeAddFromDraft(draft, line.index));
      }
      decided(key, decision);
    }
  };

  return {
    /** The reading against the copied Stops, computed once; null until there is both. */
    readingDiff: computed,
    decisions,
    busy,
    warnings,
    error,
    /** Route-wide instructions accepted, by their position in the reading. */
    acceptedRouteInstructions,
    decide,
    reset,
  };
}
