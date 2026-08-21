'use client';

import { useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { getCustomerPortalContext, getRouteWithStops, updateRoute, updateRouteCustomerInstructions } from '@/lib/queries';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import RouteTimeline from '@/app/customer/components/RouteTimeline';
import StopListItem from '@/app/customer/components/StopListItem';
import { RouteStopsMap } from '@/app/operator/components/RouteStopsMap';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Input } from '@/app/components/ui/forms/Input';
import type { Route, Stop } from '@/amplify/types';
import { formatDurationHoursMinutes } from '@/lib/format';
import styles from './_RouteDetailContent.module.css';

interface RouteDetailContentProps {
  params: {
    id: string;
  };
}

/**
 * Customer Route Detail Page
 * Shows full route information with stops and timeline
 */
export default function RouteDetailContent({ params }: RouteDetailContentProps) {
  const { user } = useAuthenticator();
  const userId = user?.userId;
  const [route, setRoute] = useState<Route | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [instructionsDraft, setInstructionsDraft] = useState('');
  const [savingInstructions, setSavingInstructions] = useState(false);
  const [instructionsError, setInstructionsError] = useState<string | null>(null);
  const [instructionsSuccess, setInstructionsSuccess] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'good' | 'issue' | null>(null);
  const [feedbackNote, setFeedbackNote] = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id || !userId) return;
    let cancelled = false;

    async function fetchRoute() {
      setLoading(true);
      setError(null);

      try {
        const context = await getCustomerPortalContext(userId);
        const result = await getRouteWithStops(params.id);

        if (cancelled) return;

        if (result.errors && result.errors.length > 0) {
          setError('Failed to load route details');
        } else if (result.route) {
          const fetchedRoute = result.route as unknown as Route;
          if (!context.customerId || fetchedRoute.customerId !== context.customerId) {
            setError('You do not have permission to view this route');
          } else {
            const fetchedStops = [...((result.stops as unknown as Stop[]) ?? [])].sort(
              (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)
            );
            setStops(fetchedStops);
            setRoute({ ...fetchedRoute, stops: fetchedStops } as Route);
            setInstructionsDraft(fetchedRoute.customerInstructions || '');
            setFeedbackTone((fetchedRoute.customerFeedbackTone as 'good' | 'issue' | null) ?? null);
            setFeedbackNote(fetchedRoute.customerFeedbackNote || '');
          }
        } else {
          setError('Route not found');
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load route details');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchRoute();

    return () => {
      cancelled = true;
    };
  }, [params.id, userId]);

  const handleSaveInstructions = async () => {
    if (!route) return;
    setSavingInstructions(true);
    setInstructionsError(null);
    setInstructionsSuccess(null);

    const result = await updateRouteCustomerInstructions(route.id, instructionsDraft);

    if (result.errors && result.errors.length > 0) {
      setInstructionsError('Could not save your instructions.');
      setSavingInstructions(false);
      return;
    }

    setRoute({ ...route, customerInstructions: instructionsDraft, updatedAt: new Date().toISOString() });
    setInstructionsSuccess('Instructions saved.');
    setSavingInstructions(false);
  };

  const handleSendFeedback = async () => {
    if (!route || !feedbackTone) return;
    setSavingFeedback(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    const result = await updateRoute(route.id, {
      customerFeedbackTone: feedbackTone,
      customerFeedbackNote: feedbackNote,
    });

    if (result.errors && result.errors.length > 0) {
      setFeedbackError('Could not send your feedback.');
      setSavingFeedback(false);
      return;
    }

    setRoute({ ...route, customerFeedbackTone: feedbackTone, customerFeedbackNote: feedbackNote });
    setFeedbackSuccess('Feedback sent — thank you.');
    setSavingFeedback(false);
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

  const routeLabel = route.routeCode || `${route.id.slice(0, 8)}...`;
  const totalSigns = stops.reduce((sum, stop) => sum + (typeof stop.numberOfSigns === 'number' ? stop.numberOfSigns : 0), 0);
  const deliveryStops = stops.filter((stop) => stop.serviceType === 'delivery');
  const placedDeliveryStops = deliveryStops.filter((stop) => Boolean(stop.actualDepartureTime));
  const pickupDueLabel = route.pickupStartTime ? formatDate(route.pickupStartTime) : 'TBC';
  const nextStop = stops.find((stop) => !stop.actualDepartureTime) ?? stops[0] ?? null;
  const nextStopIndex = nextStop ? stops.findIndex((stop) => stop.id === nextStop.id) : -1;
  const upcomingStopIds =
    nextStopIndex >= 0
      ? stops
          .slice(nextStopIndex + 1)
          .filter((stop) => !stop.actualDepartureTime)
          .slice(0, 2)
          .map((stop) => stop.id)
      : [];

  return (
    <ProtectedRoute>
      <div className={styles.page}>
        <Breadcrumbs
          items={[
            { label: 'Routes', href: '/customer/routes' },
            { label: `Route ${routeLabel}` },
          ]}
        />

        <h1 className={styles.pageTitle}>Route {routeLabel}</h1>

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
            <span className="nd-stat__label">Estimated duration</span>
            <span className="nd-stat__value" style={{ fontSize: 20, fontFamily: 'var(--font-mono)' }}>
              {formatDurationHoursMinutes(route.estimatedDurationMinutes as number | undefined)}
            </span>
          </div>

          {route.actualDurationMinutes && (
            <div className="nd-stat">
              <span className="nd-stat__label">Actual duration</span>
              <span className="nd-stat__value" style={{ fontSize: 20, fontFamily: 'var(--font-mono)' }}>
                {formatDurationHoursMinutes(route.actualDurationMinutes as number | undefined)}
              </span>
            </div>
          )}

          <div className="nd-stat">
            <span className="nd-stat__label">Created</span>
            <span className="nd-stat__value" style={{ fontSize: 15 }}>
              {formatDate(route.createdAt)}
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
          <div className="nd-stat">
            <span className="nd-stat__label">Placed</span>
            <span className="nd-stat__value" style={{ fontSize: 20, fontFamily: 'var(--font-mono)' }}>
              {placedDeliveryStops.length}/{deliveryStops.length}
            </span>
          </div>
          <div className="nd-stat">
            <span className="nd-stat__label">Pickup due</span>
            <span className="nd-stat__value" style={{ fontSize: 15 }}>{pickupDueLabel}</span>
          </div>
        </div>

        {route.notes && (
          <Card title="Notes">
            <p style={{ margin: 0, color: 'var(--text-body)' }}>{route.notes}</p>
          </Card>
        )}

        <Card title="Special instructions" subtitle="For this route only — the operator sees them before they leave the depot">
          <div className={styles.instructionsForm}>
            {instructionsError && <p className="nd-badge nd-badge--danger">{instructionsError}</p>}
            {instructionsSuccess && <p className="nd-badge nd-badge--success">{instructionsSuccess}</p>}

            <Input
              multiline
              aria-label="Special instructions for this route"
              value={instructionsDraft}
              onChange={(e) => setInstructionsDraft(e.target.value)}
              placeholder="Anything specific for this run — access, extra signs, a street to avoid"
              disabled={savingInstructions}
            />

            <div className={styles.instructionsActions}>
              <Button
                type="button"
                loading={savingInstructions}
                disabled={savingInstructions}
                onClick={() => void handleSaveInstructions()}
              >
                {savingInstructions ? 'Saving…' : 'Save instructions'}
              </Button>
              {route.customerInstructions && (
                <span className={styles.instructionsMeta}>Last updated {formatDate(route.updatedAt)}</span>
              )}
            </div>
          </div>
        </Card>

        {nextStop && (
          <Card title="Next stop">
            <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--text-heading)' }}>
              {`Stop ${nextStop.sequence ?? nextStopIndex + 1}`}
            </p>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>
              {nextStop.formattedAddress || nextStop.address || 'No address available'}
            </p>
          </Card>
        )}

        {route.status === 'completed' && (
          <Card title="How did this route go?" subtitle="Only asked once the route is complete">
            <div className={styles.instructionsForm}>
              {feedbackError && <p className="nd-badge nd-badge--danger">{feedbackError}</p>}
              {feedbackSuccess && <p className="nd-badge nd-badge--success">{feedbackSuccess}</p>}

              <div className={styles.instructionsActions}>
                <Button
                  type="button"
                  variant={feedbackTone === 'good' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setFeedbackTone('good')}
                  disabled={savingFeedback}
                >
                  All good
                </Button>
                <Button
                  type="button"
                  variant={feedbackTone === 'issue' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setFeedbackTone('issue')}
                  disabled={savingFeedback}
                >
                  Something was off
                </Button>
              </div>

              <Input
                multiline
                aria-label="Feedback note for this route"
                value={feedbackNote}
                onChange={(e) => setFeedbackNote(e.target.value)}
                placeholder="Two signs at 5 Kent St were facing the wrong way"
                disabled={savingFeedback}
              />

              <Button
                type="button"
                size="sm"
                loading={savingFeedback}
                disabled={savingFeedback || !feedbackTone}
                onClick={() => void handleSendFeedback()}
              >
                {savingFeedback ? 'Sending…' : 'Send feedback'}
              </Button>
            </div>
          </Card>
        )}

        <div className={styles.stopsAndMap}>
          <Card title={`Stops (${stops.length})`} subtitle="Tap a stop to highlight it on the map" padded={false}>
            {stops.length === 0 ? (
              <p className={styles.noStopsText}>No stops scheduled for this route</p>
            ) : (
              <div className={styles.stopsList}>
                {stops.map((stop, index) => (
                  <StopListItem key={stop.id} stop={stop} sequence={index + 1} />
                ))}
              </div>
            )}
          </Card>

          <Card title="Route map" subtitle="Numbered stops in service order">
            <div className={styles.mapShell}>
              <RouteStopsMap
                stops={stops}
                activeStopId={nextStop?.id ?? null}
                upcomingStopIds={upcomingStopIds}
                mapTheme="dark"
                presentation="field"
              />
            </div>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  );
}
