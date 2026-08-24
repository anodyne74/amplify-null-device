import { useEffect, useState } from 'react';
import { getRouteWithStops } from '@/lib/queries';
import type { StopSummary } from '@/app/administrator/invoices/stopFormatting';

/**
 * Fetches stops for the route currently selected in the invoice-create form —
 * keyed by routeId directly (not an invoiceId), so it works before the
 * invoice exists. Used to drive the on-screen signs-per-stop preview.
 */
export function useRouteStopsPreview(routeId: string) {
  const [stops, setStops] = useState<StopSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!routeId) {
      setStops([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void getRouteWithStops(routeId).then((result) => {
      if (cancelled) return;
      setStops((result.stops as StopSummary[]) || []);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [routeId]);

  return { stops, loading };
}
