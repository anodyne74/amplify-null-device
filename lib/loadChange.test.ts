import {
  LOAD_STOP_NEEDS_SUBURB,
  activeStops,
  hasLoadChanges,
  isLoadChangeOpen,
  planStopAddition,
  planStopRemoval,
  planStopRestore,
  removalWindow,
  type LoadChangeRoute,
} from './loadChange';
import { settleStopNotes } from './stopProgress';

const AT = '2026-10-04T07:30:00.000Z';
const OUTSIDE_LOAD = 'Stops can only be added or removed between starting and confirming Load.';
const OUTSIDE_WINDOW = 'Stops can only be removed during Load or Placement.';

function route(overrides: Partial<LoadChangeRoute> = {}): LoadChangeRoute {
  return { id: 'route-1', customerId: 'cust-1', status: 'planned', loadStartedAt: AT, ...overrides } as LoadChangeRoute;
}

const notStarted = route({ loadStartedAt: null });
const confirmed = route({ status: 'in_progress', executionPhase: 'placement', loadConfirmedAt: AT });
const placing = confirmed;
const pickingUp = route({ status: 'in_progress', executionPhase: 'pickup', loadConfirmedAt: AT });

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

describe('removalWindow', () => {
  it('is Load until Load is confirmed, then Placement, then shut from Pickup on', () => {
    expect(removalWindow(notStarted)).toBeNull();
    expect(removalWindow(route())).toBe('load');
    expect(removalWindow(placing)).toBe('placement');
    expect(removalWindow(pickingUp)).toBeNull();
    expect(removalWindow(route({ status: 'completed', loadConfirmedAt: AT }))).toBeNull();
  });
});

describe('planStopRemoval', () => {
  it('marks the Stop removed at Load, when and by whom, with no reason', () => {
    expect(planStopRemoval(route(), {}, 'operator-1', AT, 'ignored')).toEqual({
      window: 'load',
      patch: { removed: true, removedAt: AT, removedBy: 'operator-1' },
    });
  });

  it('marks a Stop removed at the door during Placement with its reason', () => {
    expect(planStopRemoval(placing, {}, 'operator-1', AT, ' Gate locked / no access ')).toEqual({
      window: 'placement',
      patch: { removed: true, removedAt: AT, removedBy: 'operator-1', removedReason: 'Gate locked / no access' },
    });
  });

  it('needs a reason at the door, and refuses a Stop whose signs are already up', () => {
    expect(planStopRemoval(placing, {}, 'operator-1', AT)).toEqual({ refused: 'Say why the signs can’t go up.' });
    const placed = { notes: settleStopNotes(null, 'placement', 'complete', AT) };
    expect(planStopRemoval(placing, placed, 'operator-1', AT, 'Owner or tenant refused')).toEqual({
      refused: 'Its signs are already up, so that stop can’t be removed.',
    });
  });

  it('refuses before Load, from Pickup on, and a Stop already removed', () => {
    expect(planStopRemoval(notStarted, {}, 'operator-1', AT)).toEqual({ refused: OUTSIDE_WINDOW });
    expect(planStopRemoval(pickingUp, {}, 'operator-1', AT, 'No access')).toEqual({ refused: OUTSIDE_WINDOW });
    expect(planStopRemoval(route(), { removed: true }, 'operator-1', AT)).toEqual({ refused: 'That stop is already removed.' });
  });
});

describe('planStopRestore', () => {
  const removedAtLoad = { removed: true };
  const removedAtDoor = { removed: true, removedReason: 'Gate locked / no access' };

  it('sets removed back to false, never clearing a field to null', () => {
    expect(planStopRestore(route(), removedAtLoad)).toEqual({ window: 'load', patch: { removed: false } });
  });

  it('lets the Operator restore a Stop removed at the door until Placement is completed', () => {
    expect(planStopRestore(placing, removedAtDoor)).toEqual({ window: 'placement', patch: { removed: false } });
    expect(planStopRestore(pickingUp, removedAtDoor)).toEqual({ refused: OUTSIDE_WINDOW });
  });

  it("doesn't let the Operator restore a Stop removed at Load once Load is confirmed, as its signs aren't on the van", () => {
    expect(planStopRestore(placing, removedAtLoad)).toEqual({ refused: 'Only an administrator can restore a stop removed at Load.' });
  });

  it("lets an administrator restore either at any time", () => {
    const completed = route({ status: 'completed', loadConfirmedAt: AT });
    expect(planStopRestore(completed, removedAtLoad, { anyPhase: true })).toEqual({ window: null, patch: { removed: false } });
    expect(planStopRestore(placing, removedAtLoad, { anyPhase: true })).toEqual({ window: 'placement', patch: { removed: false } });
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
