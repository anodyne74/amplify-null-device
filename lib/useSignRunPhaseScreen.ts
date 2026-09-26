'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSignRunPhase, type SignRunPhaseInfo } from '@/lib/signRunPhase';
import { useRouteWithStops } from '@/lib/useRouteWithStops';
import type { Route, Stop } from '@/amplify/types';

interface UseSignRunPhaseScreenOptions<TExtra> {
  /** Which of the 5 sign-run screens this is — gates isOnPhase. */
  phaseIdx: SignRunPhaseInfo['phaseIdx'];
  /** Most phase screens are meaningless with no stops; Load is the exception
   * (it gates on signs at the yard, not on a per-stop route). Defaults true. */
  requireStops?: boolean;
  /** Fetches whatever this screen needs beyond the route/stops themselves
   * (customer name, yard address, ...), run once when the route first
   * resolves. If it fails, `extra` stays null. */
  fetchExtra?: (route: Route) => Promise<TExtra>;
}

interface UseSignRunPhaseScreenResult<TExtra> {
  routeId: string | null;
  route: Route | null;
  stops: Stop[];
  /** Shows a write's result straight away — see useRouteWithStops. */
  patchRoute: (patch: Partial<Route>) => void;
  patchStop: (id: string, patch: Partial<Stop>) => void;
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

  const { route, stops, loading: routeLoading, patchRoute, patchStop } = useRouteWithStops(routeId);
  const [extra, setExtra] = useState<TExtra | null>(null);
  const [extraFor, setExtraFor] = useState<string | null>(null);

  // Extra data is fetched once per route, when it first resolves — not on
  // every live update.
  const resolvedRouteId = route?.id ?? null;
  useEffect(() => {
    setExtra(null);
    setExtraFor(null);
    if (!route || !fetchExtra) return;
    let cancelled = false;
    // A failed extra fetch still ends loading — every screen renders without it.
    fetchExtra(route)
      .then((result) => {
        if (!cancelled) setExtra(result);
      })
      .catch((err) => console.error('Failed to load phase screen details:', err))
      .finally(() => {
        if (!cancelled) setExtraFor(route.id);
      });
    return () => {
      cancelled = true;
    };
    // Keyed on the route's id only: live updates to the same route mustn't
    // refetch, and fetchExtra is passed fresh on every render by callers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedRouteId]);

  const loading = routeLoading || Boolean(route && fetchExtra && extraFor !== route.id);

  const phaseInfo = useMemo(() => (route ? getSignRunPhase(route, stops.length) : null), [route, stops.length]);
  const isOnPhase = Boolean(
    route && phaseInfo && phaseInfo.phaseIdx === phaseIdx && (!requireStops || stops.length > 0)
  );

  return { routeId, route, stops, patchRoute, patchStop, extra, loading, phaseInfo, isOnPhase };
}
