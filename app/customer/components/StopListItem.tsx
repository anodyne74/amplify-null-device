'use client';

import type { Stop } from '@/amplify/types';
import { Badge, type BadgeProps } from '@/app/components/ui/core/Badge';
import {
  getDisplayNotes,
  getMarkerTimestamp,
  isStopCompletedForPhase,
  isStopSkippedForPhase,
  PICKUP_DONE_MARKER,
  PLACEMENT_DONE_MARKER,
  type ExecutionPhase,
} from '@/lib/stopExecutionMarkers';
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

/** Placement/pickup status label + tone for a stop — the single source of
 * truth for how far along its own phase it is, reusing the same markers the
 * operator's Placement/Pickup screens write. Inspection stops aren't tracked
 * through the placement/pickup lifecycle, so they keep a static label. */
function getStopStatus(stop: Stop, phase: ExecutionPhase): { label: string; tone: BadgeProps['tone'] } {
  if (isStopSkippedForPhase(stop, phase)) {
    return { label: phase === 'pickup' ? 'Pickup skipped' : 'Placement skipped', tone: 'danger' };
  }
  if (isStopCompletedForPhase(stop, phase)) {
    return { label: phase === 'pickup' ? 'Picked up' : 'Placed', tone: 'success' };
  }
  return { label: phase === 'pickup' ? 'Awaiting pickup' : 'Awaiting placement', tone: 'warning' };
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
  const circleClass = SERVICE_TYPE_CIRCLE_CLASS[serviceTypeKey] ?? styles.circleDelivery;
  const displayNotes = getDisplayNotes(stop.notes);

  const status =
    serviceTypeKey === 'inspection'
      ? { label: 'Inspection', tone: 'neutral' as BadgeProps['tone'] }
      : getStopStatus(stop, serviceTypeKey === 'pickup' ? 'pickup' : 'placement');

  const placementTime = getMarkerTimestamp(stop.notes, PLACEMENT_DONE_MARKER);
  const pickupTime = getMarkerTimestamp(stop.notes, PICKUP_DONE_MARKER);

  return (
    <div className={styles.card}>
      {/* Sequence Number */}
      <div className={`${styles.sequenceCircle} ${circleClass}`}>{sequence}</div>

      {/* Stop Details */}
      <div className={styles.body}>
        <h4 className={styles.stopTitle}>{stop.address}</h4>
        {displayNotes && <p className={styles.notes}>&quot;{displayNotes}&quot;</p>}
      </div>

      {/* Status and Time */}
      <div className={styles.metaColumn}>
        <Badge tone={status.tone} size="sm">
          {status.label}
        </Badge>

        {placementTime && <p className={styles.departureTime}>Placed: {formatTime(placementTime)}</p>}
        {pickupTime && <p className={styles.departureTime}>Picked up: {formatTime(pickupTime)}</p>}

        {!placementTime && !pickupTime && stop.estimatedArrivalTime && (
          <p className={styles.etaTime}>ETA: {formatTime(stop.estimatedArrivalTime)}</p>
        )}
      </div>
    </div>
  );
}
