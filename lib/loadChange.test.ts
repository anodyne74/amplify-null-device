import {
  LOAD_STOP_NEEDS_SUBURB,
  activeStops,
  hasLoadChanges,
  isLoadChangeOpen,
  planStopAddition,
  planStopRemoval,
  planStopRestore,
  type LoadChangeRoute,
} from './loadChange';

const AT = '2026-10-04T07:30:00.000Z';
const OUTSIDE_LOAD = 'Stops can only be added or removed between starting and confirming Load.';

function route(overrides: Partial<LoadChangeRoute> = {}): LoadChangeRoute {
  return { id: 'route-1', customerId: 'cust-1', status: 'planned', loadStartedAt: AT, ...overrides } as LoadChangeRoute;
}

const notStarted = route({ loadStartedAt: null });
const confirmed = route({ status: 'in_progress', executionPhase: 'placement', loadConfirmedAt: AT });

describe('activeStops', () => {
  it('leaves out only the Stops a Load Change removed', () => {
    const stops = [{ id: 'a' }, { id: 'b', removed: true }, { id: 'c', removed: false }, { id: 'd', removed: null }];
    expect(activeStops(stops).map((stop) => stop.id)).toEqual(['a', 'c', 'd']);
  });
});

describe('hasLoadChanges', () => {
  it('is set by a Stop added at Load, or one ever removed, even if restored since', () => {
    expect(hasLoadChanges([{}, {}])).toBe(false);
    expect(hasLoadChanges([{}, { addedAtLoad: AT }])).toBe(true);
    expect(hasLoadChanges([{ removedAt: AT }])).toBe(true);
  });
});

describe('isLoadChangeOpen', () => {
  it('is open from Start load until Confirm load', () => {
    expect(isLoadChangeOpen(notStarted)).toBe(false);
    expect(isLoadChangeOpen(route())).toBe(true);
    expect(isLoadChangeOpen(confirmed)).toBe(false);
  });
});

describe('planStopRemoval', () => {
  it('marks the Stop removed, when and by whom', () => {
    expect(planStopRemoval(route(), {}, 'operator-1', AT)).toEqual({
      patch: { removed: true, removedAt: AT, removedBy: 'operator-1' },
    });
  });

  it('refuses outside Load, and a Stop already removed', () => {
    expect(planStopRemoval(notStarted, {}, 'operator-1', AT)).toEqual({ refused: OUTSIDE_LOAD });
    expect(planStopRemoval(confirmed, {}, 'operator-1', AT)).toEqual({ refused: OUTSIDE_LOAD });
    expect(planStopRemoval(route(), { removed: true }, 'operator-1', AT)).toEqual({ refused: 'That stop is already removed.' });
  });
});

describe('planStopRestore', () => {
  it('sets removed back to false, never clearing a field to null', () => {
    expect(planStopRestore(route(), { removed: true })).toEqual({ patch: { removed: false } });
  });

  it("refuses an operator's restore once Load is confirmed, but not an administrator's", () => {
    expect(planStopRestore(confirmed, { removed: true })).toEqual({ refused: OUTSIDE_LOAD });
    expect(planStopRestore(route({ status: 'completed', loadConfirmedAt: AT }), { removed: true }, { anyPhase: true })).toEqual({
      patch: { removed: false },
    });
  });

  it('refuses a Stop that is not removed', () => {
    expect(planStopRestore(route(), {}, { anyPhase: true })).toEqual({ refused: 'That stop is not removed.' });
  });
});

describe('planStopAddition', () => {
  const input = { address: ' 30 Faraday St, Carlton ', agent: ' Lena Park ', numberOfSigns: 3, isAuction: false };
  const stops = [{ sequence: 1 }, { sequence: 4 }, { sequence: null }];

  it('adds a Stop to the end of the order, stamped as added at Load', () => {
    expect(planStopAddition(route(), stops, input, 'new-1', AT)).toEqual({
      stop: {
        id: 'new-1',
        routeId: 'route-1',
        customerId: 'cust-1',
        sequence: 5,
        address: '30 Faraday St, Carlton',
        agent: 'Lena Park',
        numberOfSigns: 3,
        isAuction: false,
        addedAtLoad: AT,
      },
    });
  });

  it('starts the order at 1 on a Route with no Stops', () => {
    const plan = planStopAddition(route(), [], input, 'new-1', AT);
    expect('stop' in plan && plan.stop.sequence).toBe(1);
  });

  it.each([
    [{ address: ' ' }, 'Enter the address.'],
    [{ agent: '' }, 'Pick the agent.'],
    [{ numberOfSigns: 0 }, 'A property needs at least one sign.'],
    [{ numberOfSigns: 1.5 }, 'A property needs at least one sign.'],
    [{ address: '30 Faraday St' }, LOAD_STOP_NEEDS_SUBURB],
  ])('refuses %o', (change, reason) => {
    expect(planStopAddition(route(), stops, { ...input, ...change }, 'new-1', AT)).toEqual({ refused: reason });
  });

  it('refuses outside Load', () => {
    expect(planStopAddition(confirmed, stops, input, 'new-1', AT)).toEqual({ refused: OUTSIDE_LOAD });
  });
});
