'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import { Card } from '@/app/components/ui/core/Card';
import { PhaseTrackBar } from '@/app/operator/components/PhaseTrackBar';
import { StopCompletionDialog } from '@/app/operator/components/StopCompletionDialog';
import { getRouteWithStops, getCustomer, updateRouteExecution, updateStopExecution } from '@/lib/queries';
import { getSignRunPhase } from '@/lib/signRunPhase';
import { getAgentBadgeInitials } from '@/lib/customerDefaults';
import { getPrimaryAddressLine, getSecondaryAddressLine, haversineDistanceKm } from '@/lib/routeDetailHelpers';
import {
  getDisplayNotes,
  isStopCompletedForPhase,
  PLACEMENT_DONE_MARKER,
  PLACEMENT_SKIPPED_MARKER,
  removeMarker,
  upsertMarker,
} from '@/lib/stopExecutionMarkers';
import type { Route, Stop } from '@/amplify/types';
import styles from './page.module.css';

const RouteStopsMap = dynamic(
  () => import('@/app/operator/components/RouteStopsMap').then((mod) => mod.RouteStopsMap),
  {
    ssr: false,
    loading: () => <div className={styles.mapLoading}>Loading map...</div>,
  }
);

/**
 * There's no routing engine in this codebase — approximate the "leg" between the
 * previous sequenced stop and the current one the same way the design's own
 * prototype does: a straight-line distance with a road-fudge factor, at a fixed
 * average speed. Omitted for the first stop, which has no previous leg.
 */
function getLegLine(stops: Stop[], current: Stop): string | null {
  const currentIndex = stops.findIndex((stop) => stop.id === current.id);
  const previous = currentIndex > 0 ? stops[currentIndex - 1] : null;
  if (
    !previous ||
    typeof previous.latitude !== 'number' ||
    typeof previous.longitude !== 'number' ||
    typeof current.latitude !== 'number' ||
    typeof current.longitude !== 'number'
  ) {
    return null;
  }

  const km = haversineDistanceKm(
    { lat: previous.latitude, lng: previous.longitude },
    { lat: current.latitude, lng: current.longitude }
  ) * 1.3;
  const minutes = Math.max(2, Math.round((km / 22) * 60));
  return `${km.toFixed(1)} km · ${minutes} min`;
}

