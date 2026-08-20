'use client';

import type { Stop } from '@/amplify/types';
import { Badge, type BadgeProps } from '@/app/components/ui/core/Badge';
import styles from './StopListItem.module.css';

interface StopListItemProps {
  stop: Stop;
  sequence: number;
}

const SERVICE_TYPE_CIRCLE_CLASS: Record<string, string> = {
  delivery: styles.circleDelivery,
  pickup: styles.circlePickup,
  inspection: styles.circleInspection,
};

const SERVICE_TYPE_TONE: Record<string, BadgeProps['tone']> = {
  delivery: 'brand',
  pickup: 'warning',
  inspection: 'neutral',
};

/**
 * StopListItem component
 * Displays a single delivery stop in a route
 */
export default function StopListItem({ stop, sequence }: StopListItemProps) {
  const formatTime = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const serviceTypeKey = (stop.serviceType as string | undefined) ?? 'delivery';
  const circleClass = SERVICE_TYPE_CIRCLE_CLASS[serviceTypeKey] ?? styles.circleDelivery;

  return (
    <div className={styles.card}>
      {/* Sequence Number */}
      <div className={`${styles.sequenceCircle} ${circleClass}`}>{sequence}</div>

      {/* Stop Details */}
      <div className={styles.body}>
        <h4 className={styles.stopTitle}>Stop {sequence}</h4>
        <p className={styles.address}>{stop.address}</p>
        {stop.notes && <p className={styles.notes}>&quot;{stop.notes}&quot;</p>}
      </div>

      {/* Status and Time */}
      <div className={styles.metaColumn}>
        <Badge tone={SERVICE_TYPE_TONE[serviceTypeKey] ?? 'neutral'} size="sm">
          {serviceTypeKey}
        </Badge>

        {stop.actualDepartureTime && <p className={styles.departureTime}>{formatTime(stop.actualDepartureTime)}</p>}

        {stop.estimatedArrivalTime && !stop.actualDepartureTime && (
          <p className={styles.etaTime}>ETA: {formatTime(stop.estimatedArrivalTime)}</p>
        )}
      </div>
    </div>
  );
}
