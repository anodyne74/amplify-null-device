'use client';

import { useMemo, useState } from 'react';
import type { Route, RouteExecutionPhase } from '@/amplify/types';
import {
  adjustBilledMinutes,
  isBillableTotal,
  measuredPhaseMinutes,
  nextBillableTotal,
  parseDistanceKm,
  startingBilledMinutes,
  sumBilledMinutes,
  type BilledPhaseMinutes,
} from '@/lib/billedTime';

export const DISTANCE_ERROR = 'Enter a distance of 0 km or more.';

/**
 * The Finalise adjusters (#408), shared by the operator Finalise screen and the
 * administrator Finalise panel: the editing state for a Route's Billed Time
 * (lib/billedTime.ts keeps the rules), with the distance typed or stepped.
 */
export function useFinaliseAdjusters(route: Route | null) {
  const [edited, setEdited] = useState<BilledPhaseMinutes | null>(null);
  const [distanceText, setDistanceText] = useState<string | null>(null);

  const measured = useMemo(() => (route ? measuredPhaseMinutes(route) : null), [route]);
  const starting = useMemo(() => (route ? startingBilledMinutes(route) : null), [route]);

  const billedMinutes = edited ?? starting;
  const distanceInput = distanceText ?? (route?.overrideDistanceKm ?? 0).toFixed(1);
  const distanceKm = parseDistanceKm(distanceInput);

  const bumpBilled = (phase: RouteExecutionPhase, step: number) => {
    if (!billedMinutes) return;
    setEdited(adjustBilledMinutes(billedMinutes, phase, step));
  };

  // Steps from the typed value; an invalid one steps from 0.
  const bumpKm = (step: number) => {
    setDistanceText(Math.max(0, (distanceKm ?? 0) + step).toFixed(1));
  };

  const billTotal = billedMinutes ? sumBilledMinutes(billedMinutes) : 0;
  const billAligned = isBillableTotal(billTotal);
  const nextQuarterHour = nextBillableTotal(billTotal);

  return {
    measured,
    billedMinutes,
    bumpBilled,
    distanceInput,
    setDistanceInput: setDistanceText,
    distanceKm,
    distanceError: distanceKm === null ? DISTANCE_ERROR : null,
    bumpKm,
    billTotal,
    billAligned,
    nextQuarterHour,
    roundUp: () => bumpBilled('unload', nextQuarterHour - billTotal),
    canConfirm: Boolean(billedMinutes) && billAligned && distanceKm !== null,
  };
}

export type FinaliseAdjusters = ReturnType<typeof useFinaliseAdjusters>;
