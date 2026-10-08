import { useEffect, useState } from 'react';
import { getRouteEstimate, type StoredRouteEstimate } from '@/lib/routeEstimates';

/**
 * A Route's stored Route Estimate, read once for screens that only show it
 * (Finalise). Null while loading, when there is none, and when it can't be
 * read: the estimate is a sanity check and never blocks the screen.
 */
export function useStoredRouteEstimate(routeId: string | undefined): StoredRouteEstimate | null {
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

  return estimate;
}
