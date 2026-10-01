'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useAuthenticator } from '@aws-amplify/ui-react';
import OperatorRoute from '@/app/components/OperatorRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import ConfirmDialog from '@/app/components/ConfirmDialog';
import { StopForm } from '@/app/operator/components/StopForm';
import StopCard from '@/app/operator/components/StopCard';
import { RouteStatusPill } from '@/app/operator/components/RouteStatusPill';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { useRouteDetailData } from '@/lib/use-route-detail-data';
import { billedTime } from '@/lib/billedTime';
import {
  formatCurrency,
  formatElapsedMinutes,
  formatRouteDate,
  getPrimaryAddressLine,
} from '@/lib/routeDetailHelpers';
import { computeRouteSummaryStats, getPhaseOverview } from '@/lib/routeDetailSummary';
import { isStopCompleted, stopProgress } from '@/lib/stopProgress';
import { getStopStatusLabel } from '@/lib/stopStatusLabel';
import { getUserSettings } from '@/lib/userSettings';
import type { MapTheme } from '@/lib/mapThemes';
import { MAP_THEMES } from '@/lib/mapThemes';
import { PhaseTrackBar } from '@/app/operator/components/PhaseTrackBar';
import { getSignRunPhase } from '@/lib/signRunPhase';
import { missingSigns, signsPlaced } from '@/lib/signRunTotals';
import { parseRouteInstructions, sortRouteInstructionsNewestFirst } from '@/lib/routeInstructions';
import styles from './page.module.css';

const PHASE_SCREEN_HREF: Record<number, string> = {
  0: 'load',
  1: 'placement',
  2: 'pickup',
  3: 'unload',
  4: 'finalise',
};

