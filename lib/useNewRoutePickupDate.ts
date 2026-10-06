'use client';

import { useEffect, useState } from 'react';
import type { StandingPickupDay } from '@/amplify/types';
import { defaultPickupDate } from '@/lib/pickupDate';
import type { RouteDateBlockResult } from '@/lib/routeScheduleGuard';
import { useNoOperatorsWarning } from '@/lib/useNoOperatorsWarning';

/**
 * A new Route's Pickup Date while it's being created: it starts on the
 * selected Customer's Standing Pickup Day after the Placement Date (the day
 * after, if they have none) and follows both the Placement Date and the
 * Customer until the user picks a date themselves. A day with no operators
 * available is only a warning.
 */
export function useNewRoutePickupDate(
  placementDate: string,
  customerId: string,
  standingPickupDay: StandingPickupDay | null | undefined,
  checkDateBlock?: (customerId: string, date: string) => Promise<RouteDateBlockResult>
) {
  const [pickupDate, setPickupDate] = useState(() =>
    placementDate ? defaultPickupDate(placementDate, standingPickupDay) : ''
  );
  const [chosen, setChosen] = useState(false);
  const noOperators = useNoOperatorsWarning(customerId, pickupDate, checkDateBlock);

  useEffect(() => {
    if (placementDate && !chosen) setPickupDate(defaultPickupDate(placementDate, standingPickupDay));
  }, [placementDate, standingPickupDay, chosen]);

  const choosePickupDate = (date: string) => {
    setPickupDate(date);
    setChosen(true);
  };

  return {
    pickupDate,
    choosePickupDate,
    noOperatorsWarning: noOperators && `${noOperators} The route can still be created.`,
  };
}
