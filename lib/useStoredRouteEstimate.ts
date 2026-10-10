import { useEffect, useState } from 'react';
import { estimateStaleness, type EstimateStop } from '@/lib/routeEstimate';
import { getRouteEstimate, type StoredRouteEstimate } from '@/lib/routeEstimates';

/**
 * A Route's stored Route Estimate, read once for screens that only show it
 * (Finalise), and whether it is out of date against the Route's Stops and
 * Operator as they are now. The estimate is null while loading, when there is
 * none, and when it can't be read: it is a sanity check and never blocks the
 * screen.
 */
export function useStoredRouteEstimate(
  route: { id: string; assignedOperatorSub?: string | null } | null | undefined,
  stops: EstimateStop[]
): { estimate: StoredRouteEstimate | null; outOfDate: boolean } {
  const routeId = route?.id;
  const [estimate, setEstimate] = useState<StoredRouteEstimate | null>(null);

  useEffect(() => {
    if (!routeId) return;
    let cancelled = false;
    void getRouteEstimate(routeId).then((result) => {
      if (!cancelled) setEstimate(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  const outOfDate = Boolean(estimate && route && estimateStaleness(estimate, route, stops));
  return { estimate, outOfDate };
}
