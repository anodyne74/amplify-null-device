'use client';

import { useEffect, useState } from 'react';
import { listOperatorPayouts } from '@/lib/queries/ListOperatorPayouts';
import type { OperatorPayout } from '@/amplify/types';

/**
 * The signed-in Operator's Payouts. An Operator can only read their own
 * (OperatorPayout's owner rule on operatorSub), so the list needs no filter.
 */
export function useMyPayouts(): { payouts: OperatorPayout[]; loading: boolean; error: string | null } {
  const [payouts, setPayouts] = useState<OperatorPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listOperatorPayouts()
      .then((items) => {
        if (!cancelled) setPayouts(items as unknown as OperatorPayout[]);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load payouts.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { payouts, loading, error };
}
