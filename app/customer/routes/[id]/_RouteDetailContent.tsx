'use client';

import { useEffect, useState } from 'react';
import { useCustomerPortalContext, type CustomerPortalContext } from '@/lib/useCustomerPortalContext';
import { useRouteWithStops } from '@/lib/useRouteWithStops';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import RouteTimeline from '@/app/customer/components/RouteTimeline';
import RouteFeedbackCard from '@/app/customer/components/RouteFeedbackCard';
import StopListItem from '@/app/customer/components/StopListItem';
import { RouteRequestsSection } from '@/app/customer/components/RouteRequestsSection';
import { RouteStopsMap } from '@/app/operator/components/RouteStopsMap';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { IconButton } from '@/app/components/ui/core/IconButton';
import { Avatar } from '@/app/components/ui/core/Avatar';
import { Input } from '@/app/components/ui/forms/Input';
import { Select } from '@/app/components/ui/forms/Select';
import { ProgressBar } from '@/app/components/ui/data/ProgressBar';
import type { Customer } from '@/amplify/types';
import { formatDurationHoursMinutes } from '@/lib/format';
import { formatRouteDate, getRouteDate } from '@/lib/routeDetailHelpers';
import { billedTime } from '@/lib/billedTime';
import { appendRouteInstruction, parseRouteInstructions, sortRouteInstructionsNewestFirst } from '@/lib/routeInstructions';
import { useIsNarrowViewport } from '@/lib/useIsNarrowViewport';
import { getRoutePhaseKey, ROUTE_PHASE_KEYS } from '@/lib/signRunPhase';
import { missingSigns, signsPlaced } from '@/lib/signRunTotals';
import { stopProgress } from '@/lib/stopProgress';
import { customerRouteProgress } from '@/lib/customerRouteProgress';
import { activeStops, isStopRemoved } from '@/lib/loadChange';
import { customerPickupDate } from '@/lib/pickupDate';
import HelpLink from '@/app/customer/components/HelpLink';
import styles from './_RouteDetailContent.module.css';
import { updateRouteCustomerInstructions } from '@/lib/routes';
import { getCustomer, listCustomerUsers } from '@/lib/customers';

// Mirrors the existing .stopsAndMap collapse breakpoint in
// _RouteDetailContent.module.css, so the JS-driven reorder below and the
// CSS single-column collapse kick in together.
const NARROW_BREAKPOINT_PX = 820;

interface CustomerUserSummary {
  userSub: string;
  name?: string | null;
}

interface RouteDetailContentProps {
  params: {
    id: string;
  };
}

interface CustomerData {
  customer: Customer | null;
  customerUsers: CustomerUserSummary[];
}

async function fetchCustomerData(context: CustomerPortalContext): Promise<CustomerData> {
  // Best-effort: resolves authorSub -> name for the instructions feed below.
  // CustomerUser is only readable by its own owner (self) or the account
  // owner (all rows) — a read_only viewer gets back just their own record,
  // so entries authored by another Customer User fall back to the stored agentLabel.
  const [fetchedCustomer, fetchedCustomerUsers] = await Promise.all([
    getCustomer(context.customerId).catch(() => null),
    listCustomerUsers(context.customerId).catch(() => []),
  ]);

  return {
    customer: (fetchedCustomer as unknown as Customer) || null,
    customerUsers: (fetchedCustomerUsers as unknown as CustomerUserSummary[]) || [],
  };
}

/**
 * Customer Route Detail Page
 * Shows full route information with stops and timeline
 */
