'use client';

import { useEffect, useState } from 'react';
import type { RouteDateBlockResult } from '@/lib/routeScheduleGuard';

/**
 * A warning when Null Device has no operators available for a customer on a
 * date, or null. Only no-operator days count: the customer's closed days
 * don't. An empty date, or no check, means no warning.
 */
export function useNoOperatorsWarning(
  customerId: string,
  date: string,
  checkDateBlock?: (customerId: string, date: string) => Promise<RouteDateBlockResult>
) {
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    setWarning(null);
    if (!checkDateBlock || !customerId || !date) return;

    let cancelled = false;
    void checkDateBlock(customerId, date)
      .then((result) => {
        if (!cancelled && result.blocked && result.type === 'no_drivers') {
          setWarning(`Null Device has no operators available on ${date}${result.reason ? ` (${result.reason})` : ''}.`);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [checkDateBlock, customerId, date]);

  return warning;
}
