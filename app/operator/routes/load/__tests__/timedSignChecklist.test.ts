import { checklistAgents, checklistFromStops, checklistReducer, type ChecklistProperty } from '../timedSignChecklist';
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
  it('lists every property with signs in placement order, with its timed sign count', () => {
    expect(checklistFromStops(stops)).toEqual([
      { id: 's1', address: '12 Faraday St, Carlton', agent: 'Rachel Morrow', timed: 4, loaded: false },
      { id: 's2', address: '8 Lygon St, Carlton', agent: 'Jem Tran', timed: 1, loaded: false },
      { id: 's4', address: '2 Elgin St, Carlton', agent: 'Unassigned', timed: 1, loaded: false },
    ]);
  });
});

describe('checklistReducer', () => {
  const start: ChecklistProperty[] = checklistFromStops(stops);

  it('toggles a property loaded and back', () => {
    const loaded = checklistReducer(start, { type: 'toggle', id: 's2' });
    expect(loaded.find((p) => p.id === 's2')?.loaded).toBe(true);
    expect(loaded.find((p) => p.id === 's1')?.loaded).toBe(false);

    const unloaded = checklistReducer(loaded, { type: 'toggle', id: 's2' });
    expect(unloaded.find((p) => p.id === 's2')?.loaded).toBe(false);
  });

  it('removes a property', () => {
    expect(checklistReducer(start, { type: 'remove', id: 's1' }).map((p) => p.id)).toEqual(['s2', 's4']);
  });

  it('adds a property on the day to the end of the list, unloaded and with no timed count', () => {
    const next = checklistReducer(start, {
      type: 'add',
      id: 'added-1',
      address: '  30 Faraday St, Carlton ',
      agent: 'Jem Tran',
    });
    expect(next[next.length - 1]).toEqual({
      id: 'added-1',
      address: '30 Faraday St, Carlton',
      agent: 'Jem Tran',
      timed: null,
      loaded: false,
    });
  });

  it('ignores an add with no address or no agent', () => {
    expect(checklistReducer(start, { type: 'add', id: 'a', address: '  ', agent: 'Jem Tran' })).toBe(start);
    expect(checklistReducer(start, { type: 'add', id: 'a', address: '1 A St', agent: '' })).toBe(start);
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
