'use client';

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useAuthenticator } from '@aws-amplify/ui-react';
import OperatorRoute from '@/app/components/OperatorRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import ConfirmDialog from '@/app/components/ConfirmDialog';
import { StopForm } from '@/app/operator/components/StopForm';
import StopCard from '@/app/administrator/components/StopCard';
import { RouteStatusPill } from '@/app/administrator/components/RouteStatusPill';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { useRouteDetailData } from '@/lib/use-route-detail-data';
import { useRouteOverride } from '@/lib/useRouteOverride';
import { getAgentBadgeInitials, getAgentBadgeTone } from '@/lib/customerDefaults';
import {
  formatCurrency,
  formatElapsedMinutes,
  formatRouteDate,
  formatRouteDateTime,
} from '@/lib/routeDetailHelpers';
import { getUserSettings } from '@/lib/queries';
import { PhaseTrackBar } from '@/app/operator/components/PhaseTrackBar';
import { computeRouteSummaryStats, getPhaseOverview, isStopCompleted } from '@/lib/routeDetailSummary';
import { runStopSettlement, stopPhaseOf } from '@/lib/signRunTransitions';
import {
  getPhaseCompletionTime,
  isStopCompletedForPhase,
  isStopSkippedForPhase,
  type ExecutionPhase,
} from '@/lib/stopExecutionMarkers';
import { getStopStatusLabel } from '@/lib/stopStatusLabel';
import type { Route } from '@/amplify/types';
import type { MapTheme } from '@/lib/mapThemes';
import styles from './page.module.css';

const RouteStopsMap = dynamic(
  () => import('@/app/operator/components/RouteStopsMap').then((mod) => mod.RouteStopsMap),
  {
    ssr: false,
    loading: () => <div className={styles.mapLoading}>Loading map preview...</div>,
  }
);

const DEFAULT_SIGNS_COLLECTED_MINUTES = 15;
const DEFAULT_SIGNS_RETURNED_MINUTES = 15;

