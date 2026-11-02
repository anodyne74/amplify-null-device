/**
 * Schedule Diff (CONTEXT.md, ADR 0014): what a Schedule's rows say against the
 * Stops copied from the Customer's previous Route. A row and a Stop are the same
 * visit when they are the same Property (ADR 0004: street number, street and
 * suburb; a unit and the postcode do not tell Properties apart), however the
 * customer wrote the address this week. A row with no Stop is an Add, a Stop
 * with no row a Drop. A row whose address cannot be matched with confidence is
 * set aside as ambiguous with its reason, never guessed at. A row's `New` label
 * is not looked at: the comparison decides what is new.
 *
 * A proposal only; nothing here changes a Route. A Stop whose own address cannot
 * be read as a Property is never matched, so it shows as a Drop.
 */
import {
  endsWithStreetType,
  enteredStreet,
  enteredStreetNumber,
  enteredUnit,
  parsePropertyKey,
  propertyKey,
  stopPropertyKey,
  suburbAfterStreet,
  type PropertyKeyParts,
  type StopAddressComponents,
} from '@/lib/propertyKey';

export type DiffRow = { address: string };
export type DiffStop = { address: string } & StopAddressComponents;

export type MatchedRow<R, S> = { row: R; stop: S; unitDiffers: boolean };
export type AmbiguousRow<R, S> = { row: R; reason: string; candidate?: S };

export type ScheduleDiff<R, S> = {
  /** Rows that are a Stop already on the Route, in sheet order. */
  matched: MatchedRow<R, S>[];
  /** Rows with no Stop, in sheet order. */
  adds: R[];
  /** Stops with no row, in Route order. */
  drops: S[];
  /** Rows to check by hand, in sheet order; the Stop they might be is not also a Drop. */
  ambiguous: AmbiguousRow<R, S>[];
};

// A label the sheet puts before an address; the reading strips them, this is for one that slipped through.
const LABEL = /^\s*(?:(?:new|preview|auction)\b\s*[-–:]?\s*)+/i;

function sameProperty(a: PropertyKeyParts, b: PropertyKeyParts): boolean {
  return (
    a.suburb === b.suburb &&
    a.street === b.street &&
    a.number === b.number &&
    // A sheet rarely gives a postcode; only two that are both given can disagree.
    (!a.postcode || !b.postcode || a.postcode === b.postcode)
  );
}

type Reading = { kind: 'candidates'; stops: number[] } | { kind: 'ambiguous'; reason: string; candidate?: number } | { kind: 'add' };

export function scheduleDiff<R extends DiffRow, S extends DiffStop>(rows: readonly R[], stops: readonly S[]): ScheduleDiff<R, S> {
  const stopParts = stops.map((stop) => {
    const key = stopPropertyKey(stop.address, stop);
    return key ? parsePropertyKey(key) : null;
  });
  const indexesWhere = (test: (parts: PropertyKeyParts) => boolean) =>
    stopParts.flatMap((parts, index) => (parts && test(parts) ? [index] : []));

  const read = (address: string): Reading => {
    const number = enteredStreetNumber(address);
    if (!number) return { kind: 'ambiguous', reason: 'No street number' };

    const key = propertyKey(address, {});
    const rowParts = key ? parsePropertyKey(key) : null;
    if (rowParts) {
      const same = indexesWhere((parts) => sameProperty(rowParts, parts));
      if (same.length > 0) return { kind: 'candidates', stops: same };
      const [other] = indexesWhere((parts) => parts.number === rowParts.number && parts.street === rowParts.street);
      if (other !== undefined) {
        const differs = stopParts[other]?.suburb === rowParts.suburb ? 'postcode' : 'suburb';
        return { kind: 'ambiguous', reason: `Same number and street as ${stops[other].address}, but a different ${differs}`, candidate: other };
      }
      return { kind: 'add' };
    }

    // No comma before the suburb ("20 Gloucester Road Epping"): split the street from the suburb using the Route's own Stops.
    const segment = enteredStreet(address) ?? '';
    const sameStreet = stopParts.flatMap((parts, index) => {
      if (!parts || parts.number !== number) return [];
      const after = suburbAfterStreet(segment, parts.street);
      return after === undefined ? [] : [{ index, after, suburb: parts.suburb }];
    });
    const sameSuburb = sameStreet.filter(({ after, suburb }) => after === suburb);
    if (sameSuburb.length > 0) return { kind: 'candidates', stops: sameSuburb.map(({ index }) => index) };
    if (sameStreet.length > 0) {
      const [first] = sameStreet;
      return {
        kind: 'ambiguous',
        reason: first.after
          ? `Same number and street as ${stops[first.index].address}, but a different suburb`
          : `No suburb given; may be ${stops[first.index].address}`,
        candidate: first.index,
      };
    }
    return endsWithStreetType(segment) ? { kind: 'ambiguous', reason: 'No suburb given' } : { kind: 'add' };
  };

  const addresses = rows.map((row) => row.address.replace(LABEL, '').trim());
  const readings = rows.map((_, i) => read(addresses[i]));
  const takenBy = new Map<number, number>(); // stop index -> row index
  const matchedStop: (number | undefined)[] = rows.map(() => undefined);

  const free = (stopIndexes: number[], accept: (stopIndex: number) => boolean) =>
    stopIndexes.find((stopIndex) => !takenBy.has(stopIndex) && accept(stopIndex));
  const claim = (rowIndex: number, stopIndex: number | undefined) => {
    if (stopIndex === undefined) return;
    takenBy.set(stopIndex, rowIndex);
    matchedStop[rowIndex] = stopIndex;
  };

  // Rows go to a Stop with the same unit first, so "309/3" does not take the Stop "308/3" before "308/3" gets there.
  rows.forEach((_, i) => {
    const reading = readings[i];
    if (reading.kind === 'candidates') claim(i, free(reading.stops, (s) => enteredUnit(stops[s].address) === enteredUnit(addresses[i])));
  });
  rows.forEach((_, i) => {
    const reading = readings[i];
    if (reading.kind === 'candidates' && matchedStop[i] === undefined) claim(i, free(reading.stops, () => true));
  });

  const result: ScheduleDiff<R, S> = { matched: [], adds: [], drops: [], ambiguous: [] };
  const unresolved = new Set<number>();

  rows.forEach((row, i) => {
    const reading = readings[i];
    const stopIndex = matchedStop[i];
    if (stopIndex !== undefined) {
      result.matched.push({ row, stop: stops[stopIndex], unitDiffers: enteredUnit(stops[stopIndex].address) !== enteredUnit(addresses[i]) });
    } else if (reading.kind === 'ambiguous') {
      if (reading.candidate !== undefined) unresolved.add(reading.candidate);
      result.ambiguous.push({ row, reason: reading.reason, candidate: reading.candidate === undefined ? undefined : stops[reading.candidate] });
    } else if (reading.kind === 'candidates') {
      // Every Stop at this Property is already taken by another row.
      const earlier = reading.stops.map((s) => takenBy.get(s)).find((r) => r !== undefined && enteredUnit(addresses[r]) === enteredUnit(addresses[i]));
      if (earlier !== undefined) {
        result.ambiguous.push({ row, reason: 'Listed more than once on the sheet', candidate: stops[matchedStop[earlier]!] });
      } else {
        result.adds.push(row);
      }
    } else {
      result.adds.push(row);
    }
  });

  stops.forEach((stop, index) => {
    if (!takenBy.has(index) && !unresolved.has(index)) result.drops.push(stop);
  });
  return result;
}
