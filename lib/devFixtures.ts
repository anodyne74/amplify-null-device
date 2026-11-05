import type { Route, Stop } from '@/amplify/types';
import { settleStopNotes } from '@/lib/stopProgress';

/**
 * Fixture Routes for looking at Operator Sign Run screens on a local dev server with no
 * sign-in and no backend (see app/devpreview). Off unless the server is started with
 * NEXT_PUBLIC_DEVPREVIEW=1; Next inlines that at build time, so a normal build has none of
 * this reachable, and the preview page itself returns 404.
 */
export const DEVPREVIEW = process.env.NEXT_PUBLIC_DEVPREVIEW === '1';

export const FIXTURE_USER_ID = 'fixture-operator';
export const FIXTURE_CUSTOMER_ID = 'fixture-customer';

export const FIXTURE_ROUTE_IDS = [
  'fixture-2',
  'fixture-16',
  'fixture-removed',
  'fixture-pickup',
  'fixture-unload',
] as const;
export type FixtureRouteId = (typeof FIXTURE_ROUTE_IDS)[number];

export function isFixtureRouteId(id: string | null | undefined): id is FixtureRouteId {
  return DEVPREVIEW && FIXTURE_ROUTE_IDS.includes(id as FixtureRouteId);
}

const STREETS = [
  'First St',
  'Second Ave',
  'Westgarth Pde',
  'Bastings Ln',
  'Normanby Ave',
  'Rossmoyne St',
  'Mansfield Rd',
  'Hawker Ct',
  'Clarke St',
  'Separation St',
  'Gadd St',
  'Dundas Pl',
  'Wood St',
  'Merri Pde',
  'Arthurton Rd',
  'Cunningham-Whitcombe Esplanade',
];
const AGENTS = ['Rachel Morrow', 'Jem Tran', 'Alexandra Papadopoulos-Whitfield', 'Sam Oyelaran'];

function makeStops(routeId: string, count: number): Stop[] {
  return Array.from({ length: count }, (_, i) => {
    const street = STREETS[i % STREETS.length];
    const address = `${100 + i * 14} ${street}, Northcote VIC 3070`;
    return {
      id: `${routeId}-s${i + 1}`,
      routeId,
      sequence: i + 1,
      address,
      formattedAddress: address,
      agent: AGENTS[i % AGENTS.length],
      numberOfSigns: 2 + (i % 5) * 2,
      isAuction: i % 5 === 0,
      notes: i === 1 ? 'Side gate, sign goes on the nature strip. Dog in the yard.' : undefined,
      latitude: -37.7679 - i * 0.0011,
      longitude: 144.9985 + (i % 4) * 0.0009,
      updatedAt: '2026-11-01T00:00:00.000Z',
    } as Stop;
  });
}

const PLACED_AT = '2026-11-05T10:00:00.000Z';
const PICKED_UP_AT = '2026-11-06T17:00:00.000Z';

function makeRoute(id: string, phase: 'placement' | 'pickup' | 'unload', stops: Stop[]): Route {
  const signs = stops.reduce((sum, stop) => sum + (stop.numberOfSigns ?? 0), 0);
  return {
    id,
    routeCode: 'W45-26-001',
    customerId: FIXTURE_CUSTOMER_ID,
    status: 'in_progress',
    drivingModeEnabled: true,
    executionPhase: phase,
    placementStartTime: '2026-11-05T09:00:00.000Z',
    ...(phase !== 'placement' ? { placementEndTime: PLACED_AT } : {}),
    ...(phase !== 'placement' ? { pickupStartTime: '2026-11-06T16:00:00.000Z' } : {}),
    ...(phase === 'unload' ? { pickupEndTime: PICKED_UP_AT, unloadStartTime: '2026-11-06T17:30:00.000Z' } : {}),
    loadedSignsCount: signs,
    updatedAt: '2026-11-01T00:00:00.000Z',
  } as Route;
}

export function fixtureRouteWithStops(id: FixtureRouteId): { route: Route; stops: Stop[] } {
  const stops = makeStops(id, id === 'fixture-2' ? 2 : 16);
  if (id === 'fixture-removed') {
    stops[2] = {
      ...stops[2],
      removed: true,
      removedAt: '2026-11-05T09:30:00.000Z',
      removedBy: FIXTURE_USER_ID,
      // A reason marks it as removed at the door, so the Operator can restore it.
      removedReason: 'Gate locked / no access',
    } as Stop;
  }
  if (id === 'fixture-pickup' || id === 'fixture-unload') {
    // Every Stop was placed. In Unload, Pickup is also over: all collected but one Couldn't Collect.
    for (const [i, stop] of stops.entries()) {
      let notes = settleStopNotes(stop.notes, 'placement', 'complete', PLACED_AT);
      if (id === 'fixture-unload') {
        notes =
          i === 5
            ? settleStopNotes(notes, 'pickup', 'couldntCollect', PICKED_UP_AT, 'Gate locked / no access')
            : settleStopNotes(notes, 'pickup', 'complete', PICKED_UP_AT);
      }
      stops[i] = { ...stop, notes } as Stop;
    }
  }
  const phase = id === 'fixture-pickup' ? 'pickup' : id === 'fixture-unload' ? 'unload' : 'placement';
  return { route: makeRoute(id, phase, stops), stops };
}
