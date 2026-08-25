'use client';

import RouteStatusBadge from '@/app/components/RouteStatusBadge';
import type { Route } from '@/amplify/types';
import { formatRouteDate } from '@/lib/routeDetailHelpers';
import { formatEstimatedDurationMinutes } from '@/lib/routeListHelpers';
import styles from './RouteCard.module.css';

interface RouteCardProps {
  route: Route;
}

/**
 * RouteCard component
 * Displays a route in card format for list view
 */
export default function RouteCard({ route }: RouteCardProps) {
  const stopCount = route.stops?.length || 0;
  const createdDate = formatRouteDate(route.createdAt);
  const displayCode = route.routeCode || `${route.id.slice(0, 8)}...`;

  return (
    <a className={styles.card} href={`/customer/routes/${route.id}`}>
      {/* Header with ID and Status */}
      <div className={styles.header}>
        <h3 className={styles.title}>{displayCode}</h3>
        <RouteStatusBadge status={route.status} classes={styles} />
      </div>

      {/* Route Info */}
      <div className={styles.body}>
        <p className={styles.meta}>
          <strong>Stops:</strong> {stopCount}
        </p>

        {route.estimatedDurationMinutes && (
          <p className={styles.meta}>
            <strong>Duration:</strong> {formatEstimatedDurationMinutes(route.estimatedDurationMinutes)}
          </p>
        )}

        {route.createdAt && (
          <p className={styles.meta}>
            <strong>Created:</strong>{' '}
            {createdDate}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <p className={styles.footerLink}>
          View Details →
        </p>
      </div>
    </a>
  );
}
