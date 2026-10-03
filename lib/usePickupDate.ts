'use client';

import { useEffect, useState } from 'react';
import { defaultPickupDate } from '@/lib/pickupDate';
import type { RouteDateBlockResult } from '@/lib/routeScheduleGuard';

/**
 * A new Route's Pickup Date while it's being created: it starts on the day
 * after the Placement Date and follows it until the user picks a date
 * themselves. A day with no operators available is only a warning for
 * pickup, and the customer's closed days don't apply to it.
 */
export function usePickupDate(
  placementDate: string,
  customerId: string,
  checkDateBlock?: (customerId: string, date: string) => Promise<RouteDateBlockResult>
) {
  const [pickupDate, setPickupDate] = useState(() => (placementDate ? defaultPickupDate(placementDate) : ''));
  const [chosen, setChosen] = useState(false);
  const [noOperatorsWarning, setNoOperatorsWarning] = useState<string | null>(null);

  useEffect(() => {
    if (placementDate && !chosen) setPickupDate(defaultPickupDate(placementDate));
  }, [placementDate, chosen]);

  useEffect(() => {
    setNoOperatorsWarning(null);
    if (!checkDateBlock || !customerId || !pickupDate) return;

    let cancelled = false;
    void checkDateBlock(customerId, pickupDate)
      .then((result) => {
        if (!cancelled && result.blocked && result.type === 'no_drivers') {
          setNoOperatorsWarning(
            `Null Device has no operators available on ${pickupDate}${result.reason ? ` (${result.reason})` : ''}. The route can still be created.`
          );
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [checkDateBlock, customerId, pickupDate]);

  const choosePickupDate = (date: string) => {
    setPickupDate(date);
    setChosen(true);
  };

  return { pickupDate, choosePickupDate, noOperatorsWarning };
}
