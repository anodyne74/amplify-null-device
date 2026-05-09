'use client';

import Link from 'next/link';
import type { Route } from '@/amplify/types';
import styles from './RouteListItem.module.css';

interface RouteListItemProps {
  route: Route;
}

/**
 * RouteListItem Component
 * Displays a single route in the list view
 */
export default function RouteListItem({ route }: RouteListItemProps) {
  const getStatusLabel = (status: string) => {
    return status.replace(/_/g, ' ').charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDuration = (minutes?: number | null): string => {
    if (!minutes) return 'N/A';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const statusClass =
    (({
      scheduled: styles.badgePlanned,
      in_progress: styles.badgeActive,
      completed: styles.badgeCompleted,
      cancelled: styles.badgeDanger,
      signs_placed: styles.badgeActive,
      signs_picked_up: styles.badgeActive,
      planned: styles.badgePlanned,
      archived: styles.badgeArchived,
    } as Record<string, string>)[route.status ?? '']) ?? styles.badgePlanned;

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
          <span className={`${styles.badge} ${statusClass}`}>
            {getStatusLabel(route.status || 'unknown')}
          </span>
        </div>

        {/* Date */}
        <div>
          <p className={styles.metaLabel}>Created</p>
          <p className={styles.metaValue}>
            {formatDate(route.createdAt)}
          </p>
        </div>

        {/* Duration */}
        <div>
          <p className={styles.metaLabel}>Duration</p>
          <p className={styles.metaValue}>
            {formatDuration(route.estimatedDurationMinutes as number | undefined)}
          </p>
        </div>
      </div>
    </Link>
  );
}