function phaseMinutes(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  // Legacy-imported routes stamp every phase timestamp with the same single
  // known date (no granular start/end was recorded), not a genuine 0-minute
  // phase — treat that as unknown so it doesn't zero out a real duration.
  if (start === end) return null;
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

function deriveDurationBuckets(route: Route | null, durationTotalMinutes: number) {
  const signsCollectedMinutes = DEFAULT_SIGNS_COLLECTED_MINUTES;
  const signsReturnedMinutes = DEFAULT_SIGNS_RETURNED_MINUTES;
  const distributable = Math.max(0, durationTotalMinutes - signsCollectedMinutes - signsReturnedMinutes);

  const signsPlacedFromRoute = phaseMinutes(route?.placementStartTime, route?.placementEndTime);
  const signsPickedUpFromRoute = phaseMinutes(route?.pickupStartTime, route?.pickupEndTime);

  let signsPlacedMinutes: number;
  let signsPickedUpMinutes: number;

  if (signsPlacedFromRoute !== null || signsPickedUpFromRoute !== null) {
    signsPlacedMinutes = signsPlacedFromRoute ?? Math.max(0, distributable - (signsPickedUpFromRoute ?? 0));
    signsPickedUpMinutes = signsPickedUpFromRoute ?? Math.max(0, distributable - signsPlacedMinutes);
  } else {
    signsPlacedMinutes = Math.ceil(distributable / 2);
    signsPickedUpMinutes = Math.max(0, distributable - signsPlacedMinutes);
  }

  return {
    signsCollectedMinutes,
    signsPlacedMinutes,
    signsPickedUpMinutes,
    signsReturnedMinutes,
  };
}

function getDurationTotalMinutes(values: {
  signsCollectedMinutes: number;
  signsPlacedMinutes: number;
  signsPickedUpMinutes: number;
  signsReturnedMinutes: number;
}) {
  return (
    Math.max(0, values.signsCollectedMinutes) +
    Math.max(0, values.signsPlacedMinutes) +
    Math.max(0, values.signsPickedUpMinutes) +
    Math.max(0, values.signsReturnedMinutes)
  );
}

interface BillingOverrideValues {
  signs: number;
  stops: number;
  distanceKm: number;
  signsCollectedMinutes: number;
  signsPlacedMinutes: number;
  signsPickedUpMinutes: number;
  signsReturnedMinutes: number;
  ratePerHour: number;
  amount: number;
}

// Every Invoice Values field routes through here — the duration/rate fields
// recompute `amount` off the shared formula; signs/stops/distance/amount
// itself are just recorded as typed, matching the pre-extraction behavior.
const RECOMPUTE_AMOUNT_FIELDS: ReadonlySet<keyof BillingOverrideValues> = new Set([
  'signsCollectedMinutes',
  'signsPlacedMinutes',
  'signsPickedUpMinutes',
  'signsReturnedMinutes',
  'ratePerHour',
]);

function updateBillingFieldValue(
  current: BillingOverrideValues,
  key: keyof BillingOverrideValues,
  rawValue: string
): BillingOverrideValues {
  const next = { ...current, [key]: Number(rawValue) };
  if (!RECOMPUTE_AMOUNT_FIELDS.has(key)) return next;

  const amount = Number(((getDurationTotalMinutes(next) / 60) * next.ratePerHour).toFixed(2));
  return { ...next, amount };
}

function RouteDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id') ?? '';
  const { user } = useAuthenticator();

  const {
    route,
    stops,
    loading,
    error,
    customerName,
    customerRatePerHour,
    customerAddressOrigin,
    customerDefaults,
    canManagePlanning,
    availableAgentsForStops,
    defaultAgentForStops,
    refetch,
    addStop: addStopCapability,
    editStop: editStopCapability,
    deleteStop: deleteStopCapability,
    reorder,
    deleteRoute: deleteRouteCapability,
  } = useRouteDetailData(id, user);

  const [dragOverStopId, setDragOverStopId] = useState<string | null>(null);
  const [stopExecuting, setStopExecuting] = useState<Record<string, boolean>>({});
  const [mapTheme, setMapTheme] = useState<MapTheme>('light');

  const { routeDurationMinutes, kilometersTravelled, totalStops, totalSigns } = computeRouteSummaryStats(route, stops);
  const billingDefaults = useMemo(() => {
    const durationMinutes = route?.overrideDurationMinutes ?? routeDurationMinutes ?? 0;
    const durationBuckets = deriveDurationBuckets(route, durationMinutes);
    const totalDurationMinutes = getDurationTotalMinutes(durationBuckets);
    const ratePerHour = route?.overrideRate ?? customerRatePerHour;
    const amount =
      route?.overrideAmount ??
      (ratePerHour !== null
        ? Number(((totalDurationMinutes / 60) * ratePerHour).toFixed(2))
        : 0);

    return {
      signs: route?.overrideSigns ?? totalSigns,
      stops: route?.overrideStops ?? totalStops,
      distanceKm: route?.overrideDistanceKm ?? kilometersTravelled,
      ...durationBuckets,
      durationMinutes: totalDurationMinutes,
      ratePerHour: ratePerHour ?? 0,
      amount,
    };
  }, [
    customerRatePerHour,
    kilometersTravelled,
    route,
    routeDurationMinutes,
    totalSigns,
    totalStops,
  ]);

  const {
    values: billingOverrides,
    setValues: setBillingOverrides,
    saving: savingBillingOverrides,
    error: billingOverrideError,
    success: billingOverrideSuccess,
    save: saveBillingOverrides,
  } = useRouteOverride<BillingOverrideValues>({
    route,
    refetchRoute: refetch,
    computeDefaults: () => billingDefaults,
    buildPayload: (values) => ({
      overrideSigns: values.signs,
      overrideStops: values.stops,
      overrideDistanceKm: values.distanceKm,
      overrideDurationMinutes: getDurationTotalMinutes(values),
      overrideRate: values.ratePerHour,
      overrideAmount: values.amount,
    }),
    errorMessage: 'Failed to save invoice values.',
    successMessage: 'Invoice values saved.',
  });

  const handleStopCompleted = useCallback(async (stopId: string) => {
    const phase = route?.status === 'in_progress' ? stopPhaseOf(route) : null;
    const stop = stops.find((s) => s.id === stopId);
    if (!phase || !stop) return;

    setStopExecuting((prev) => ({ ...prev, [stopId]: true }));
    const result = await runStopSettlement(stop, { phase, action: 'complete' });
    if (!('error' in result)) {
      void refetch();
    }
    setStopExecuting((prev) => ({ ...prev, [stopId]: false }));
  }, [refetch, route, stops]);

  const handleSkipStop = useCallback(async (stopId: string) => {
    const phase = route?.status === 'in_progress' ? stopPhaseOf(route) : null;
    const stop = stops.find((s) => s.id === stopId);
    if (!phase || !stop) return;

    setStopExecuting((prev) => ({ ...prev, [stopId]: true }));
    const result = await runStopSettlement(stop, { phase, action: 'skip' });
    if (!('error' in result)) {
      void refetch();
    }
    setStopExecuting((prev) => ({ ...prev, [stopId]: false }));
  }, [refetch, route, stops]);

  useEffect(() => {
    if (!user?.userId) return;
    if (typeof getUserSettings !== 'function') return;
    let cancelled = false;

    void getUserSettings(user.userId)
      .then((result) => {
        if (cancelled || !result.data?.mapTheme) return;
        setMapTheme(result.data.mapTheme as MapTheme);
      })
      .catch(() => {
        // Non-blocking: map defaults to light.
      });

    return () => {
      cancelled = true;
    };
  }, [user?.userId]);

  const planningLocked = route?.status !== 'planned';
  const currentExecutionPhase: ExecutionPhase = route?.executionPhase === 'pickup' ? 'pickup' : 'placement';
  const placementPhaseStops = stops.filter((stop) => stop.serviceType !== 'pickup');
  const pickupPhaseStops = stops.filter((stop) => stop.serviceType !== 'inspection');
  const stopPhase = route ? stopPhaseOf(route) : null;
  const visibleStops = (() => {
    if (stopPhase === 'placement') {
      return placementPhaseStops.filter((stop) => !isStopCompletedForPhase(stop, 'placement'));
    }

    if (stopPhase === 'pickup') {
      return pickupPhaseStops.filter((stop) => !isStopCompletedForPhase(stop, 'pickup'));
    }

    return stops;
  })();
  const currentPhaseStopIds = new Set(visibleStops.map((stop) => stop.id));
  const topVisibleStopId = visibleStops[0]?.id ?? null;
  // Read-only phase overview — phase advancement now happens exclusively on the
  // operator sign-run screens (Load/Placement/Pickup/Unload/Finalise), so this
  // page no longer offers transition buttons, just a summary of where the
  // route sits in the 6-phase flow (see lib/routeDetailSummary.ts).
  const phaseOverview = getPhaseOverview(route, stops);

  const pendingDeleteStop = deleteStopCapability.pendingId
    ? stops.find((s) => s.id === deleteStopCapability.pendingId) ?? null
    : null;

  const handleConfirmDeleteRoute = async () => {
    const ok = await deleteRouteCapability.remove();
    if (ok) router.push('/administrator/routes');
  };

  if (loading) return <LoadingSpinner message="Loading route..." />;

  return (
    <div className={styles.container}>
      <Breadcrumbs
        items={[
          { label: 'Routes', href: '/administrator/routes' },
          { label: route ? `Route ${route.routeCode || route.id.slice(0, 8)}` : 'Route' },
        ]}
      />

      {error && (
        <div className={styles.errorBanner}>
          {error}
        </div>
      )}

      {route && (
        <>
          {/* Route Header */}
          <Card>
            <div className={styles.routeCardHeader}>
              <h1 className={styles.routeTitle}>
                Route {route.routeCode || route.id.slice(0, 8)}
              </h1>
              <RouteStatusPill route={route} />
              <div className={styles.headerActions}>
                <a href={`/administrator/routes/edit?id=${route.id}`} className="nd-btn nd-btn--secondary nd-btn--sm">
                  Edit Route
                </a>
                {canManagePlanning && (
                  <Button
                    size="sm"
                    variant="danger"
                    loading={deleteRouteCapability.deleting}
                    onClick={deleteRouteCapability.confirm}
                  >
                    {deleteRouteCapability.deleting ? 'Deleting...' : 'Delete Route'}
                  </Button>
                )}
              </div>
            </div>

            <div className={styles.factsGrid}>
              <div className="nd-stat">
                <span className="nd-stat__label">Customer</span>
                <span className="nd-stat__value" style={{ fontSize: 16 }}>{customerName || 'Unknown customer'}</span>
              </div>
              <div className="nd-stat">
                <span className="nd-stat__label">Created</span>
                <span className="nd-stat__value" style={{ fontSize: 16 }}>{formatRouteDate(route.createdAt)}</span>
              </div>
              <div className="nd-stat">
                <span className="nd-stat__label">Time Taken</span>
                <span className="nd-stat__value" style={{ fontSize: 16, fontFamily: 'var(--font-mono)' }}>{formatElapsedMinutes(routeDurationMinutes)}</span>
              </div>
              <div className="nd-stat">
                <span className="nd-stat__label">{route.status === 'planned' ? 'Estimated Kilometers' : 'Kilometers'}</span>
                <span className="nd-stat__value" style={{ fontSize: 16, fontFamily: 'var(--font-mono)' }}>{`${kilometersTravelled.toFixed(2)} km`}</span>
              </div>
              <div className="nd-stat">
                <span className="nd-stat__label">Assigned Operator</span>
                <span className="nd-stat__value" style={{ fontSize: 16 }}>{route.assignedOperatorName || 'Unassigned'}</span>
              </div>
            </div>

            {route.notes && (
              <div className={styles.routeNotes}>
                <strong>Notes: </strong>
                {route.notes}
              </div>
            )}

            {/* Route phase — read-only. Advancing a route through its phases is an
                operator action on the Load/Placement/Pickup/Unload/Finalise screens. */}
            {phaseOverview && (
              <div className={styles.summaryPanel}>
                <h3 className={styles.summaryHeading}>Route Phase</h3>
                <PhaseTrackBar track={[...phaseOverview.track]} caption={phaseOverview.caption} />
              </div>
            )}

            {(route.status === 'signs_picked_up' || route.status === 'completed' || route.status === 'archived') && (
              <div className={styles.summaryPanel}>
                <h3 className={styles.summaryHeading}>Route Summary</h3>
                <div className={styles.factsGrid}>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Kilometers Travelled</span>
                    <span className="nd-stat__value" style={{ fontSize: 16, fontFamily: 'var(--font-mono)' }}>{`${billingDefaults.distanceKm.toFixed(2)} km`}</span>
                  </div>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Time Taken</span>
                    <span className="nd-stat__value" style={{ fontSize: 16, fontFamily: 'var(--font-mono)' }}>{formatElapsedMinutes(billingDefaults.durationMinutes)}</span>
                  </div>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Stops</span>
                    <span className="nd-stat__value" style={{ fontSize: 16 }}>{billingDefaults.stops}</span>
                  </div>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Total Number of Signs</span>
                    <span className="nd-stat__value" style={{ fontSize: 16 }}>{billingDefaults.signs}</span>
                  </div>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Customer Rate</span>
                    <span className="nd-stat__value" style={{ fontSize: 16 }}>
                      {billingDefaults.ratePerHour === 0 ? '—' : formatCurrency(billingDefaults.ratePerHour)} / hr
                    </span>
                  </div>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Amount</span>
                    <span className="nd-stat__value" style={{ fontSize: 16 }}>{formatCurrency(billingDefaults.amount)}</span>
                  </div>
                </div>

                {canManagePlanning && (
                  <div className={styles.billingSection}>
                    <h4 className={styles.billingHeading}>Invoice Values</h4>
                    <div className={styles.billingGrid}>
                      <Field label="Signs">
                        <Input
                          type="number"
                          min="0"
                          value={billingOverrides.signs}
                          onChange={(event) =>
                            setBillingOverrides((current) => updateBillingFieldValue(current, 'signs', event.target.value))
                          }
                        />
                      </Field>
                      <Field label="Stops">
                        <Input
                          type="number"
                          min="0"
                          value={billingOverrides.stops}
                          onChange={(event) =>
                            setBillingOverrides((current) => updateBillingFieldValue(current, 'stops', event.target.value))
                          }
                        />
                      </Field>
                      <Field label="Distance (km)">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={billingOverrides.distanceKm}
                          onChange={(event) =>
                            setBillingOverrides((current) => updateBillingFieldValue(current, 'distanceKm', event.target.value))
                          }
                        />
                      </Field>
                      <Field label="Signs Collected (minutes)">
                        <Input
                          type="number"
                          min="0"
                          value={billingOverrides.signsCollectedMinutes}
                          onChange={(event) =>
                            setBillingOverrides((current) => updateBillingFieldValue(current, 'signsCollectedMinutes', event.target.value))
                          }
                        />
                      </Field>
                      <Field label="Signs Placed (minutes)">
                        <Input
                          type="number"
                          min="0"
                          value={billingOverrides.signsPlacedMinutes}
                          onChange={(event) =>
                            setBillingOverrides((current) => updateBillingFieldValue(current, 'signsPlacedMinutes', event.target.value))
                          }
                        />
                      </Field>
                      <Field label="Signs Picked Up (minutes)">
                        <Input
                          type="number"
                          min="0"
                          value={billingOverrides.signsPickedUpMinutes}
                          onChange={(event) =>
                            setBillingOverrides((current) => updateBillingFieldValue(current, 'signsPickedUpMinutes', event.target.value))
                          }
                        />
                      </Field>
                      <Field label="Signs Returned (minutes)">
                        <Input
                          type="number"
                          min="0"
                          value={billingOverrides.signsReturnedMinutes}
                          onChange={(event) =>
                            setBillingOverrides((current) => updateBillingFieldValue(current, 'signsReturnedMinutes', event.target.value))
                          }
                        />
                      </Field>
                      <Field label="Total Duration (minutes)">
                        <Input
                          type="number"
                          min="0"
                          value={getDurationTotalMinutes(billingOverrides)}
                          readOnly
                        />
                      </Field>
                      <Field label="Rate per Hour">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={billingOverrides.ratePerHour}
                          onChange={(event) =>
                            setBillingOverrides((current) => updateBillingFieldValue(current, 'ratePerHour', event.target.value))
                          }
                        />
                      </Field>
                      <Field label="Amount">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={billingOverrides.amount}
                          onChange={(event) =>
                            setBillingOverrides((current) => updateBillingFieldValue(current, 'amount', event.target.value))
                          }
                        />
                      </Field>
                    </div>

                    <div className={styles.billingActions}>
                      <Button
                        type="button"
                        loading={savingBillingOverrides}
                        disabled={savingBillingOverrides}
                        onClick={() => { void saveBillingOverrides(); }}
                      >
                        {savingBillingOverrides ? 'Saving…' : 'Save Invoice Values'}
                      </Button>
                      <div className={styles.billingMeta}>
                        Default amount from duration and rate: {formatCurrency(billingDefaults.amount)}
                      </div>
                    </div>
                    {billingOverrideError && <div className={styles.errorBanner}>{billingOverrideError}</div>}
                    {billingOverrideSuccess && <div className={styles.successText}>{billingOverrideSuccess}</div>}
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Stops Section */}
          <div className={styles.stopsSection}>
            <Card title="Route Map" padded={false}>
              <div className={styles.mapShell}>
                <RouteStopsMap stops={stops} activeStopId={topVisibleStopId} mapTheme={mapTheme} />
              </div>
            </Card>

            {canManagePlanning && !planningLocked && (
              <div className={styles.reorderHint}>Drag and drop stop cards to change sequence.</div>
            )}
            {reorder.reordering && <div className={styles.reorderStatus}>Saving updated stop order...</div>}
            {reorder.error && <div className={styles.errorBanner}>{reorder.error}</div>}

            {/* Add Stop Form */}
            {addStopCapability.visible && !planningLocked && (
              <Card title="Add Stop">
                <StopForm
                  onSubmit={addStopCapability.add}
                  onCancel={addStopCapability.close}
                  addressSearchOrigin={customerAddressOrigin}
                  standingInstructions={customerDefaults?.standingInstructions ?? undefined}
                  defaultNumberOfSigns={customerDefaults?.defaultNumberOfSigns ?? undefined}
                  defaultAgentInitials={defaultAgentForStops}
                  availableAgents={availableAgentsForStops}
                  isSubmitting={addStopCapability.adding}
                  error={addStopCapability.error}
                  submitLabel="Add Stop"
                />
              </Card>
            )}

            {visibleStops.length === 0 && !addStopCapability.visible && (route?.status === 'in_progress' || route?.status === 'signs_placed') && (
              <div className={styles.emptyState}>
                {stopPhase === 'placement'
                  ? 'All signs are placed. Start the pickup phase to continue.'
                  : route?.status === 'signs_placed'
                  ? 'Ready for pickup phase. Click Start Route to begin pickup.'
                  : pickupPhaseStops.length === 0
                  ? 'No pickup-phase stops on this route. The route can be completed.'
                  : 'All pickup stops are complete. Click End Route to finish pickup phase.'}
              </div>
            )}

            {stops.length === 0 && !addStopCapability.visible && (
              <div className={styles.emptyState}>
                No stops yet. Click &quot;Add Stop&quot; to add the first one.
              </div>
            )}

            <Card
              title={`Stops (${stops.length})${visibleStops.length !== stops.length ? ` - In Current Phase: ${visibleStops.length}` : ''}`}
              action={
                canManagePlanning && !planningLocked && !addStopCapability.visible ? (
                  <Button size="sm" onClick={addStopCapability.open}>
                    Add Stop
                  </Button>
                ) : undefined
              }
              padded={false}
            >
              <div className={styles.stopsList}>
                {stops.map((stop, index) => {
                  if (editStopCapability.stopId === stop.id) {
                    return (
                      <div key={stop.id} className={styles.editFormWrap}>
                        <h3 className={styles.formHeading}>Edit Stop</h3>
                        <StopForm
                          initialValues={{
                            address: stop.address,
                            serviceType: stop.serviceType as 'delivery' | 'pickup' | 'inspection' | undefined,
                            numberOfSigns: stop.numberOfSigns ?? undefined,
                            agent: stop.agent ?? undefined,
                            isAuction: Boolean(stop.isAuction),
                            notes: stop.notes,
                          }}
                          onSubmit={editStopCapability.save}
                          onCancel={editStopCapability.cancel}
                          addressSearchOrigin={customerAddressOrigin}
                          standingInstructions={customerDefaults?.standingInstructions ?? undefined}
                          defaultNumberOfSigns={customerDefaults?.defaultNumberOfSigns ?? undefined}
                          defaultAgentInitials={defaultAgentForStops}
                          availableAgents={availableAgentsForStops}
                          isSubmitting={editStopCapability.editing}
                          error={editStopCapability.error}
                          submitLabel="Save Changes"
                        />
                      </div>
                    );
                  }

                  const isTopVisibleStop = stop.id === topVisibleStopId;
                  const isCurrentPhaseStop = currentPhaseStopIds.has(stop.id);
                  const completedStop = isStopCompleted(stop);
                  const phaseComplete = isStopCompletedForPhase(stop, currentExecutionPhase);
                  const phaseSkipped = isStopSkippedForPhase(stop, currentExecutionPhase);
                  const phaseCompletedAt = getPhaseCompletionTime(stop, currentExecutionPhase) ?? stop.actualDepartureTime;
                  const agentName = stop.agent?.trim() || 'Unassigned';
                  const agentInitials = getAgentBadgeInitials(agentName);
                  const agentBadgeTone = getAgentBadgeTone(agentName);

                  let stopActions: React.ReactNode = null;
                  if (canManagePlanning && !planningLocked) {
                    stopActions = (
                      <div className={styles.stopActionsRow}>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { void reorder.moveStop(stop.id, 'up'); }}
                          disabled={index === 0 || reorder.reordering}
                        >
                          Move Up
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { void reorder.moveStop(stop.id, 'down'); }}
                          disabled={index === stops.length - 1 || reorder.reordering}
                        >
                          Move Down
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => editStopCapability.start(stop.id)}
                          disabled={reorder.reordering || !!deleteStopCapability.deletingId}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          loading={deleteStopCapability.deletingId === stop.id}
                          onClick={() => deleteStopCapability.confirm(stop.id)}
                          disabled={reorder.reordering || !!deleteStopCapability.deletingId}
                        >
                          Delete
                        </Button>
                      </div>
                    );
                  } else if (route?.status === 'in_progress' && isCurrentPhaseStop) {
                    stopActions = !phaseComplete ? (
                      <div className={styles.execActionRow}>
                        <Button
                          size="sm"
                          onClick={() => { void handleStopCompleted(stop.id); }}
                          disabled={!!stopExecuting[stop.id]}
                        >
                          {stopExecuting[stop.id]
                            ? 'Saving…'
                            : route.executionPhase === 'pickup'
                            ? 'Signs Picked Up'
                            : 'Signs Placed'}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => { void handleSkipStop(stop.id); }}
                          disabled={!!stopExecuting[stop.id]}
                        >
                          Skip Stop
                        </Button>
                      </div>
                    ) : (
                      <div className={styles.execDone}>
                        {phaseSkipped ? (
                          <span className={styles.execSkippedBadge}>⏭ Skipped</span>
                        ) : (
                          <span>
                            ✓ {currentExecutionPhase === 'pickup' ? 'Collected' : 'Placed'}:{' '}
                            {formatRouteDateTime(phaseCompletedAt)}
                          </span>
                        )}
                      </div>
                    );
                  }

                  return (
                    <StopCard
                      key={stop.id}
                      sequence={stop.sequence ?? '?'}
                      serviceType={stop.serviceType}
                      address={stop.formattedAddress || stop.address || ''}
                      statusLabel={getStopStatusLabel(stop, currentExecutionPhase, route?.status)}
                      agentInitials={agentInitials}
                      agentName={agentName}
                      agentBadgeTone={agentBadgeTone}
                      isAuction={Boolean(stop.isAuction)}
                      isTop={isTopVisibleStop}
                      isCompleted={completedStop}
                      isDragging={reorder.draggingStopId === stop.id}
                      isDropTarget={dragOverStopId === stop.id && reorder.draggingStopId !== stop.id}
                      draggable={canManagePlanning && !planningLocked && !reorder.reordering}
                      onDragStart={() => reorder.startDragging(stop.id)}
                      onDragOver={(event) => {
                        if (canManagePlanning && !planningLocked) {
                          event.preventDefault();
                          setDragOverStopId(stop.id);
                        }
                      }}
                      onDragLeave={() => {
                        setDragOverStopId((current) => (current === stop.id ? null : current));
                      }}
                      onDrop={() => {
                        setDragOverStopId(null);
                        void reorder.dropStop(stop.id);
                      }}
                      onDragEnd={() => {
                        reorder.clearDragging();
                        setDragOverStopId(null);
                      }}
                      actions={stopActions}
                    />
                  );
                })}
              </div>
            </Card>
          </div>
        </>
      )}

      <ConfirmDialog
        open={deleteStopCapability.pendingId !== null}
        title="Delete stop?"
        message={`Delete stop${pendingDeleteStop?.address ? ` at ${pendingDeleteStop.address}` : ''}?`}
        confirmLabel="Delete"
        tone="danger"
        busy={deleteStopCapability.deletingId === deleteStopCapability.pendingId}
        onConfirm={() => {
          if (deleteStopCapability.pendingId) void deleteStopCapability.remove(deleteStopCapability.pendingId);
        }}
        onCancel={deleteStopCapability.cancel}
      />

      <ConfirmDialog
        open={deleteRouteCapability.pending}
        title="Delete route?"
        message={`Delete route ${route?.routeCode || route?.id.slice(0, 8)}? This will also delete all stops on the route.`}
        confirmLabel="Delete"
        tone="danger"
        busy={deleteRouteCapability.deleting}
        onConfirm={() => void handleConfirmDeleteRoute()}
        onCancel={deleteRouteCapability.cancel}
      />
    </div>
  );
}

export default function RouteDetailPage() {
  return (
    <OperatorRoute requireAdmin>
      <Suspense fallback={<LoadingSpinner message="Loading route..." />}>
        <RouteDetailContent />
      </Suspense>
    </OperatorRoute>
  );
}
