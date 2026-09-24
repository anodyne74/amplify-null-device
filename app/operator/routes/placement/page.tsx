'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import { Card } from '@/app/components/ui/core/Card';
import { PhaseTrackBar } from '@/app/operator/components/PhaseTrackBar';
import { StopCompletionDialog } from '@/app/operator/components/StopCompletionDialog';
import { ConfirmDialog } from '@/app/operator/components/ConfirmDialog';
import { getCustomer, updateRouteExecution } from '@/lib/queries';
import { useSignRunPhaseScreen } from '@/lib/useSignRunPhaseScreen';
import { useTimestampConfirmDialog } from '@/lib/useTimestampConfirmDialog';
import { settleSignRunStop } from '@/lib/signRunStopSettlement';
import { formatClockTime } from '@/lib/signRunBilling';
import { getAgentBadgeInitials } from '@/lib/customerDefaults';
import { getPrimaryAddressLine, getSecondaryAddressLine, haversineDistanceKm } from '@/lib/routeDetailHelpers';
import { getDisplayNotes, isStopCompletedForPhase, isStopSkippedForPhase } from '@/lib/stopExecutionMarkers';
import type { Route, Stop } from '@/amplify/types';
import { NoRouteSelected, PhaseNotReady } from '../PhaseNotReady';
import shellStyles from '../signRunShell.module.css';
import stopCardStyles from '../../components/signRunStopCard.module.css';
import styles from './page.module.css';

async function fetchCustomerName(route: Route) {
  const customerResult = await getCustomer(route.customerId);
  return (customerResult.data as { name?: string } | null)?.name ?? '';
}

