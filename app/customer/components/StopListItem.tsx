'use client';

import type { Stop } from '@/amplify/types';
import styles from './StopListItem.module.css';

interface StopListItemProps {
  stop: Stop;
  sequence: number;
}

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
  const cardClass = { delivery: styles.cardDelivery, pickup: styles.cardPickup, inspection: styles.cardInspection }[serviceTypeKey] ?? '';
  const circleClass = { delivery: styles.circleDelivery, pickup: styles.circlePickup, inspection: styles.circleInspection }[serviceTypeKey] ?? '';
  const labelClass = { delivery: styles.labelDelivery, pickup: styles.labelPickup, inspection: styles.labelInspection }[serviceTypeKey] ?? '';

  return (
    <div className={`${styles.card} ${cardClass}`}>
      {/* Sequence Number */}
      <div className={`${styles.sequenceCircle} ${circleClass}`}>
        {sequence}
      </div>

      {/* Stop Details */}
      <div>
        <h4 className={styles.stopTitle}>
          Stop {sequence}
        </h4>

        <p className={styles.address}>
          {stop.address}
        </p>

        {stop.notes && (
          <p className={styles.notes}>
            "{stop.notes}"
          </p>
        )}
      </div>

      {/* Status and Time */}
      <div className={styles.metaColumn}>
        <p className={`${styles.serviceLabel} ${labelClass}`}>
          {(stop.serviceType || 'delivery').replace(/_/g, ' ')}
        </p>

        {stop.actualDepartureTime && (
          <p className={styles.departureTime}>
            {formatTime(stop.actualDepartureTime)}
          </p>
        )}

        {stop.estimatedArrivalTime && !stop.actualDepartureTime && (
          <p className={styles.etaTime}>
            ETA: {formatTime(stop.estimatedArrivalTime)}
          </p>
        )}
      </div>
    </div>
  );
}
