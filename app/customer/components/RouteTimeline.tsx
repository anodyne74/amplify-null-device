'use client';

import type { Route } from '@/amplify/types';
import styles from './RouteTimeline.module.css';

interface RouteTimelineProps {
  route: Route;
}

/**
 * RouteTimeline component
 * Displays the status progression timeline of a route
 */
export default function RouteTimeline({ route }: RouteTimelineProps) {
  const statuses = [
    { id: 'planned', label: 'Planned', timestamp: route.createdAt },
    { id: 'signs_placed', label: 'Signs Placed', timestamp: route.actualStartTime },
    { id: 'signs_picked_up', label: 'Signs Picked Up', timestamp: route.actualEndTime },
    { id: 'completed', label: 'Completed', timestamp: route.actualEndTime },
  ];

  const currentStatusIndex =
    route.status === 'completed'
      ? 3
      : route.status === 'signs_picked_up'
        ? 2
        : route.status === 'signs_placed'
          ? 1
          : 0;

  return (
    <div className={styles.container}>
      <h3 className={styles.heading}>
        Route Status
      </h3>

      <div className={styles.steps}>
        {statuses.map((status, index) => {
          const isActive = index === currentStatusIndex;
          const isCompleted = index < currentStatusIndex;

          return (
            <div key={status.id} className={styles.step}>
              {/* Status Circle */}
              <div
                className={`${styles.circle} ${isActive ? styles.circleActive : ''} ${isCompleted ? styles.circleCompleted : ''}`}
              >
                {isCompleted ? '✓' : isActive ? '●' : index + 1}
              </div>

              {/* Status Label */}
              <p className={`${styles.stepLabel} ${isActive ? styles.stepLabelActive : ''}`}>
                {status.label}
              </p>

              {/* Timestamp */}
              {status.timestamp && (
                <p className={styles.stepTimestamp}>
                  {new Date(status.timestamp).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              )}

              {/* Connector Line */}
              {index < statuses.length - 1 && (
                <div className={`${styles.connector} ${isCompleted ? styles.connectorCompleted : ''}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