const RouteStopsMap = dynamic(
  () => import('@/app/operator/components/RouteStopsMap').then((mod) => mod.RouteStopsMap),
  {
    ssr: false,
    loading: () => <div className={stopCardStyles.mapLoading}>Loading map...</div>,
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
  const {
    routeId,
    route,
    setRoute,
    stops,
    setStops,
    extra: customerName,
    loading,
    phaseInfo,
    isOnPhase: isPlacementScreen,
  } = useSignRunPhaseScreen({ phaseIdx: 1, fetchExtra: fetchCustomerName });
  const [error, setError] = useState<string | null>(null);
  const [stopExecuting, setStopExecuting] = useState<Record<string, boolean>>({});
  const [actionSheetStopId, setActionSheetStopId] = useState<string | null>(null);
  const [actionSheetStep, setActionSheetStep] = useState<'action' | 'reason'>('action');
  const { dialog, openDialog, closeDialog, submitting, setSubmitting } = useTimestampConfirmDialog<
    'start' | 'complete'
  >();

  const handleStartPlacement = async (iso: string) => {
    if (!route) return;
    setSubmitting(true);
    setError(null);

    const { errors } = await updateRouteExecution(route.id, { placementStartTime: iso });

    setSubmitting(false);
    if (errors && errors.length > 0) {
      setError('Could not start placement. Try again.');
      return;
    }

    setRoute((prev) => (prev ? { ...prev, placementStartTime: iso } : prev));
    closeDialog();
  };

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
    async (stopId: string, action: 'complete' | 'skip', reason?: string) => {
      setStopExecuting((prev) => ({ ...prev, [stopId]: true }));
      const succeeded = await settleSignRunStop({
        stopId,
        stops,
        phase: 'placement',
        action,
        reason,
        onSettled: (id, patch) => {
          setStops((prev) => prev.map((stop) => (stop.id === id ? { ...stop, ...patch } : stop)));
        },
        onError: setError,
      });
      setStopExecuting((prev) => ({ ...prev, [stopId]: false }));
      return succeeded;
    },
    [stops, setStops]
  );

  const handleStopCompleted = useCallback((stopId: string) => settleStop(stopId, 'complete'), [settleStop]);
  const handleSkipStop = useCallback(
    (stopId: string, reason: string) => settleStop(stopId, 'skip', reason),
    [settleStop]
  );

  // Settling the last stop doesn't close the phase on its own — the design leaves the
  // driver on this screen with a "confirm to finish" state (see the glass card and
  // primary button below) and only closes placement out, advancing the route to
  // pickup, once they explicitly tap through.
  const handleCompletePhase = useCallback(
    async (iso: string) => {
      if (!route) return;
      setSubmitting(true);
      setError(null);
      try {
        const { errors } = await updateRouteExecution(route.id, {
          executionPhase: 'pickup',
          placementEndTime: iso,
        });
        if (!errors || errors.length === 0) {
          router.push('/operator/dashboard');
          return;
        }
        setError('Could not close out placement. Try again.');
      } catch {
        setError('Could not close out placement. Try again.');
      }
      setSubmitting(false);
      closeDialog();
    },
    [route, router, closeDialog, setSubmitting]
  );

  if (!routeId) {
    return <NoRouteSelected />;
  }

  if (loading) return <LoadingSpinner message="Loading route..." />;

  if (!isPlacementScreen || !route || !phaseInfo) {
    return (
      <PhaseNotReady
        phaseLabel="Placement"
        message={
          !route
            ? 'Route not found.'
            : stops.length === 0
            ? 'This route has no stops yet.'
            : 'This route is not currently on the Placement phase.'
        }
      />
    );
  }

  const total = stops.length;

  if (!route.placementStartTime) {
    return (
      <div className={shellStyles.page}>
        <Breadcrumbs
          items={[
            { label: 'Today', href: '/operator/dashboard' },
            { label: `${route.routeCode || route.id.slice(0, 8)} · Placement` },
          ]}
        />

        {error && <div className={shellStyles.errorBanner}>{error}</div>}

        <div className={shellStyles.kickerRow}>
          <span className={shellStyles.kicker}>{phaseInfo.phaseKicker}</span>
          {customerName && <span className={shellStyles.customer}>{customerName}</span>}
        </div>
        <h2 className={shellStyles.title}>{total} stops to place</h2>

        <PhaseTrackBar track={phaseInfo.track} caption={phaseInfo.phaseNumberLabel} />

        <div className={styles.startPanel}>Tap start once you&apos;re on the road to begin placement.</div>

        <button
          type="button"
          className={`${shellStyles.primaryButton} ${styles.primaryButton}`}
          onClick={() => openDialog('start')}
          disabled={submitting}
        >
          Start placement
        </button>

        <ConfirmDialog
          open={dialog !== null}
          time={dialog ? formatClockTime(dialog.time) : ''}
          title="Start placement"
          summary={`Starting placement for ${total} stops at ${customerName || 'this route'}.`}
          busy={submitting}
          onCancel={closeDialog}
          onOk={() => {
            if (!dialog) return;
            void handleStartPlacement(dialog.time);
          }}
        />
      </div>
    );
  }

  const settledCount = total - openStops.length;
  // Caps at `total` once every stop is settled — otherwise the counter overshoots to
  // "17 of 16" on the confirm-to-finish state below.
  const stopNumber = Math.min(total, settledCount + 1);
  const legLine = currentStop ? getLegLine(stops, currentStop) : 'Route complete';

  return (
    <div className={shellStyles.page}>
      <Breadcrumbs
        items={[
          { label: 'Today', href: '/operator/dashboard' },
          { label: `${route.routeCode || route.id.slice(0, 8)} · Placement` },
        ]}
      />

      {error && <div className={shellStyles.errorBanner}>{error}</div>}

      <div className={shellStyles.kickerRow}>
        <span className={shellStyles.kicker}>{phaseInfo.phaseKicker}</span>
        {customerName && <span className={shellStyles.customer}>{customerName}</span>}
      </div>

      <PhaseTrackBar track={phaseInfo.track} caption={phaseInfo.phaseNumberLabel} />

      <Card padded={false}>
        <div className={stopCardStyles.mapShell}>
          <RouteStopsMap
            stops={stops}
            activeStopId={currentStop?.id}
            upcomingStopIds={upcomingStops.map((stop) => stop.id)}
            skippedStopIds={stops.filter((stop) => isStopSkippedForPhase(stop, 'placement')).map((stop) => stop.id)}
            presentation="field"
          />
          <div className={stopCardStyles.glassCard}>
            <div className={stopCardStyles.glassTopRow}>
              <span className={stopCardStyles.glassCounter}>
                PLACEMENT · STOP {stopNumber} OF {total}
              </span>
              {legLine && <span className={stopCardStyles.glassLeg}>{legLine}</span>}
            </div>
            {currentStop ? (
              <>
                <div className={stopCardStyles.glassStreet}>
                  {getPrimaryAddressLine(currentStop.formattedAddress || currentStop.address)}
                </div>
                {getSecondaryAddressLine(currentStop.formattedAddress || currentStop.address) && (
                  <div className={stopCardStyles.glassSuburb}>
                    {getSecondaryAddressLine(currentStop.formattedAddress || currentStop.address)}
                  </div>
                )}
                <div className={stopCardStyles.glassChips}>
                  <span className={stopCardStyles.chipSigns}>{currentStop.numberOfSigns ?? '-'} signs</span>
                  <span className={stopCardStyles.chipAgent}>{currentStop.agent?.trim() || 'Unassigned'}</span>
                  {currentStop.isAuction && <span className={stopCardStyles.chipAuction}>Auction</span>}
                </div>
                {getDisplayNotes(currentStop.notes) && (
                  <div className={stopCardStyles.glassNote}>{getDisplayNotes(currentStop.notes)}</div>
                )}
              </>
            ) : (
              <>
                <div className={stopCardStyles.glassStreet}>All stops done</div>
                <div className={stopCardStyles.glassSuburb}>Confirm to send your times and return to Today.</div>
              </>
            )}
          </div>
        </div>
      </Card>

      <div>
        <div className={stopCardStyles.thenHeader}>
          <span className={stopCardStyles.thenLabel}>Then</span>
          <span className={stopCardStyles.thenHint}>Tap a stop to action out of order</span>
        </div>
        {upcomingStops.length > 0 ? (
          <ol className={stopCardStyles.thenList}>
            {upcomingStops.map((stop) => (
              <li key={stop.id}>
                <button type="button" className={stopCardStyles.thenItem} onClick={() => openStopSheet(stop.id)}>
                  <span className={stopCardStyles.thenSequence}>{stop.sequence ?? '-'}</span>
                  <span className={stopCardStyles.thenBody}>
                    <span className={stopCardStyles.thenAddress}>
                      {getPrimaryAddressLine(stop.formattedAddress || stop.address)}
                    </span>
                    <span className={stopCardStyles.thenMeta}>
                      {stop.numberOfSigns ?? '-'} signs ·{' '}
                      {getSecondaryAddressLine(stop.formattedAddress || stop.address)}
                    </span>
                  </span>
                  <span className={stopCardStyles.thenAgent}>
                    {getAgentBadgeInitials(stop.agent?.trim() || 'Unassigned')}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className={shellStyles.mutedText}>No further stops in this phase.</p>
        )}
      </div>

      <div className={stopCardStyles.actionBarSpacer} aria-hidden="true" />
      <div className={stopCardStyles.actionBar}>
        {currentStop && (
          <button
            type="button"
            className={stopCardStyles.skipButton}
            onClick={() => openStopSheet(currentStop.id, 'reason')}
            disabled={!!stopExecuting[currentStop.id]}
          >
            Skip
          </button>
        )}
        <button
          type="button"
          className={`${shellStyles.primaryButton} ${styles.primaryButton} ${stopCardStyles.primaryAction}`}
          onClick={() => {
            if (currentStop) {
              void handleStopCompleted(currentStop.id);
            } else {
              openDialog('complete');
            }
          }}
          disabled={currentStop ? !!stopExecuting[currentStop.id] : submitting}
        >
          {currentStop ? (stopExecuting[currentStop.id] ? 'Saving…' : 'Signs placed') : 'Complete placement'}
        </button>
      </div>

      <ConfirmDialog
        open={dialog !== null}
        time={dialog ? formatClockTime(dialog.time) : ''}
        title="Complete placement"
        summary={`This closes placement for ${route.routeCode} and returns you to Today.`}
        busy={submitting}
        onCancel={closeDialog}
        onOk={() => {
          if (!dialog) return;
          void handleCompletePhase(dialog.time);
        }}
      />

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
