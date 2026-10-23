/**
 * Schedule Diff for a Route Amendment (CONTEXT.md, ADR 0014): what an
 * Amendment's reading says against the Route's Stops as they are now. Only what
 * the Amendment states is proposed: rows marked `add` or `drop` by the email,
 * and the rows of a revised Schedule, which can only add. A Stop the Amendment
 * does not mention is left alone, even when a revised Schedule leaves it out; it
 * is listed so the administrator can look, never proposed as a drop.
 *
 * A property named without a suburb takes the suburb of the Route's own Stops
 * on that street, when they all agree. Otherwise the line is left to check by
 * hand, not guessed. Matching itself is scheduleDiff's (ADR 0004).
 *
 * A proposal only; nothing here changes a Route.
 */
import { enteredStreet, parsePropertyKey, propertyKey, stopPropertyKey, suburbAfterStreet, suburbLabel } from '@/lib/propertyKey';
import { scheduleDiff, type AmbiguousRow, type DiffRow, type DiffStop, type MatchedRow } from '@/lib/scheduleDiff';

export type AmendmentRow = DiffRow & { change?: string | null };

export type AmendmentDiff<R, S> = {
  /** Properties to add: stated by the email, or on a revised Schedule, with no Stop on the Route. */
  adds: Array<{ row: R; inferredSuburb: boolean }>;
  /** Stops the email asks to take off. */
  drops: Array<{ row: R; stop: S }>;
  /** Rows that already have a Stop on the Route. */
  alreadyOn: MatchedRow<R, S>[];
  /** Drops asked for at a property the Route has no Stop at. */
  notOnRoute: R[];
  /** Rows to check by hand, with the reason. */
  ambiguous: AmbiguousRow<R, S>[];
  /** Stops a revised Schedule leaves out. Flagged only: the Amendment did not ask to drop them. */
  notOnSchedule: S[];
};

/** The row's address with the suburb the Route's Stops on that street share, or null if it has one already or they do not agree. */
function withRouteSuburb(address: string, stops: readonly DiffStop[]): string | null {
  if (propertyKey(address, {})) return null;
  const segment = enteredStreet(address);
  if (!segment) return null;
  const places = new Set<string>();
  for (const stop of stops) {
    const key = stopPropertyKey(stop.address, stop);
    const parts = key ? parsePropertyKey(key) : null;
    if (parts && suburbAfterStreet(segment, parts.street) === '') places.add(suburbLabel(parts.suburb, parts.postcode));
  }
  return places.size === 1 ? `${address.trim()}, ${[...places][0]}` : null;
}

export function amendmentDiff<R extends AmendmentRow, S extends DiffStop>(rows: readonly R[], stops: readonly S[]): AmendmentDiff<R, S> {
  const prepared = rows.map((row) => {
    const completed = withRouteSuburb(row.address, stops);
    return { row, address: completed ?? row.address, inferred: completed !== null };
  });
  const inGroup = (drop: boolean) => prepared.filter((item) => (item.row.change === 'drop') === drop);
  const rowOf = new Map(prepared.map((item) => [item, item.row]));
  const run = (items: typeof prepared) => {
    const asRows = items.map((item) => ({ address: item.address, item }));
    return scheduleDiff(asRows, stops);
  };

  const wanted = run(inGroup(false));
  const dropping = run(inGroup(true));
  const back = <T extends { item: (typeof prepared)[number] }>(entry: T) => rowOf.get(entry.item)!;

  const stoppedByDrops = new Set<S>(dropping.matched.map(({ stop }) => stop));
  const hasSchedule = rows.some((row) => !row.change);

  return {
    adds: wanted.adds.map((entry) => ({ row: back(entry), inferredSuburb: entry.item.inferred })),
    drops: dropping.matched.map(({ row, stop }) => ({ row: back(row), stop })),
    alreadyOn: wanted.matched.map(({ row, stop, unitDiffers }) => ({ row: back(row), stop, unitDiffers })),
    notOnRoute: dropping.adds.map(back),
    ambiguous: [...wanted.ambiguous, ...dropping.ambiguous].map(({ row, reason, candidate }) => ({ row: back(row), reason, candidate })),
    notOnSchedule: hasSchedule ? wanted.drops.filter((stop) => !stoppedByDrops.has(stop)) : [],
  };
}
