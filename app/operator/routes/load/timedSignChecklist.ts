/**
 * The Load screen's timed-sign checklist: one row per property, in placement
 * order, ticked off as its timed signs go onto the van. Checklist only — it
 * lives on this screen and is never saved, so nothing here touches the Route.
 */
import { groupByAgent, timedSigns } from '@/lib/signRunTotals';
import type { Stop } from '@/amplify/types';

export interface ChecklistProperty {
  id: string;
  address: string;
  agent: string;
  /** Timed signs for the property; null for one added on the day. */
  timed: number | null;
  loaded: boolean;
}

export type ChecklistAction =
  | { type: 'toggle'; id: string }
  | { type: 'remove'; id: string }
  | { type: 'add'; id: string; address: string; agent: string };

/** Every property with signs, in sequence order (stops arrive already sorted). */
export function checklistFromStops(stops: Stop[]): ChecklistProperty[] {
  return stops
    .filter((stop) => timedSigns(stop) > 0)
    .map((stop) => ({
      id: stop.id,
      address: stop.address ?? '',
      agent: stop.agent?.trim() || 'Unassigned',
      timed: timedSigns(stop),
      loaded: false,
    }));
}

export function checklistReducer(state: ChecklistProperty[], action: ChecklistAction): ChecklistProperty[] {
  switch (action.type) {
    case 'toggle':
      return state.map((p) => (p.id === action.id ? { ...p, loaded: !p.loaded } : p));
    case 'remove':
      return state.filter((p) => p.id !== action.id);
    case 'add': {
      const address = action.address.trim();
      if (!address || !action.agent) return state;
      return [...state, { id: action.id, address, agent: action.agent, timed: null, loaded: false }];
    }
  }
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
