'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Badge } from '@/app/components/ui/core/Badge';
import { estimateStaleness, leftOutStops, type EstimateStop } from '@/lib/routeEstimate';
import {
  calculateRouteEstimate,
  formatKm,
  getRouteEstimate,
  type StoredRouteEstimate,
} from '@/lib/routeEstimates';

type StopLabel = EstimateStop;

const HOME = 'Home base';

/**
 * A Route's Route Estimate (#515, ADR 0011): how far its Operator will drive,
 * Leg by Leg, from home base through the Stops and back. Shown from the stored
 * record; Calculate estimate makes a new one. Informational: never Billed Time.
 */
export function RouteEstimateCard({
  routeId,
  assignedOperatorSub,
  stops,
  onEstimateChange,
}: {
  routeId: string;
  assignedOperatorSub?: string | null;
  stops: StopLabel[];
  /** Called with the stored estimate once loaded, and with each new one, so the map can draw it. */
  onEstimateChange?: (estimate: StoredRouteEstimate | null) => void;
}) {
  const [estimate, setEstimate] = useState<StoredRouteEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getRouteEstimate(routeId).then((result) => {
      if (cancelled) return;
      setEstimate(result.data);
      onEstimateChange?.(result.data);
      setError(result.error ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  const calculate = useCallback(async () => {
    setCalculating(true);
    setError(null);
    const result = await calculateRouteEstimate(routeId);
    if (result.ok) {
      setEstimate(result.estimate);
      onEstimateChange?.(result.estimate);
    } else setError(result.error);
    setCalculating(false);
  }, [routeId, onEstimateChange]);

  const labelOf = (stopId?: string | null) => {
    if (!stopId) return HOME;
    const stop = stops.find((candidate) => candidate.id === stopId);
    return stop?.formattedAddress || stop?.address || 'Stop';
  };

  const outOfDate = estimate ? estimateStaleness(estimate, { assignedOperatorSub }, stops) : false;
  const leftOut = estimate ? leftOutStops(stops) : [];
  const partial = (estimate?.leftOutNoPin ?? 0) > 0;

  return (
    <Card
      title="Route Estimate"
      subtitle="Road distance from home base through the Stops and back. Informational only."
    >
      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          {estimate ? (
            <div>
              <p>
                <strong>{formatKm(estimate.totalMeters)}</strong> in total
                {partial && <Badge tone="warning" size="sm">partial</Badge>} · calculated{' '}
                {new Date(estimate.calculatedAt).toLocaleString()}
                {outOfDate && <Badge tone="warning" size="sm">out of date</Badge>}
              </p>
              {outOfDate && (
                <p role="note">
                  The Stops, their order, a pin or the Operator have changed since this was calculated. Recalculate to
                  update it.
                </p>
              )}
              {leftOut.length > 0 && (
                <div>
                  <p>Left out of the estimate:</p>
                  <ul aria-label="Left out Stops">
                    {leftOut.map(({ stop, reason }) => (
                      <li key={stop.id}>
                        {stop.formattedAddress || stop.address || 'Stop'} —{' '}
                        {reason === 'removed' ? (
                          'removed'
                        ) : (
                          <>
                            no pin · <Link href="/administrator/locations">Review in Location review</Link>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <ol>
                {estimate.legs
                  .filter((leg): leg is NonNullable<typeof leg> => leg != null)
                  .sort((a, b) => a.order - b.order)
                  .map((leg) => (
                    <li key={leg.order}>
                      {labelOf(leg.fromStopId)} → {labelOf(leg.toStopId)}: {formatKm(leg.distanceMeters)}
                    </li>
                  ))}
              </ol>
            </div>
          ) : (
            <p>No estimate yet.</p>
          )}
          {error && (
            <p className="nd-badge nd-badge--danger" role="alert">
              {error}
            </p>
          )}
          <Button type="button" loading={calculating} disabled={calculating} onClick={() => void calculate()}>
            {error ? 'Try again' : estimate ? 'Recalculate estimate' : 'Calculate estimate'}
          </Button>
        </>
      )}
    </Card>
  );
}
