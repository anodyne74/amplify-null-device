'use client';

import { useMemo, useState } from 'react';
import type { Route, RouteExecutionPhase } from '@/amplify/types';
import { MIN_BILLED_MINUTES, defaultBilledMinutes, measuredPhaseMinutes, sumBilledMinutes } from '@/lib/signRunBilling';

export const DISTANCE_ERROR = 'Enter a distance of 0 km or more.';

/** A typed distance in km, rounded to 0.1, or null when it isn't a number of 0 or more. */
export function parseDistanceKm(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 10) / 10;
}

/**
 * The Finalise adjusters (#408), shared by the operator Finalise screen and the
 * administrator Finalise panel: each phase's billed minutes, seeded from what
 * was measured and kept at its floor, and the distance, typed or stepped.
 */
export function useFinaliseAdjusters(route: Route | null) {
  const [billedOverride, setBilledOverride] = useState<Partial<Record<RouteExecutionPhase, number>>>({});
  const [distanceText, setDistanceText] = useState<string | null>(null);

  const measured = useMemo(() => (route ? measuredPhaseMinutes(route) : null), [route]);
  const defaults = useMemo(() => {
    if (!route || !measured) return null;
    return {
      load: route.billedLoadMinutes ?? defaultBilledMinutes('load', measured.load),
      placement: route.billedPlacementMinutes ?? defaultBilledMinutes('placement', measured.placement),
      pickup: route.billedPickupMinutes ?? defaultBilledMinutes('pickup', measured.pickup),
      unload: route.billedUnloadMinutes ?? defaultBilledMinutes('unload', measured.unload),
    };
  }, [route, measured]);

  const billedMinutes = defaults ? { ...defaults, ...billedOverride } : null;
  const distanceInput = distanceText ?? (route?.overrideDistanceKm ?? 0).toFixed(1);
  const distanceKm = parseDistanceKm(distanceInput);

  const bumpBilled = (phase: RouteExecutionPhase, step: number) => {
    if (!billedMinutes) return;
    const next = Math.max(MIN_BILLED_MINUTES[phase], Math.min(600, billedMinutes[phase] + step));
    setBilledOverride((prev) => ({ ...prev, [phase]: next }));
  };

  // Steps from the typed value; an invalid one steps from 0.
  const bumpKm = (step: number) => {
    setDistanceText(Math.max(0, (distanceKm ?? 0) + step).toFixed(1));
  };

  const billTotal = billedMinutes ? sumBilledMinutes(billedMinutes) : 0;
  const billAligned = billTotal % 15 === 0;
  const nextQuarterHour = Math.ceil(billTotal / 15) * 15;

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
