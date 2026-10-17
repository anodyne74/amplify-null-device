/**
 * Route Codes (see CONTEXT.md): `W{week}-{yy}-{nnn}`, e.g. W41-26-003. The week
 * is the week of the year counted in blocks of seven days from 1 January, of
 * the date two days earlier (so a Route made on a Monday or Tuesday still reads
 * as the previous week's), and the number is the first unused one in that week.
 * The one place that knows the format; the new Route page asks it for the next
 * code, and an administrator can still type a different one.
 *
 * Pure: it is given the codes already in use and says nothing about whether
 * they could be read. A code is not guaranteed unique -- nothing stores or
 * checks that -- so a caller that couldn't read the existing codes should say so
 * rather than ask for the next one.
 */

const DAY_MS = 86_400_000;

/** `W{week}-{yy}` for the week a Route made on `date` belongs to (local time). */
export function routeCodeWeekPrefix(date: Date = new Date()): string {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() - 2);

  const yearStart = new Date(shifted.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((shifted.getTime() - yearStart.getTime()) / DAY_MS) + 1;
  const week = Math.floor((dayOfYear - 1) / 7) + 1;
  const yy = String(shifted.getFullYear()).slice(-2);

  return `W${String(week).padStart(2, '0')}-${yy}`;
}

/** The next Route Code for `date`: its week's first number not used by `existingCodes`. */
export function nextRouteCode(existingCodes: ReadonlyArray<string | null | undefined>, date: Date = new Date()): string {
  const prefix = routeCodeWeekPrefix(date);
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
