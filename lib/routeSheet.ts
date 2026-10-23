import { activeStops } from '@/lib/loadChange';

/**
 * The Stops a Route Sheet lists (CONTEXT.md): every one not removed, in their
 * current order, each with the row number printed beside it. Numbered from 1
 * with no gap where a Removed Stop was, so the sheet matches the van.
 */
export function routeSheetStops<T extends { sequence?: number | null; removed?: boolean | null }>(
  stops: T[]
): Array<T & { row: number }> {
  return [...activeStops(stops)]
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    .map((stop, index) => ({ ...stop, row: index + 1 }));
}

/** How a Route is referred to on screen and paper: its code, else the start of its id. */
export function routeReference(route: { id: string; routeCode?: string | null }): string {
  return route.routeCode || route.id.slice(0, 8);
}

/** The Sign Run phases the sheet's time grid has blank Start/End boxes for. */
export const ROUTE_SHEET_PHASES = ['Load', 'Placement', 'Pickup', 'Unload'] as const;