export default function RouteDetailContent({ params }: RouteDetailContentProps) {
  const {
    userId,
    customerId,
    data,
    loading: contextLoading,
    error: contextError,
  } = useCustomerPortalContext({ fetchData: fetchCustomerData });
  const {
    route: liveRoute,
    stops: allStops,
    loading: routeLoading,
    error: routeError,
    patchRoute,
  } = useRouteWithStops(params.id);
  // AppSync authorization already keeps other customers' routes out of
  // reach; this is a second line of defence in the UI.
  const forbidden = Boolean(liveRoute && customerId && liveRoute.customerId !== customerId);
  const route = forbidden ? null : liveRoute;
  const loading = contextLoading || routeLoading;
  const error =
    contextError ||
    (routeError ? 'Failed to load route details' : null) ||
    (forbidden ? 'You do not have permission to view this route' : null);
  const customer = data?.customer ?? null;
  // A Stop removed on the day counts toward nothing; it's listed after the rest.
  const stops = activeStops(allStops);
  const removedStops = allStops.filter(isStopRemoved);
  const customerUsers = data?.customerUsers ?? [];

  const [instructionsExpanded, setInstructionsExpanded] = useState(true);
  const [instructionsDraft, setInstructionsDraft] = useState('');
  const [instructionsAgent, setInstructionsAgent] = useState('');
  const [savingInstructions, setSavingInstructions] = useState(false);
  const [instructionsError, setInstructionsError] = useState<string | null>(null);
  const [instructionsSuccess, setInstructionsSuccess] = useState<string | null>(null);
  const isNarrow = useIsNarrowViewport(NARROW_BREAKPOINT_PX);

  useEffect(() => {
    if (!customer) return;
    setInstructionsAgent(customer.agentOptions?.[0] ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  const handleAddInstruction = async () => {
    if (!route || !instructionsDraft.trim() || instructionsLocked) return;
    setSavingInstructions(true);
    setInstructionsError(null);
    setInstructionsSuccess(null);

    const nextValue = appendRouteInstruction(route.customerInstructions, {
      text: instructionsDraft,
      agentLabel: instructionsAgent || undefined,
      authorSub: userId,
    });

    const result = await updateRouteCustomerInstructions(route.id, nextValue);

    if (result.errors && result.errors.length > 0) {
      setInstructionsError('Could not save your instructions.');
      setSavingInstructions(false);
      return;
    }

    patchRoute({ customerInstructions: nextValue });
    setInstructionsDraft('');
    setInstructionsSuccess('Instruction added.');
    setSavingInstructions(false);
  };

  if (loading) {
    return <LoadingSpinner message="Loading route details..." />;
  }

  if (error || !route) {
    return (
      <ProtectedRoute>
        <div>
          <Breadcrumbs
            items={[
              { label: 'Routes', href: '/customer/routes' },
              { label: 'Route' },
            ]}
          />
          <div className={styles.errorBanner}>{error || 'Route not found'}</div>
        </div>
      </ProtectedRoute>
    );
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const instructionEntries = sortRouteInstructionsNewestFirst(parseRouteInstructions(route.customerInstructions));
  const agentOptions = customer?.agentOptions ?? [];
  const customerUsersBySub = new Map(customerUsers.map((cu) => [cu.userSub, cu]));
  // getRoutePhaseKey (not the raw loadConfirmedAt field) is what determines
  // this — legacy routes predating that field still resolve to their correct
  // phase (e.g. via route.status), so the lock holds even for old data where
  // loadConfirmedAt was never backfilled. Phase index >= signs_placed covers
  // "placement has begun" through the rest of the route's life.
  const currentPhase = getRoutePhaseKey(route);
  const instructionsLocked = ROUTE_PHASE_KEYS.indexOf(currentPhase) >= ROUTE_PHASE_KEYS.indexOf('signs_placed');

  const routeLabel = route.routeCode || `${route.id.slice(0, 8)}...`;
  const totalSigns = signsPlaced(stops);
  const missingTotal = missingSigns(stops);
  const progress = customerRouteProgress(route, stops);
  const pickupDate = customerPickupDate(route);
  const pickupDateLabel = pickupDate ? formatRouteDate(pickupDate) : 'TBC';
  // Next and upcoming stops are those still awaiting the phase the Customer is
  // following, the same one as the Progress card and the stop list; there's no
  // next stop once every one has been done or couldn't be collected.
  const pendingStops = stops.filter(
    (stop) => stopProgress(stop)[progress.phase].state === 'pending'
  );
  const nextStop = pendingStops[0] ?? null;
  const showNextStop = Boolean(nextStop) && (currentPhase === 'signs_placed' || currentPhase === 'signs_picked_up');
  const upcomingStopIds = pendingStops.slice(1, 3).map((stop) => stop.id);

  // On a narrow viewport the map renders before the stop list — a glanceable
  // overview before a potentially long scroll, mirroring the card-list swap
  // already used by the routes list page at the same breakpoint.
  const stopsCard = (
    <Card title={`Stops (${stops.length})`} subtitle="Tap a stop to highlight it on the map" padded={false}>
      {stops.length === 0 ? (
        <p className={styles.noStopsText}>No stops scheduled for this route</p>
      ) : (
        <div className={styles.stopsList}>
          {stops.map((stop, index) => (
            <StopListItem key={stop.id} stop={stop} sequence={index + 1} phase={progress.phase} />
          ))}
          {removedStops.map((stop) => (
            <StopListItem key={stop.id} stop={stop} sequence={null} phase={progress.phase} />
          ))}
        </div>
      )}
    </Card>
  );

  const mapCard = (
    <Card title="Route map" subtitle="Numbered stops in service order">
      <div className={styles.mapShell}>
        <RouteStopsMap
          stops={stops}
          activeStopId={nextStop?.id ?? null}
          upcomingStopIds={upcomingStopIds}
          phase={route.status === 'in_progress' ? progress.phase : undefined}
          mapTheme="dark"
          presentation="field"
        />
      </div>
    </Card>
  );

  return (
    <ProtectedRoute>
      <div className={styles.page}>
        <Breadcrumbs
          items={[
            { label: 'Routes', href: '/customer/routes' },
            { label: `Route ${routeLabel}` },
          ]}
        />

        <div className={styles.titleRow}>
          <h1 className={styles.pageTitle}>Route {routeLabel}</h1>
          <HelpLink />
        </div>

        <Card title="Route status" subtitle="Placement then pickup">
          <RouteTimeline route={route} />
        </Card>

        <div className={styles.detailsGrid}>
          <div className="nd-stat">
            <span className="nd-stat__label">Status</span>
            <span className="nd-stat__value" style={{ fontSize: 20 }}>
              {(route.status || 'unknown').replace(/_/g, ' ')}
            </span>
          </div>

          <div className="nd-stat">
            <span className="nd-stat__label">Duration</span>
            <span className="nd-stat__value" style={{ fontSize: 20, fontFamily: 'var(--font-mono)' }}>
              {/* Total time is only known once the operator finalises the route,
                  so this stays N/A until then rather than showing an estimate. */}
              {currentPhase === 'completed'
                ? formatDurationHoursMinutes(billedTime(route).totalMinutes)
                : 'N/A'}
            </span>
          </div>

          <div className="nd-stat">
            <span className="nd-stat__label">Placement date</span>
            <span className="nd-stat__value" style={{ fontSize: 15 }}>
              {formatRouteDate(getRouteDate(route))}
            </span>
          </div>
        </div>

        <div className={styles.detailsGrid}>
          <div className="nd-stat">
            <span className="nd-stat__label">Stops</span>
            <span className="nd-stat__value" style={{ fontSize: 20, fontFamily: 'var(--font-mono)' }}>{stops.length}</span>
          </div>
          <div className="nd-stat">
            <span className="nd-stat__label">Signs out</span>
            <span className="nd-stat__value" style={{ fontSize: 20, fontFamily: 'var(--font-mono)' }}>{totalSigns}</span>
          </div>
          {/* Once Pickup has started, and only if any are missing. */}
          {progress.phase === 'pickup' && missingTotal > 0 && (
            <div className="nd-stat">
              <span className="nd-stat__label">Signs missing</span>
              <span className="nd-stat__value" style={{ fontSize: 20, fontFamily: 'var(--font-mono)' }}>{missingTotal}</span>
            </div>
          )}
          <div className="nd-stat">
            <ProgressBar
              value={progress.done}
              max={Math.max(progress.total, 1)}
              label={`${progress.label} (${progress.done}/${progress.total})`}
              showValue={false}
              tone={progress.total > 0 && progress.done === progress.total ? 'success' : 'brand'}
            />
          </div>
          <div className="nd-stat">
            <span className="nd-stat__label">Pickup date</span>
            <span className="nd-stat__value" style={{ fontSize: 15 }}>{pickupDateLabel}</span>
          </div>
        </div>

        {route.notes && (
          <Card title="Notes">
            <p style={{ margin: 0, color: 'var(--text-body)' }}>{route.notes}</p>
          </Card>
        )}

        <Card
          title="Special instructions"
          subtitle={
            instructionsLocked
              ? 'Locked: sign placement has already begun for this route'
              : 'For this route only: the operator sees them before they leave the depot'
          }
          action={
            <IconButton
              icon="chevron-down"
              label={instructionsExpanded ? 'Collapse special instructions' : 'Expand special instructions'}
              aria-expanded={instructionsExpanded}
              aria-controls="special-instructions-panel"
              className={styles.instructionsToggle}
              data-expanded={instructionsExpanded}
              onClick={() => setInstructionsExpanded((expanded) => !expanded)}
            />
          }
        >
          {instructionsExpanded && (
            <div className={styles.instructionsForm} id="special-instructions-panel">
              {instructionsError && <p className="nd-badge nd-badge--danger">{instructionsError}</p>}
              {instructionsSuccess && <p className="nd-badge nd-badge--success">{instructionsSuccess}</p>}

              {instructionEntries.length > 0 && (
                <div className={styles.instructionsFeed}>
                  {instructionEntries.map((entry, index) => {
                    const author = entry.authorSub ? customerUsersBySub.get(entry.authorSub) : undefined;
                    const authorName = author?.name || undefined;
                    return (
                      <div key={`${entry.createdAt}-${index}`} className={styles.instructionEntry}>
                        <div className={styles.instructionEntryHeader}>
                          {authorName && <Avatar name={authorName} size="sm" />}
                          <p className={styles.instructionText}>{entry.text}</p>
                        </div>
                        <span className={styles.instructionsMeta}>
                          {authorName ? `${authorName} · ` : entry.agentLabel ? `${entry.agentLabel} · ` : ''}
                          {entry.createdAt ? formatDate(entry.createdAt) : 'Before this feature tracked who/when'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {instructionsLocked ? (
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                  Instructions can no longer be added or changed, as sign placement has begun.
                </p>
              ) : (
                <>
                  {agentOptions.length > 0 && (
                    <Select
                      aria-label="Posting as"
                      value={instructionsAgent}
                      onChange={(e) => setInstructionsAgent(e.target.value)}
                      disabled={savingInstructions}
                      options={agentOptions.map((agent) => ({ value: agent, label: `Posting as ${agent}` }))}
                    />
                  )}

                  <Input
                    multiline
                    aria-label="Add an instruction for this route"
                    value={instructionsDraft}
                    onChange={(e) => setInstructionsDraft(e.target.value)}
                    placeholder="Anything specific for this run: access, extra signs, a street to avoid"
                    disabled={savingInstructions}
                  />

                  <div className={styles.instructionsActions}>
                    <Button
                      type="button"
                      loading={savingInstructions}
                      disabled={savingInstructions || !instructionsDraft.trim()}
                      onClick={() => void handleAddInstruction()}
                    >
                      {savingInstructions ? 'Adding…' : 'Add instruction'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </Card>

        <RouteRequestsSection routeId={route.id} />

        {showNextStop && nextStop && (
          <Card title="Next stop">
            <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--text-heading)' }}>
              {nextStop.formattedAddress || nextStop.address || 'No address available'}
            </p>
          </Card>
        )}

        {route.status === 'completed' && (
          <RouteFeedbackCard
            key={route.id}
            routeId={route.id}
            feedback={
              route.customerFeedbackTone
                ? { tone: route.customerFeedbackTone, note: route.customerFeedbackNote || '' }
                : null
            }
            onSaved={({ tone, note }) => patchRoute({ customerFeedbackTone: tone, customerFeedbackNote: note })}
          />
        )}

        <div className={styles.stopsAndMap}>
          {isNarrow ? (
            <>
              {mapCard}
              {stopsCard}
            </>
          ) : (
            <>
              {stopsCard}
              {mapCard}
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
