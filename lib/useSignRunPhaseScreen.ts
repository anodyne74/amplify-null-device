'use client';

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useSearchParams } from 'next/navigation';
import { getRouteWithStops } from '@/lib/queries';
import { getSignRunPhase, type SignRunPhaseInfo } from '@/lib/signRunPhase';
import type { Route, Stop } from '@/amplify/types';

interface UseSignRunPhaseScreenOptions<TExtra> {
  /** Which of the 5 sign-run screens this is — gates isOnPhase. */
  phaseIdx: SignRunPhaseInfo['phaseIdx'];
  /** Most phase screens are meaningless with no stops; Load is the exception
   * (it gates on signs at the yard, not on a per-stop route). Defaults true. */
  requireStops?: boolean;
  /** Fetches whatever this screen needs beyond the route/stops themselves
   * (customer name, yard address, ...), run once the route resolves. */
  fetchExtra?: (route: Route) => Promise<TExtra>;
}

interface UseSignRunPhaseScreenResult<TExtra> {
  routeId: string | null;
  route: Route | null;
  setRoute: Dispatch<SetStateAction<Route | null>>;
  stops: Stop[];
  setStops: Dispatch<SetStateAction<Stop[]>>;
  extra: TExtra | null;
  loading: boolean;
  phaseInfo: SignRunPhaseInfo | null;
  /** True once the route/stops have loaded and the route is actually sitting
   * on this screen's phase — the gate every phase screen renders behind. */
  isOnPhase: boolean;
}

/**
 * The fetch-and-gate scaffolding shared by every Driver Sign Run phase screen
 * (Load/Placement/Pickup/Unload/Finalise): read routeId from the query
 * string, fetch the route + its stops, derive phaseInfo, and report whether
 * the route actually belongs on this screen right now.
 */
export function useSignRunPhaseScreen<TExtra = undefined>({
  phaseIdx,
  requireStops = true,
  fetchExtra,
}: UseSignRunPhaseScreenOptions<TExtra>): UseSignRunPhaseScreenResult<TExtra> {
  const searchParams = useSearchParams();
  const routeId = searchParams.get('id');

  const [route, setRoute] = useState<Route | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [extra, setExtra] = useState<TExtra | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!routeId) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { route: rawRoute, stops: fetchedStops } = await getRouteWithStops(routeId as string);
      if (cancelled) return;

      const fetchedRoute = rawRoute as Route | null;
      setRoute(fetchedRoute);
      setStops(fetchedStops as Stop[]);

      if (fetchedRoute && fetchExtra) {
        const extraResult = await fetchExtra(fetchedRoute);
        if (!cancelled) setExtra(extraResult);
      }
      if (!cancelled) setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
    // fetchExtra is passed fresh on every render by callers — deliberately not a
    // dependency, since routeId is the only thing that should trigger a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  const phaseInfo = useMemo(() => (route ? getSignRunPhase(route, stops.length) : null), [route, stops.length]);
  const isOnPhase = Boolean(
    route && phaseInfo && phaseInfo.phaseIdx === phaseIdx && (!requireStops || stops.length > 0)
  );

  return { routeId, route, setRoute, stops, setStops, extra, loading, phaseInfo, isOnPhase };
}
