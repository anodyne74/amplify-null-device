/**
 * Route Codes (see CONTEXT.md): `W{week}-{yy}-{nnn}`, e.g. W41-26-003. A Route's
 * code comes from its Placement Date, not from the day it was created: the week
 * is the Placement Date's day of the year counted in blocks of seven from
 * 1 January (so 1-7 January is week 1), capped at 52, in the Placement Date's own
 * year; the number is the first unused one in that week. So a Placement on 31
 * December 2026 is W52-26 and one on 1 January 2027 is W01-27. The one place that
 * knows the format; the new Route page asks it for the next code, and an
 * administrator can still type a different one.
 *
 * Pure: it is given the codes already in use and says nothing about whether
 * they could be read. A code is not guaranteed unique -- nothing stores or
 * checks that -- so a caller that couldn't read the existing codes should say so
 * rather than ask for the next one.
 */

const DAY_MS = 86_400_000;
const LAST_WEEK = 52;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `W{week}-{yy}` for a Placement Date (`YYYY-MM-DD`), or null if it isn't one. */
export function routeCodeWeekPrefix(placementDate: string): string | null {
  const match = DATE.exec(placementDate);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];

  const dayOfYear = (Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / DAY_MS + 1;
  const week = Math.min(LAST_WEEK, Math.floor((dayOfYear - 1) / 7) + 1);

  return `W${String(week).padStart(2, '0')}-${String(year).slice(-2)}`;
}

/**
 * The next Route Code for a Placement Date: its week's first number not used by
 * `existingCodes`. Null when the Placement Date isn't a date yet.
 */
export function nextRouteCode(
  existingCodes: ReadonlyArray<string | null | undefined>,
  placementDate: string
): string | null {
  const prefix = routeCodeWeekPrefix(placementDate);
  if (!prefix) return null;

  const used = new Set<number>();
  for (const code of existingCodes) {
    if (!code || !code.startsWith(`${prefix}-`)) continue;
    const match = code.match(/-(\d{3})$/);
    if (match) used.add(Number(match[1]));
  }

  let next = 1;
  while (used.has(next)) next += 1;
  return `${prefix}-${String(next).padStart(3, '0')}`;
}