const RouteStopsMap = dynamic(
  () => import('@/app/operator/components/RouteStopsMap').then((mod) => mod.RouteStopsMap),
  {
    ssr: false,
    loading: () => <div className={styles.mapLoading}>Loading map preview...</div>,
  }
);

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
    addStop: addStopCapability,
    editStop: editStopCapability,
    deleteStop: deleteStopCapability,
    reorder,
    deleteRoute: deleteRouteCapability,
    stopNotice,
  } = useRouteDetailData(id, user);


  const [mapTheme, setMapTheme] = useState<MapTheme>('dark');

  // Persist theme selection in localStorage for user convenience
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('operatorMapTheme') : null;
    if (stored && MAP_THEMES.some(t => t.key === stored)) {
      setMapTheme(stored as MapTheme);
    }
  }, []);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('operatorMapTheme', mapTheme);
    }
  }, [mapTheme]);

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
        // Non-blocking: map defaults to dark for field use.
      });

    return () => {
      cancelled = true;
    };
  }, [user?.userId]);

  const planningLocked = route?.status !== 'planned';
  const currentExecutionPhase = route?.executionPhase === 'pickup' ? 'pickup' : 'placement';
  const routeDone = route?.status === 'completed' || route?.status === 'archived';
  const pickupPhaseStops = stops.filter((stop) => stop.serviceType !== 'inspection');
  const visibleStops = (() => {
    if (!route) return stops;

    if (route.status === 'signs_placed') {
      return pickupPhaseStops.filter((stop) => stopProgress(stop).pickup.state === 'pending');
    }

    return stops;
  })();
  const topVisibleStopId = visibleStops[0]?.id ?? null;
  const { routeDurationMinutes, kilometersTravelled, totalStops } = computeRouteSummaryStats(route, stops);
  const billed = billedTime(route ?? {});
  // Every stop counts toward the sign totals, even on a finished route where the
  // other stats summarise completed stops only.
  const totalSignsPlaced = signsPlaced(stops);
  const totalMissingSigns = missingSigns(stops);
  const effectiveKilometersTravelled = billed.distanceKm ?? kilometersTravelled;

  // Read-only phase overview — advancing a route through its phases is now
  // exclusively done from the Load/Placement/Pickup/Unload/Finalise screens,
  // so this links there rather than offering a transition button (see
  // lib/routeDetailSummary.ts).
  const phaseOverviewInfo = getPhaseOverview(route, stops);
  const phaseOverview = phaseOverviewInfo && {
    ...phaseOverviewInfo,
    href:
      phaseOverviewInfo.phaseIdx !== null && route
        ? `/operator/routes/${PHASE_SCREEN_HREF[phaseOverviewInfo.phaseIdx]}?id=${route.id}`
        : null,
  };

  // In-progress routes now run exclusively through the dedicated Load/
  // Placement/Pickup/Unload/Finalise screens — operator field mode on this
  // page is retired. Send the operator to the right phase screen instead of
  // ever rendering the legacy in-page execution UI.
  useEffect(() => {
    if (!route || route.status !== 'in_progress') return;
    const info = getSignRunPhase(route, stops.length);
    const screen = info ? PHASE_SCREEN_HREF[info.phaseIdx] : undefined;
    router.replace(screen ? `/operator/routes/${screen}?id=${route.id}` : '/operator/routes');
  }, [route, stops.length, router]);

  const handleConfirmDeleteRoute = async () => {
    const ok = await deleteRouteCapability.remove();
    if (ok) router.push('/operator/routes');
  };

  if (loading) return <LoadingSpinner message="Loading route..." />;
  if (route?.status === 'in_progress') {
    return <LoadingSpinner message="Redirecting to the active phase screen..." />;
  }

  return (
    <div className={styles.container}>
      <Breadcrumbs
        items={[
          { label: 'Routes', href: '/operator/routes' },
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
              {canManagePlanning && (
                <div className={styles.headerActions}>
                  <a href={`/administrator/routes/edit?id=${route.id}`} className="nd-btn nd-btn--secondary nd-btn--sm">
                    Edit Route
                  </a>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={deleteRouteCapability.deleting}
                    onClick={deleteRouteCapability.confirm}
                  >
                    {deleteRouteCapability.deleting ? 'Deleting...' : 'Delete Route'}
                  </Button>
                </div>
              )}
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
                <span className="nd-stat__value" style={{ fontSize: 16, fontFamily: 'var(--font-mono)' }}>{`${effectiveKilometersTravelled.toFixed(2)} km`}</span>
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

            {(() => {
              const customerInstructionEntries = sortRouteInstructionsNewestFirst(
                parseRouteInstructions(route.customerInstructions)
              );
              if (customerInstructionEntries.length === 0) return null;

              return (
                <div className={styles.routeNotes}>
                  <strong>
                    Special instructions from customer
                    {customerInstructionEntries.length > 1 ? ` (${customerInstructionEntries.length})` : ''}:
                  </strong>
                  {customerInstructionEntries.map((entry, index) => (
                    <div key={`${entry.createdAt}-${index}`} style={{ marginTop: 'var(--space-2)' }}>
                      {entry.text}
                      {(entry.agentLabel || entry.createdAt) && (
                        <div className={styles.mutedText}>
                          {entry.agentLabel ? `${entry.agentLabel} · ` : ''}
                          {entry.createdAt ? formatRouteDate(entry.createdAt) : ''}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Route phase — read-only. Advancing a route through its phases is an
                operator action on the Load/Placement/Pickup/Unload/Finalise screens. */}
            {phaseOverview && (
              <div className={styles.summaryPanel}>
                <h3 className={styles.summaryHeading}>Route Phase</h3>
                <PhaseTrackBar track={[...phaseOverview.track]} caption={phaseOverview.caption} />
                {phaseOverview.href && (
                  <a
                    href={phaseOverview.href}
                    className="nd-btn nd-btn--primary nd-btn--sm"
                    style={{ marginTop: 'var(--space-3)' }}
                  >
                    Continue route →
                  </a>
                )}
              </div>
            )}

            {(route.status === 'completed' || route.status === 'archived') && (
              <div className={styles.summaryPanel}>
                <h3 className={styles.summaryHeading}>Final Route Summary</h3>
                <div className={styles.factsGrid}>
                  <div className="nd-stat">
                    <span className="nd-stat__label">{billed.distanceKm === null ? 'Kilometers Travelled' : 'Billed Distance'}</span>
                    <span className="nd-stat__value" style={{ fontSize: 16, fontFamily: 'var(--font-mono)' }}>{`${effectiveKilometersTravelled.toFixed(2)} km`}</span>
                  </div>
                  <div className="nd-stat">
                    <span className="nd-stat__label">{billed.totalMinutes === null ? 'Time Taken' : 'Billed Time'}</span>
                    <span className="nd-stat__value" style={{ fontSize: 16, fontFamily: 'var(--font-mono)' }}>{formatElapsedMinutes(routeDurationMinutes)}</span>
                  </div>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Stops</span>
                    <span className="nd-stat__value" style={{ fontSize: 16 }}>{totalStops}</span>
                  </div>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Signs Placed</span>
                    <span className="nd-stat__value" style={{ fontSize: 16 }}>{totalSignsPlaced}</span>
                  </div>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Missing Signs</span>
                    <span className="nd-stat__value" style={{ fontSize: 16 }}>{totalMissingSigns}</span>
                  </div>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Customer Rate</span>
                    <span className="nd-stat__value" style={{ fontSize: 16 }}>
                      {customerRatePerHour === null ? '—' : formatCurrency(customerRatePerHour)} / hr
                    </span>
                  </div>
                </div>

              </div>
            )}
          </Card>

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

            {visibleStops.length === 0 && !addStopCapability.visible && route?.status === 'signs_placed' && (
              <div className={styles.emptyState}>
                Ready for pickup phase. Continue from the route phase panel above.
              </div>
            )}

            {stops.length === 0 && !addStopCapability.visible && (
              <div className={styles.emptyState}>
                No stops yet. Click &quot;Add Stop&quot; to add the first one.
              </div>
            )}

            <Card
              title={`Stops (${visibleStops.length})`}
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
                {visibleStops.map((stop, index) => {
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

                  const agentName = stop.agent?.trim() || 'Unassigned';
                  const isTopVisibleStop = stop.id === topVisibleStopId;
                  const completedStop = routeDone
                    ? isStopCompleted(stop)
                    : stopProgress(stop)[currentExecutionPhase].state !== 'pending';

                  const stopActions = canManagePlanning && !planningLocked ? (
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
                        disabled={index === visibleStops.length - 1 || reorder.reordering}
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
                      {deleteStopCapability.pendingId === stop.id ? (
                        <>
                          <Button
                            size="sm"
                            variant="danger"
                            loading={deleteStopCapability.deletingId === stop.id}
                            onClick={() => { void deleteStopCapability.remove(stop.id); }}
                            disabled={reorder.reordering || !!deleteStopCapability.deletingId}
                          >
                            {deleteStopCapability.deletingId === stop.id ? 'Deleting...' : 'Confirm Delete'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={deleteStopCapability.cancel}
                            disabled={reorder.reordering || !!deleteStopCapability.deletingId}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => deleteStopCapability.confirm(stop.id)}
                          disabled={reorder.reordering || !!deleteStopCapability.deletingId}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  ) : null;

                  return (
                    <StopCard
                      key={stop.id}
                      sequence={stop.sequence ?? '?'}
                      serviceType={stop.serviceType}
                      address={getPrimaryAddressLine(stop.formattedAddress || stop.address)}
                      statusLabel={getStopStatusLabel(stop, currentExecutionPhase, route?.status)}
                      agentName={agentName}
                      isTop={isTopVisibleStop}
                      isCompleted={completedStop}
                      isDragging={reorder.draggingStopId === stop.id}
                      draggable={canManagePlanning && !planningLocked && !reorder.reordering}
                      onDragStart={() => reorder.startDragging(stop.id)}
                      onDragOver={(event) => {
                        if (canManagePlanning && !planningLocked) {
                          event.preventDefault();
                        }
                      }}
                      onDrop={() => { void reorder.dropStop(stop.id); }}
                      onDragEnd={reorder.clearDragging}
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
    <OperatorRoute>
      <Suspense fallback={<LoadingSpinner message="Loading route..." />}>
        <RouteDetailContent />
      </Suspense>
    </OperatorRoute>
  );
}
