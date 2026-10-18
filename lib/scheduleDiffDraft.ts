/**
 * Applying a Schedule Diff's accepted lines to the draft Stops on New route
 * (ADR 0014). The draft starts as the Stops copied from the previous Route; each
 * carries the position it was copied from, so a Drop can be taken back with the
 * Stop as the administrator last had it (notes edited, say). An Add carries the
 * position of the Schedule row it came from, so Adds follow the sheet's order
 * however they were accepted. The markers are the page's own: createStopsForRoute
 * writes only the Stop's fields.
 */

export type DraftMarks = {
  /** Where the Stop was in the copied Route. */
  copiedFrom?: number;
  /** Where the row it was added from sits in the Schedule reading. */
  fromRow?: number;
};

/** Copied Stops in their original order, then Adds in sheet order. */
export function orderDraft<S extends DraftMarks>(draft: readonly S[]): S[] {
  const copied = draft.filter((stop) => stop.copiedFrom !== undefined).sort((a, b) => a.copiedFrom! - b.copiedFrom!);
  const added = draft.filter((stop) => stop.copiedFrom === undefined).sort((a, b) => (a.fromRow ?? 0) - (b.fromRow ?? 0));
  return [...copied, ...added];
}

/** The draft without the Stop copied from `copiedFrom`, and that Stop as it was (undefined if it was already out). */
export function dropFromDraft<S extends DraftMarks>(draft: readonly S[], copiedFrom: number): { draft: S[]; dropped: S | undefined } {
  return {
    draft: draft.filter((stop) => stop.copiedFrom !== copiedFrom),
    dropped: draft.find((stop) => stop.copiedFrom === copiedFrom),
  };
}

/** The draft with a dropped Stop back in its place (unchanged if it is already there). */
export function restoreToDraft<S extends DraftMarks>(draft: readonly S[], stop: S): S[] {
  return draft.some((existing) => existing.copiedFrom === stop.copiedFrom) ? [...draft] : orderDraft([...draft, stop]);
}

/** The draft with an Add in sheet order (unchanged if that row is already added). */
export function addToDraft<S extends DraftMarks>(draft: readonly S[], stop: S & { fromRow: number }): S[] {
  return draft.some((existing) => existing.fromRow === stop.fromRow) ? [...draft] : orderDraft([...draft, stop]);
}

/** The draft without the Add from sheet row `fromRow`. */
export function removeAddFromDraft<S extends DraftMarks>(draft: readonly S[], fromRow: number): S[] {
  return draft.filter((stop) => stop.fromRow !== fromRow);
}
