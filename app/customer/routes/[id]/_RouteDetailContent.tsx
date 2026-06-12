'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { getCustomerPortalContext, getRouteWithStops } from '@/lib/queries';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import RouteTimeline from '@/app/customer/components/RouteTimeline';
import StopListItem from '@/app/customer/components/StopListItem';
import { RouteStopsMap } from '@/app/operator/components/RouteStopsMap';
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

  if (loading) {
    return <LoadingSpinner message="Loading route details..." />;
  }

  if (error || !route) {
    return (
      <ProtectedRoute>
        <div className={styles.errorPage}>
          <Link href="/customer/routes" className={styles.backLink}>
            ← Back to Routes
          </Link>
          <div className={styles.errorBanner}>
            {error || 'Route not found'}
          </div>
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
      <div>
        <Link href="/customer/routes" className={styles.backLink}>
          ← Back to Routes
        </Link>

        <h1 className={styles.pageTitle}>Route {routeLabel}</h1>

        {/* Status and Timeline */}
        <div className={styles.timelineWrapper}>
          <RouteTimeline route={route} />
        </div>

        <section className={styles.trackerPanel} aria-label="Route map and next stop">
          <div className={styles.mapShell}>
            <RouteStopsMap
              stops={stops}
              activeStopId={nextStop?.id ?? null}
              upcomingStopIds={upcomingStopIds}
              mapTheme="dark"
              presentation="field"
            />
          </div>
          <div className={styles.nextStopPanel}>
            <p className={styles.detailLabel}>Next Stop</p>
            <p className={styles.nextStopTitle}>
              {nextStop ? `Stop ${nextStop.sequence ?? nextStopIndex + 1}` : 'No stop scheduled'}
            </p>
            <p className={styles.nextStopAddress}>
              {nextStop?.formattedAddress || nextStop?.address || 'No address available'}
            </p>
          </div>
        </section>

        {/* Route Details Grid */}
        <div className={styles.detailsGrid}>
          <div className={styles.detailCard}>
            <p className={styles.detailLabel}>
              Status
            </p>
            <p className={styles.detailValue}>
              {(route.status || 'unknown').replace(/_/g, ' ')}
            </p>
          </div>

          <div className={styles.detailCard}>
            <p className={styles.detailLabel}>
              Estimated Duration
            </p>
            <p className={styles.detailValue}>
              {formatDurationHoursMinutes(route.estimatedDurationMinutes as number | undefined)}
            </p>
          </div>

          {route.actualDurationMinutes && (
            <div className={styles.detailCard}>
              <p className={styles.detailLabel}>
                Actual Duration
              </p>
              <p className={styles.detailValue}>
                {formatDurationHoursMinutes(route.actualDurationMinutes as number | undefined)}
              </p>
            </div>
          )}

          <div className={styles.detailCard}>
            <p className={styles.detailLabel}>
              Created
            </p>
            <p className={styles.detailValueSmall}>
              {formatDate(route.createdAt)}
            </p>
          </div>
        </div>

        {/* Notes */}
        {route.notes && (
          <div className={styles.notesSection}>
            <h3>Notes</h3>
            <p className={styles.notesText}>{route.notes}</p>
          </div>
        )}

        {/* Stops */}
        <div>
          <h3>Delivery Stops ({stops.length})</h3>

          {stops.length === 0 ? (
            <p className={styles.noStopsText}>No stops scheduled for this route</p>
          ) : (
            <div className={styles.stopsList}>
              {stops.map((stop, index) => (
                <StopListItem key={stop.id} stop={stop} sequence={index + 1} />
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
