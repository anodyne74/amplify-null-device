'use client';

import type { Route } from '@/amplify/types';
import { Icon } from '@/app/components/ui/core/Icon';
import { getRoutePhaseKey, ROUTE_PHASE_KEYS, ROUTE_PHASE_LABELS, type RoutePhaseKey } from '@/lib/signRunPhase';
import styles from './RouteTimeline.module.css';

interface RouteTimelineProps {
  route: Route;
}

// Best-available timestamp for when each of the 6 phases was reached. Older
// routes predate loadConfirmedAt/unloadConfirmedAt, so those two phases fall
// back to the nearest field that was already being written at the time.
const PHASE_TIMESTAMP: Record<RoutePhaseKey, (route: Route) => string | null | undefined> = {
  planned: (route) => route.createdAt,
  signs_collected: (route) => route.loadConfirmedAt ?? route.actualStartTime,
  signs_placed: (route) => route.placementEndTime,
  signs_picked_up: (route) => route.pickupEndTime ?? route.actualEndTime,
  signs_returned: (route) => route.unloadConfirmedAt,
  completed: (route) => route.updatedAt,
};

/**
 * RouteTimeline component
 * Displays the route's progression through the 6 named phases.
 */
export default function RouteTimeline({ route }: RouteTimelineProps) {
  const statuses = ROUTE_PHASE_KEYS.map((key) => ({
    id: key,
    label: ROUTE_PHASE_LABELS[key],
    timestamp: PHASE_TIMESTAMP[key](route),
  }));

  const currentStatusIndex = ROUTE_PHASE_KEYS.indexOf(getRoutePhaseKey(route));

  return (
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
              {isCompleted ? <Icon name="check" size={14} /> : index + 1}
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
  );
}
