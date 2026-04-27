'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { getRouteDetail } from '@/lib/queries/GetRouteDetail';
import { verifyCustomerAccess, getCurrentCustomerId } from '@/app/auth/session';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import RouteTimeline from '@/app/customer/components/RouteTimeline';
import StopListItem from '@/app/customer/components/StopListItem';
import type { Route } from '@/amplify/types';
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
  const customerId = user ? getCurrentCustomerId(user) : undefined;
  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id) return;

    async function fetchRoute() {
      setLoading(true);
      const result = await getRouteDetail(params.id);

      if (result.errors) {
        setError('Failed to load route details');
      } else if (result.data) {
        // Verify customer can access this route
        if (customerId && !verifyCustomerAccess(user, result.data.customerId)) {
          setError('You do not have permission to view this route');
        } else {
          setRoute(result.data as unknown as Route);
        }
      } else {
        setError('Route not found');
      }

      setLoading(false);
    }

    fetchRoute();
  }, [params.id, customerId, user]);

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

  const formatDuration = (minutes?: number | null): string => {
    if (!minutes) return 'N/A';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  return (
    <ProtectedRoute>
      <div>
        <Link href="/customer/routes" className={styles.backLink}>
          ← Back to Routes
        </Link>

        <h1 className={styles.pageTitle}>Route {route.id.slice(0, 8)}...</h1>

        {/* Status and Timeline */}
        <div className={styles.timelineWrapper}>
          <RouteTimeline route={route} />
        </div>

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
              {formatDuration(route.estimatedDurationMinutes as number | undefined)}
            </p>
          </div>

          {route.actualDurationMinutes && (
            <div className={styles.detailCard}>
              <p className={styles.detailLabel}>
                Actual Duration
              </p>
              <p className={styles.detailValue}>
                {formatDuration(route.actualDurationMinutes as number | undefined)}
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
          <h3>Delivery Stops ({route.stops?.length || 0})</h3>

          {(!route.stops || route.stops.length === 0) ? (
            <p className={styles.noStopsText}>No stops scheduled for this route</p>
          ) : (
            <div className={styles.stopsList}>
              {route.stops.map((stop, index) => (
                <StopListItem key={stop.id} stop={stop} sequence={index + 1} />
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
