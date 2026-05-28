'use client';

import Link from 'next/link';
import RouteStatusBadge from '@/app/components/RouteStatusBadge';
import type { Route } from '@/amplify/types';
import { formatRouteDate } from '@/lib/routeDetailHelpers';
import { formatEstimatedDurationMinutes } from '@/lib/routeListHelpers';
import styles from './RouteListItem.module.css';

interface RouteListItemProps {
  route: Route;
}

/**
 * RouteListItem Component
 * Displays a single route in the list view
 */
export default function RouteListItem({ route }: RouteListItemProps) {
  const createdDate = formatRouteDate(route.createdAt);

  return (
    <Link href={`/customer/routes/${route.id}`}>
      <div className={styles.item}>
        {/* Route ID and Notes */}
        <div>
          <p className={styles.routeTitle}>
            Route {route.id.slice(0, 8)}...
          </p>
          <p className={styles.routeNotes}>
            {route.notes || 'No notes'}
          </p>
        </div>

        {/* Status Badge */}
        <div>
          <RouteStatusBadge status={route.status} classes={styles} />
        </div>

        {/* Date */}
        <div>
          <p className={styles.metaLabel}>Created</p>
          <p className={styles.metaValue}>
            {createdDate === '—' ? 'N/A' : createdDate}
          </p>
        </div>

        {/* Duration */}
        <div>
          <p className={styles.metaLabel}>Duration</p>
          <p className={styles.metaValue}>
            {formatEstimatedDurationMinutes(route.estimatedDurationMinutes as number | undefined)}
          </p>
        </div>
      </div>
    </Link>
  );
}
