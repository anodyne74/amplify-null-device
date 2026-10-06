import { checklistAgents, checklistFromStops, toggleLoaded } from '../timedSignChecklist';
import type { Stop } from '@/amplify/types';

function stop(overrides: Partial<Stop>): Stop {
  return { id: 's', routeId: 'route-1', sequence: 1, address: '1 Test St', numberOfSigns: 1, ...overrides } as Stop;
}

const stops: Stop[] = [
  stop({ id: 's1', address: '12 Faraday St, Carlton', agent: 'Rachel Morrow', numberOfSigns: 4, isAuction: true }),
  stop({ id: 's2', address: '8 Lygon St, Carlton', agent: 'Jem Tran', numberOfSigns: 3, isAuction: false }),
  stop({ id: 's3', address: '40 Drummond St, Carlton', agent: 'Jem Tran', numberOfSigns: 0 }),
  stop({ id: 's4', address: '2 Elgin St, Carlton', agent: undefined, numberOfSigns: 2 }),
];

describe('checklistFromStops', () => {
  const property = { addedAtLoad: false, removed: false, loaded: false };

  it('lists every property in placement order, blank-only and sign-less ones too, with its timed and blank signs', () => {
    expect(checklistFromStops(stops, new Set())).toEqual([
      { ...property, id: 's1', address: '12 Faraday St, Carlton', agent: 'Rachel Morrow', timed: 4, blank: 0 },
      { ...property, id: 's2', address: '8 Lygon St, Carlton', agent: 'Jem Tran', timed: 1, blank: 2 },
      { ...property, id: 's3', address: '40 Drummond St, Carlton', agent: 'Jem Tran', timed: 0, blank: 0 },
      { ...property, id: 's4', address: '2 Elgin St, Carlton', agent: 'Unassigned', timed: 1, blank: 1 },
    ]);
  });

  it('marks the ticked properties loaded', () => {
    const loaded = checklistFromStops(stops, new Set(['s2']));
    expect(loaded.filter((p) => p.loaded).map((p) => p.id)).toEqual(['s2']);
  });

  it('keeps a removed property, never loaded, and flags one added on the day', () => {
    const changed = checklistFromStops(
      [
        stop({ id: 'r', removed: true, removedAt: '2026-10-04T07:00:00.000Z' }),
        stop({ id: 'a', addedAtLoad: '2026-10-04T07:05:00.000Z' }),
      ],
      new Set(['r'])
    );
    expect(changed.map(({ id, removed, addedAtLoad, loaded }) => ({ id, removed, addedAtLoad, loaded }))).toEqual([
      { id: 'r', removed: true, addedAtLoad: false, loaded: false },
      { id: 'a', removed: false, addedAtLoad: true, loaded: false },
    ]);
  });
});

describe('toggleLoaded', () => {
  it('ticks a property and unticks it, leaving the set it was given alone', () => {
    const none = new Set<string>();
    const ticked = toggleLoaded(none, 's2');
    expect([...ticked]).toEqual(['s2']);
    expect(none.size).toBe(0);
    expect([...toggleLoaded(ticked, 's2')]).toEqual([]);
  });
});

describe('checklistAgents', () => {
  it("offers the route's agents first, then the customer's other agents, never Unassigned", () => {
    expect(checklistAgents(stops, ['Lena Park', 'Jem Tran', ' ', null])).toEqual([
      'Rachel Morrow',
      'Jem Tran',
      'Lena Park',
    ]);
  });
});
