import { useEffect, useState } from 'react';
import { listRateLines } from '@/lib/queries/ListRateLines';
import type { RateLine } from '@/amplify/types';

export function useCustomerRateLines(customerId: string) {
  const [rateLines, setRateLines] = useState<RateLine[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!customerId) {
      setRateLines([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void listRateLines(customerId).then((result) => {
      if (cancelled) return;
      setRateLines((result.data as RateLine[]) || []);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  return { rateLines, loading, setRateLines };
}
