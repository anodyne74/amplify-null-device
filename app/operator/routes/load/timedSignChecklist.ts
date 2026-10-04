/**
 * The Load screen's checklist: one row per property, in placement order,
 * ticked off as its signs go onto the van. The rows follow the Route's Stops,
 * so adding or removing a property is a Load Change (lib/loadChange.ts) and is
 * saved; a tick is not — it lives on this screen only.
 */
import { groupByAgent, timedSigns } from '@/lib/signRunTotals';
import { isStopRemoved } from '@/lib/loadChange';
import type { Stop } from '@/amplify/types';

export interface ChecklistProperty {
  id: string;
  address: string;
  agent: string;
  timed: number;
  blank: number;
  addedAtLoad: boolean;
  removed: boolean;
  loaded: boolean;
}

/** Every Stop, in sequence order (stops arrive already sorted), removed ones
 *  included so they can be restored. A removed property is never loaded. */
export function checklistFromStops(stops: Stop[], loadedIds: ReadonlySet<string>): ChecklistProperty[] {
  return stops.map((stop) => {
    const removed = isStopRemoved(stop);
    const timed = timedSigns(stop);
    return {
      id: stop.id,
      address: stop.address ?? '',
      agent: stop.agent?.trim() || 'Unassigned',
      timed,
      blank: (stop.numberOfSigns ?? 0) - timed,
      addedAtLoad: Boolean(stop.addedAtLoad),
      removed,
      loaded: !removed && loadedIds.has(stop.id),
    };
  });
}

/** The ticked ids with `id` flipped. */
export function toggleLoaded(loadedIds: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(loadedIds);
  if (!next.delete(id)) next.add(id);
  return next;
}

/** Agents a property added on the day can belong to: the route's own agents in
 * placement order, then the customer's remaining agents. */
export function checklistAgents(stops: Stop[], customerAgents: Array<string | null>): string[] {
  const agents = groupByAgent(stops)
    .map((group) => group.agent)
    .filter((agent) => agent !== 'Unassigned');
  for (const agent of customerAgents) {
    const name = agent?.trim();
    if (name && !agents.includes(name)) agents.push(name);
  }
  return agents;
}
