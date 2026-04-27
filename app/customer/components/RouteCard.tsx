'use client';

import type { Route } from '@/amplify/types';
import styles from './RouteCard.module.css';

interface RouteCardProps {
  route: Route;
}

/**
 * RouteCard component
 * Displays a route in card format for list view
 */
export default function RouteCard({ route }: RouteCardProps) {
  const getStatusLabel = (status?: string | null) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'active':
        return 'In Progress';
      case 'planned':
        return 'Planned';
      case 'archived':
        return 'Archived';
      default:
        return 'Unknown';
    }
  };

  const stopCount = route.stops?.length || 0;

  const statusClass =
    { planned: styles.badgePlanned, active: styles.badgeActive, completed: styles.badgeCompleted, archived: styles.badgeArchived }[route.status ?? 'planned'] ?? styles.badgePlanned;

  return (
    <div className={styles.card}>
      {/* Header with ID and Status */}
      <div className={styles.header}>
        <h3 className={styles.title}>
          Route {route.id.slice(0, 8)}...
        </h3>
        <span className={`${styles.badge} ${statusClass}`}>
          {getStatusLabel(route.status)}
        </span>
      </div>

      {/* Route Info */}
      <div className={styles.body}>
        <p className={styles.meta}>
          <strong>Stops:</strong> {stopCount}
        </p>

        {route.estimatedDurationMinutes && (
          <p className={styles.meta}>
            <strong>Duration:</strong> {Math.floor(route.estimatedDurationMinutes / 60)}h{' '}
            {route.estimatedDurationMinutes % 60}m
          </p>
        )}

        {route.createdAt && (
          <p className={styles.meta}>
            <strong>Created:</strong>{' '}
            {new Date(route.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <p className={styles.footerLink}>
          View Details →
        </p>
      </div>
    </div>
  );
}
