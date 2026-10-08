'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import {
  calculateRouteEstimate,
  formatKm,
  getRouteEstimate,
  type StoredRouteEstimate,
} from '@/lib/routeEstimates';

interface StopLabel {
  id: string;
  formattedAddress?: string | null;
  address?: string | null;
}

const HOME = 'Home base';

/**
 * A Route's Route Estimate (#515, ADR 0011): how far its Operator will drive,
 * Leg by Leg, from home base through the Stops and back. Shown from the stored
 * record; Calculate estimate makes a new one. Informational: never Billed Time.
 */
export function RouteEstimateCard({ routeId, stops }: { routeId: string; stops: StopLabel[] }) {
  const [estimate, setEstimate] = useState<StoredRouteEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getRouteEstimate(routeId).then((result) => {
      if (cancelled) return;
      setEstimate(result.data);
      setError(result.error ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  const calculate = useCallback(async () => {
    setCalculating(true);
    setError(null);
    const result = await calculateRouteEstimate(routeId);
    if (result.ok) setEstimate(result.estimate);
    else setError(result.error);
    setCalculating(false);
  }, [routeId]);

  const labelOf = (stopId?: string | null) => {
    if (!stopId) return HOME;
    const stop = stops.find((candidate) => candidate.id === stopId);
    return stop?.formattedAddress || stop?.address || 'Stop';
  };

  const leftOut = estimate
    ? [
        estimate.leftOutNoPin > 0 && `${estimate.leftOutNoPin} Stop${estimate.leftOutNoPin === 1 ? '' : 's'} with no pin`,
        estimate.leftOutRemoved > 0 && `${estimate.leftOutRemoved} Removed Stop${estimate.leftOutRemoved === 1 ? '' : 's'}`,
      ].filter(Boolean)
    : [];

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
                <strong>{formatKm(estimate.totalMeters)}</strong> in total · calculated{' '}
                {new Date(estimate.calculatedAt).toLocaleString()}
              </p>
              {leftOut.length > 0 && <p role="note">Left out: {leftOut.join(', ')}.</p>}
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
