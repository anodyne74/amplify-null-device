import type { Route } from '@/amplify/types';
import { stopProgress, type ExecutionPhase, type StopProgressStop } from '@/lib/stopProgress';
import { activeStops } from '@/lib/loadChange';

export interface CustomerRouteProgress {
  phase: ExecutionPhase;
  label: 'Placed' | 'Picked up';
  done: number;
  total: number;
}

/** The phase a Customer follows a Route by: Placement until Pickup starts,
 *  then Pickup for the rest of the Route's life. This switches later than the
 *  Sign Run's phase (lib/signRunPhase.ts), which moves on when Placement ends:
 *  between placing signs and starting Pickup, often a day apart, a Customer
 *  should see every sign placed rather than none picked up. */
export function customerProgressPhase(
  route: Pick<Route, 'status' | 'executionPhase' | 'pickupStartTime'>
): ExecutionPhase {
  const pickupStarted =
    Boolean(route.pickupStartTime) ||
    route.executionPhase === 'unload' ||
    route.status === 'signs_picked_up' ||
    route.status === 'completed' ||
    route.status === 'archived';
  return pickupStarted ? 'pickup' : 'placement';
}

/**
 * How far a Route has got, for its Customer: every Stop done in the phase
 * they follow, out of every Stop not skipped in it. A Stop a Load Change
 * removed is in neither.
 */
export function customerRouteProgress(
  route: Pick<Route, 'status' | 'executionPhase' | 'pickupStartTime'>,
  stops: Array<StopProgressStop & { removed?: boolean | null }>
): CustomerRouteProgress {
  const phase = customerProgressPhase(route);
  const states = activeStops(stops).map((stop) => stopProgress(stop)[phase].state);
  return {
    phase,
    label: phase === 'pickup' ? 'Picked up' : 'Placed',
    done: states.filter((state) => state === 'done').length,
    total: states.filter((state) => state !== 'skipped').length,
  };
}
