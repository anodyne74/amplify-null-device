'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
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
import { RouteRequestsCard } from '@/app/administrator/components/RouteRequestsCard';
import { AdministratorFinalisePanel } from '@/app/administrator/components/AdministratorFinalisePanel';
import { BilledTimeCorrectionPanel } from '@/app/administrator/components/BilledTimeCorrectionPanel';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Badge } from '@/app/components/ui/core/Badge';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { useRouteDetailData } from '@/lib/use-route-detail-data';
import { useRouteOverride } from '@/lib/useRouteOverride';
import {
  formatCurrency,
  formatElapsedMinutes,
  formatRouteDate,
  formatRouteDateTime,
} from '@/lib/routeDetailHelpers';
import { getUserSettings } from '@/lib/userSettings';
import { PhaseTrackBar } from '@/app/operator/components/PhaseTrackBar';
import { computeRouteSummaryStats, getPhaseOverview } from '@/lib/routeDetailSummary';
import { getSignRunPhase } from '@/lib/signRunPhase';
import {
  removeStopAsAdministrator,
  restoreStopAsAdministrator,
  settleStopAsAdministrator,
  type AdministratorActionResult,
  type AdministratorSettlement,
} from '@/lib/administratorRouteActions';
import { isRemovedAtDoor } from '@/lib/loadChange';
import { STOP_PROBLEM_REASONS } from '@/app/operator/components/StopCompletionDialog';
import { stopPhaseOf } from '@/lib/signRunTransitions';
import { billedTime } from '@/lib/billedTime';
import { isStopCompleted, stopProgress, type ExecutionPhase } from '@/lib/stopProgress';
import { getStopStatusLabel, labelledPhase, stopProgressTone } from '@/lib/stopStatusLabel';
import type { MapTheme } from '@/lib/mapThemes';
import styles from './page.module.css';

const RouteStopsMap = dynamic(
  () => import('@/app/operator/components/RouteStopsMap').then((mod) => mod.RouteStopsMap),
  {
    ssr: false,
    loading: () => <div className={styles.mapLoading}>Loading map preview...</div>,
  }
);

interface InvoiceCountValues {
  signs: number;
  stops: number;
}

function RouteDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id') ?? '';
  const { user } = useAuthenticator();

  const {
    route,
    stops,
    removedStops,
    loadChanged,
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
    stopNotice,
  } = useRouteDetailData(id, user);

  const [dragOverStopId, setDragOverStopId] = useState<string | null>(null);
  const [stopExecuting, setStopExecuting] = useState<Record<string, boolean>>({});
  const [stopErrors, setStopErrors] = useState<Record<string, string | null>>({});
  const [mapTheme, setMapTheme] = useState<MapTheme>('light');

  const { routeDurationMinutes, kilometersTravelled, totalStops, totalSigns } = computeRouteSummaryStats(route, stops);
  const billed = billedTime(route ?? {});
  const invoiceCounts: InvoiceCountValues = {
    signs: route?.overrideSigns ?? totalSigns,
    stops: route?.overrideStops ?? totalStops,
  };
  const amount =
    billed.totalMinutes !== null && customerRatePerHour !== null ? (billed.totalMinutes / 60) * customerRatePerHour : null;

  const {
    values: invoiceCountOverrides,
    setValues: setInvoiceCountOverrides,
    saving: savingInvoiceCounts,
    error: invoiceCountError,
    success: invoiceCountSuccess,
    save: saveInvoiceCounts,
  } = useRouteOverride<InvoiceCountValues>({
    route,
    refetchRoute: refetch,
    computeDefaults: () => invoiceCounts,
    buildPayload: (values) => ({ overrideSigns: values.signs, overrideStops: values.stops }),
    errorMessage: 'Failed to save the invoice counts.',
    successMessage: 'Invoice counts saved.',
  });

  // The Stop whose "Can't place" / "Couldn't collect" reasons are showing.
  const [problemStopId, setProblemStopId] = useState<string | null>(null);

  const runStopAction = useCallback(
    async (stopId: string, action: () => Promise<AdministratorActionResult>) => {
      setStopExecuting((prev) => ({ ...prev, [stopId]: true }));
      setStopErrors((prev) => ({ ...prev, [stopId]: null }));
      const result = await action();
      if (!result.ok) setStopErrors((prev) => ({ ...prev, [stopId]: result.error }));
      // Refetch once the Stop is saved, even if only its audit entry failed.
      if (result.ok || result.saved) void refetch();
      setStopExecuting((prev) => ({ ...prev, [stopId]: false }));
    },
    [refetch]
  );

  const settleStop = useCallback(
    (stopId: string, settlement: AdministratorSettlement) => {
      const stop = stops.find((s) => s.id === stopId);
      if (!route || !stop) return;
      setProblemStopId(null);
      void runStopAction(stopId, () => settleStopAsAdministrator(route, stop, settlement));
    },
    [route, runStopAction, stops]
  );

  // Can't place, during Placement: the Stop comes off the Route with the reason.
  const removeStop = useCallback(
    (stopId: string, reason: string) => {
      const stop = stops.find((s) => s.id === stopId);
      if (!route || !stop) return;
      setProblemStopId(null);
      void runStopAction(stopId, () => removeStopAsAdministrator(route, stop, reason));
    },
    [route, runStopAction, stops]
  );

  const restoreStop = useCallback(
    (stopId: string) => {
      const stop = removedStops.find((s) => s.id === stopId);
      if (!route || !stop) return;
      void runStopAction(stopId, () => restoreStopAsAdministrator(route, stop));
    },
    [removedStops, route, runStopAction]
  );

  useEffect(() => {
    if (!user?.userId) return;
    if (typeof getUserSettings !== 'function') return;
    let cancelled = false;

    void getUserSettings(user.userId)
      .then((settings) => {
        if (cancelled || !settings?.mapTheme) return;
        setMapTheme(settings.mapTheme as MapTheme);
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
  const routeDone = route?.status === 'completed' || route?.status === 'archived';
  const stopPhase = route ? stopPhaseOf(route) : null;
  const visibleStops = (() => {
    if (stopPhase === 'placement') {
      return stops.filter((stop) => stopProgress(stop).placement.state === 'pending');
    }

    if (stopPhase === 'pickup') {
      return stops.filter((stop) => stopProgress(stop).pickup.state === 'pending');
    }

    return stops;
  })();
  const currentPhaseStopIds = new Set(visibleStops.map((stop) => stop.id));
  const topVisibleStopId = visibleStops[0]?.id ?? null;
  // Phase overview — phase advancement happens on the operator sign-run
  // screens (Load/Placement/Pickup/Unload/Finalise), so this page only
  // summarises where the route sits in the 6-phase flow (see
  // lib/routeDetailSummary.ts). The exception is Finalise, which an
  // administrator can also do here once Unload is confirmed (#408).
  const phaseOverview = getPhaseOverview(route, stops);
  const awaitingFinalise = route ? getSignRunPhase(route, stops.length)?.phaseIdx === 4 : false;

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
              {loadChanged && <Badge tone="info" dot>changed on the day</Badge>}
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
                <span className="nd-stat__label">Placement Date</span>
                <span className="nd-stat__value" style={{ fontSize: 16 }}>{formatRouteDate(route.scheduledDate)}</span>
              </div>
              <div className="nd-stat">
                <span className="nd-stat__label">Pickup Date</span>
                <span className="nd-stat__value" style={{ fontSize: 16 }}>{formatRouteDate(route.pickupDate)}</span>
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

            {/* Route phase. Advancing a route through its phases is an operator
                action on the Load/Placement/Pickup/Unload/Finalise screens, apart
                from Finalise, which an administrator can also do here (#408). */}
            {phaseOverview && (
              <div className={styles.summaryPanel}>
                <h3 className={styles.summaryHeading}>Route Phase</h3>
                <PhaseTrackBar track={[...phaseOverview.track]} caption={phaseOverview.caption} />
              </div>
            )}

            {awaitingFinalise && (
              <div className={styles.summaryPanel}>
                <h3 className={styles.summaryHeading}>Finalise Route</h3>
                <AdministratorFinalisePanel key={route.id} route={route} onFinalised={refetch} />
              </div>
            )}

            {(route.status === 'signs_picked_up' || route.status === 'completed' || route.status === 'archived') && (
              <div className={styles.summaryPanel}>
                <h3 className={styles.summaryHeading}>Route Summary</h3>
                <div className={styles.factsGrid}>
                  <div className="nd-stat">
                    <span className="nd-stat__label">{billed.distanceKm === null ? 'Kilometers Travelled' : 'Billed Distance'}</span>
                    <span className="nd-stat__value" style={{ fontSize: 16, fontFamily: 'var(--font-mono)' }}>{`${(billed.distanceKm ?? kilometersTravelled).toFixed(2)} km`}</span>
                  </div>
                  <div className="nd-stat">
                    <span className="nd-stat__label">{billed.totalMinutes === null ? 'Time Taken' : 'Billed Time'}</span>
                    <span className="nd-stat__value" style={{ fontSize: 16, fontFamily: 'var(--font-mono)' }}>{formatElapsedMinutes(routeDurationMinutes)}</span>
                  </div>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Stops</span>
                    <span className="nd-stat__value" style={{ fontSize: 16 }}>{invoiceCounts.stops}</span>
                  </div>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Total Number of Signs</span>
                    <span className="nd-stat__value" style={{ fontSize: 16 }}>{invoiceCounts.signs}</span>
                  </div>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Customer Rate</span>
                    <span className="nd-stat__value" style={{ fontSize: 16 }}>
                      {customerRatePerHour === null ? '—' : formatCurrency(customerRatePerHour)} / hr
                    </span>
                  </div>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Amount</span>
                    <span className="nd-stat__value" style={{ fontSize: 16 }}>{amount === null ? '—' : formatCurrency(amount)}</span>
                  </div>
                </div>

                {canManagePlanning && (route.status === 'completed' || route.status === 'archived') && (
                  <div className={styles.billingSection}>
                    <h4 className={styles.billingHeading}>Correct Billed Time</h4>
                    <BilledTimeCorrectionPanel key={route.id} route={route} onSaved={refetch} />
                  </div>
                )}

                {canManagePlanning && (
                  <div className={styles.billingSection}>
                    <h4 className={styles.billingHeading}>Signs and Stops Invoiced</h4>
                    <div className={styles.billingGrid}>
                      <Field label="Signs">
                        <Input
                          type="number"
                          min="0"
                          value={invoiceCountOverrides.signs}
                          onChange={(event) =>
                            setInvoiceCountOverrides((current) => ({ ...current, signs: Number(event.target.value) }))
                          }
                        />
                      </Field>
                      <Field label="Stops">
                        <Input
                          type="number"
                          min="0"
                          value={invoiceCountOverrides.stops}
                          onChange={(event) =>
                            setInvoiceCountOverrides((current) => ({ ...current, stops: Number(event.target.value) }))
                          }
                        />
                      </Field>
                    </div>

                    <div className={styles.billingActions}>
                      <Button
                        type="button"
                        loading={savingInvoiceCounts}
                        disabled={savingInvoiceCounts}
                        onClick={() => { void saveInvoiceCounts(); }}
                      >
                        {savingInvoiceCounts ? 'Saving…' : 'Save Signs and Stops'}
                      </Button>
                    </div>
                    {invoiceCountError && <div className={styles.errorBanner}>{invoiceCountError}</div>}
                    {invoiceCountSuccess && <div className={styles.successText}>{invoiceCountSuccess}</div>}
                  </div>
                )}
              </div>
            )}
          </Card>

          <RouteRequestsCard routeId={route.id} customerId={route.customerId ?? null} />

          {/* Stops Section */}
          <div className={styles.stopsSection}>
            <Card title="Route Map" padded={false}>
              <div className={styles.mapShell}>
                <RouteStopsMap
                  stops={stops}
                  activeStopId={topVisibleStopId}
                  phase={routeDone ? undefined : currentExecutionPhase}
                  mapTheme={mapTheme}
                />
              </div>
            </Card>

            {canManagePlanning && !planningLocked && (
              <div className={styles.reorderHint}>Drag and drop stop cards to change sequence.</div>
            )}
            {reorder.reordering && <div className={styles.reorderStatus}>Saving updated stop order...</div>}
            {reorder.error && <div className={styles.errorBanner}>{reorder.error}</div>}
            {stopNotice && <div className={styles.noticeBanner} role="status">{stopNotice}</div>}

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
                  : stops.length === 0
                  ? 'No stops on this route. The route can be completed.'
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
                  const phaseProgress = stopProgress(stop)[currentExecutionPhase];
                  const phaseComplete = phaseProgress.state !== 'pending';
                  const completedStop = routeDone ? isStopCompleted(stop) : phaseComplete;
                  const pickupProgress = stopProgress(stop).pickup;
                  const agentName = stop.agent?.trim() || 'Unassigned';

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
                    const inPickup = currentExecutionPhase === 'pickup';
                    stopActions = (
                      <>
                        {problemStopId === stop.id ? (
                          <div className={styles.execActionRow}>
                            <span className={styles.execPrompt}>
                              {inPickup ? "Why couldn't the signs be collected?" : "Why can't the signs go up?"}
                            </span>
                            {STOP_PROBLEM_REASONS[currentExecutionPhase].map((reason) => (
                              <Button
                                key={reason}
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  if (inPickup) settleStop(stop.id, { action: 'couldntCollect', reason });
                                  else removeStop(stop.id, reason);
                                }}
                                disabled={!!stopExecuting[stop.id]}
                              >
                                {reason}
                              </Button>
                            ))}
                            <Button size="sm" variant="ghost" onClick={() => setProblemStopId(null)}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className={styles.execActionRow}>
                            <Button
                              size="sm"
                              onClick={() => settleStop(stop.id, { action: 'complete' })}
                              disabled={!!stopExecuting[stop.id]}
                            >
                              {stopExecuting[stop.id] ? 'Saving…' : inPickup ? 'Signs Picked Up' : 'Signs Placed'}
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setProblemStopId(stop.id)}
                              disabled={!!stopExecuting[stop.id]}
                            >
                              {inPickup ? "Couldn't collect" : "Can't place"}
                            </Button>
                          </div>
                        )}
                        {stopErrors[stop.id] && (
                          <div className={styles.errorBanner} role="alert">{stopErrors[stop.id]}</div>
                        )}
                      </>
                    );
                  } else if (pickupProgress.state === 'couldntCollect') {
                    // Its signs are still out there: settled collected once someone recovers them,
                    // during Pickup or any time after.
                    stopActions = (
                      <>
                        <div className={styles.execActionRow}>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => settleStop(stop.id, { action: 'complete' })}
                            disabled={!!stopExecuting[stop.id]}
                          >
                            {stopExecuting[stop.id] ? 'Saving…' : 'Signs Collected'}
                          </Button>
                        </div>
                        {stopErrors[stop.id] && (
                          <div className={styles.errorBanner} role="alert">{stopErrors[stop.id]}</div>
                        )}
                      </>
                    );
                  }

                  return (
                    <StopCard
                      key={stop.id}
                      sequence={stop.sequence ?? '?'}
                      tone={stopProgressTone(stop, labelledPhase(currentExecutionPhase, route?.status))}
                      address={stop.formattedAddress || stop.address || ''}
                      statusLabel={getStopStatusLabel(stop, currentExecutionPhase, route?.status)}
                      agentName={agentName}
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

            {removedStops.length > 0 && (
              <Card title={`Removed on the day (${removedStops.length})`} padded={false}>
                <div className={styles.stopsList}>
                  {removedStops.map((stop) => (
                    <StopCard
                      key={stop.id}
                      sequence="–"
                      tone="couldntCollect"
                      address={stop.formattedAddress || stop.address || ''}
                      statusLabel={[
                        `Removed ${isRemovedAtDoor(stop) ? 'at the door' : 'at Load'} ${formatRouteDateTime(stop.removedAt)}`,
                        stop.removedReason && isRemovedAtDoor(stop) ? stop.removedReason : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      agentName={stop.agent?.trim() || 'Unassigned'}
                      isAuction={Boolean(stop.isAuction)}
                      actions={
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => { void restoreStop(stop.id); }}
                            disabled={!!stopExecuting[stop.id]}
                          >
                            {stopExecuting[stop.id] ? 'Saving…' : 'Restore'}
                          </Button>
                          {stopErrors[stop.id] && (
                            <div className={styles.errorBanner} role="alert">{stopErrors[stop.id]}</div>
                          )}
                        </>
                      }
                    />
                  ))}
                </div>
              </Card>
            )}
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
        message={`Delete route ${route?.routeCode || route?.id.slice(0, 8)}? This will also delete all stops on the route. Its requests go back to the Request inbox.`}
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