export default function OperatorPlacementPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeId = searchParams.get('id');

  const [route, setRoute] = useState<Route | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stopExecuting, setStopExecuting] = useState<Record<string, boolean>>({});
  const [actionSheetStopId, setActionSheetStopId] = useState<string | null>(null);
  const [actionSheetStep, setActionSheetStep] = useState<'action' | 'reason'>('action');
  const [completingPhase, setCompletingPhase] = useState(false);

  useEffect(() => {
    if (!routeId) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { route: fetchedRoute, stops: fetchedStops } = await getRouteWithStops(routeId as string);
      if (cancelled) return;

      setRoute(fetchedRoute as Route | null);
      setStops(fetchedStops as Stop[]);

      if (fetchedRoute) {
        const customerResult = await getCustomer(fetchedRoute.customerId);
        if (!cancelled) {
          setCustomerName((customerResult.data as { name?: string } | null)?.name ?? '');
        }
      }
      if (!cancelled) setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  const phaseInfo = useMemo(() => (route ? getSignRunPhase(route, stops.length) : null), [route, stops.length]);
  const isPlacementScreen = route && phaseInfo && phaseInfo.phaseIdx === 1 && stops.length > 0;

  // There's no separate "start driving" button in this flow — opening this screen is
  // the accurate "start" moment, so record it lazily the first time we land here.
  useEffect(() => {
    if (!route || route.placementStartTime || !isPlacementScreen) return;
    void updateRouteExecution(route.id, { placementStartTime: new Date().toISOString() });
  }, [route, isPlacementScreen]);

  const openStops = useMemo(() => stops.filter((stop) => !isStopCompletedForPhase(stop, 'placement')), [stops]);
  const currentStop = openStops[0] ?? null;
  const upcomingStops = openStops.slice(1);
  const actionSheetStop = stops.find((stop) => stop.id === actionSheetStopId) ?? null;

  const openStopSheet = (stopId: string, step: 'action' | 'reason' = 'action') => {
    setActionSheetStopId(stopId);
    setActionSheetStep(step);
  };
  const closeStopSheet = () => setActionSheetStopId(null);

  const settleStop = useCallback(
    async (stopId: string, marker: string, otherMarker: string, reason?: string) => {
      setStopExecuting((prev) => ({ ...prev, [stopId]: true }));
      let succeeded = false;
      try {
        const now = new Date().toISOString();
        const existingStop = stops.find((stop) => stop.id === stopId);
        const withMarker = upsertMarker(existingStop?.notes, marker, now, reason);
        const nextNotes = removeMarker(withMarker, otherMarker);
        const { errors } = await updateStopExecution(stopId, {
          actualArrivalTime: existingStop?.actualArrivalTime ?? now,
          actualDepartureTime: now,
          notes: nextNotes,
        });

        if (!errors || errors.length === 0) {
          setStops((prev) =>
            prev.map((stop) =>
              stop.id === stopId
                ? {
                    ...stop,
                    actualArrivalTime: existingStop?.actualArrivalTime ?? now,
                    actualDepartureTime: now,
                    notes: nextNotes,
                  }
                : stop
            )
          );
          succeeded = true;
        } else {
          setError('Could not save that stop. Try again.');
        }
      } catch {
        setError('Could not save that stop. Try again.');
      }
      setStopExecuting((prev) => ({ ...prev, [stopId]: false }));
      return succeeded;
    },
    [stops]
  );

  const handleStopCompleted = useCallback(
    (stopId: string) => settleStop(stopId, PLACEMENT_DONE_MARKER, PLACEMENT_SKIPPED_MARKER),
    [settleStop]
  );
  const handleSkipStop = useCallback(
    (stopId: string, reason: string) => settleStop(stopId, PLACEMENT_SKIPPED_MARKER, PLACEMENT_DONE_MARKER, reason),
    [settleStop]
  );

  // Completing the last open stop closes the phase and returns to Today — also covers
  // reloading the screen after the last stop was actioned but the phase transition
  // round-trip hadn't landed yet.
  useEffect(() => {
    if (!route || !isPlacementScreen || completingPhase || openStops.length > 0) return;

    setCompletingPhase(true);
    void updateRouteExecution(route.id, {
      executionPhase: 'pickup',
      placementEndTime: new Date().toISOString(),
    }).then(() => {
      router.push('/operator/dashboard');
    });
  }, [route, isPlacementScreen, completingPhase, openStops.length, router]);

  if (!routeId) {
    return (
      <div className={styles.page}>
        <p className={styles.mutedText}>No route selected.</p>
        <Link href="/operator/dashboard" className={styles.backLink}>
          Back to Today
        </Link>
      </div>
    );
  }

  if (loading) return <LoadingSpinner message="Loading route..." />;

  if (!isPlacementScreen) {
    return (
      <div className={styles.page}>
        <Breadcrumbs items={[{ label: 'Today', href: '/operator/dashboard' }, { label: 'Placement' }]} />
        <p className={styles.mutedText}>
          {!route
            ? 'Route not found.'
            : stops.length === 0
            ? 'This route has no stops yet.'
            : 'This route is not currently on the Placement phase.'}
        </p>
        <Link href="/operator/dashboard" className={styles.backLink}>
          Back to Today
        </Link>
      </div>
    );
  }

  const total = stops.length;
  const settledCount = total - openStops.length;

  return (
    <div className={styles.page}>
      <Breadcrumbs
        items={[
          { label: 'Today', href: '/operator/dashboard' },
          { label: `${route.routeCode || route.id.slice(0, 8)} · Placement` },
        ]}
      />

      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={styles.kickerRow}>
        <span className={styles.kicker}>{phaseInfo.phaseKicker}</span>
        {customerName && <span className={styles.customer}>{customerName}</span>}
      </div>

      <PhaseTrackBar track={phaseInfo.track} caption={phaseInfo.phaseNumberLabel} />

      {currentStop ? (
        <>
          <Card padded={false}>
            <div className={styles.mapShell}>
              <RouteStopsMap
                stops={stops}
                activeStopId={currentStop.id}
                upcomingStopIds={upcomingStops.map((stop) => stop.id)}
                presentation="field"
              />
              <div className={styles.glassCard}>
                <div className={styles.glassTopRow}>
                  <span className={styles.glassCounter}>
                    PLACEMENT · STOP {settledCount + 1} OF {total}
                  </span>
                  {getLegLine(stops, currentStop) && (
                    <span className={styles.glassLeg}>{getLegLine(stops, currentStop)}</span>
                  )}
                </div>
                <div className={styles.glassStreet}>
                  {getPrimaryAddressLine(currentStop.formattedAddress || currentStop.address)}
                </div>
                {getSecondaryAddressLine(currentStop.formattedAddress || currentStop.address) && (
                  <div className={styles.glassSuburb}>
                    {getSecondaryAddressLine(currentStop.formattedAddress || currentStop.address)}
                  </div>
                )}
                <div className={styles.glassChips}>
                  <span className={styles.chipSigns}>{currentStop.numberOfSigns ?? '-'} signs</span>
                  <span className={styles.chipAgent}>{currentStop.agent?.trim() || 'Unassigned'}</span>
                  {currentStop.isAuction && <span className={styles.chipAuction}>Auction</span>}
                </div>
                {getDisplayNotes(currentStop.notes) && (
                  <div className={styles.glassNote}>{getDisplayNotes(currentStop.notes)}</div>
                )}
              </div>
            </div>
          </Card>

          <div>
            <div className={styles.thenHeader}>
              <span className={styles.thenLabel}>Then</span>
              <span className={styles.thenHint}>Tap a stop to action out of order</span>
            </div>
            {upcomingStops.length > 0 ? (
              <ol className={styles.thenList}>
                {upcomingStops.map((stop) => (
                  <li key={stop.id}>
                    <button type="button" className={styles.thenItem} onClick={() => openStopSheet(stop.id)}>
                      <span className={styles.thenSequence}>{stop.sequence ?? '-'}</span>
                      <span className={styles.thenBody}>
                        <span className={styles.thenAddress}>
                          {getPrimaryAddressLine(stop.formattedAddress || stop.address)}
                        </span>
                        <span className={styles.thenMeta}>
                          {stop.numberOfSigns ?? '-'} signs ·{' '}
                          {getSecondaryAddressLine(stop.formattedAddress || stop.address)}
                        </span>
                      </span>
                      <span className={styles.thenAgent}>
                        {getAgentBadgeInitials(stop.agent?.trim() || 'Unassigned')}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.mutedText}>No further stops in this phase.</p>
            )}
          </div>

          <div className={styles.actionBar}>
            <button
              type="button"
              className={styles.skipButton}
              onClick={() => openStopSheet(currentStop.id, 'reason')}
              disabled={!!stopExecuting[currentStop.id]}
            >
              Skip
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => { void handleStopCompleted(currentStop.id); }}
              disabled={!!stopExecuting[currentStop.id]}
            >
              {stopExecuting[currentStop.id] ? 'Saving…' : 'Signs placed'}
            </button>
          </div>
        </>
      ) : (
        <p className={styles.mutedText}>All stops actioned. Wrapping up placement…</p>
      )}

      <StopCompletionDialog
        stop={actionSheetStop}
        phase="placement"
        busy={!!actionSheetStop && !!stopExecuting[actionSheetStop.id]}
        initialStep={actionSheetStep}
        onComplete={() => {
          if (!actionSheetStop) return;
          void handleStopCompleted(actionSheetStop.id).then((ok) => {
            if (ok) closeStopSheet();
          });
        }}
        onSkip={(reason) => {
          if (!actionSheetStop) return;
          void handleSkipStop(actionSheetStop.id, reason).then((ok) => {
            if (ok) closeStopSheet();
          });
        }}
        onClose={closeStopSheet}
      />
    </div>
  );
}
