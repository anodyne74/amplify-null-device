'use client';

import type { Stop } from '@/amplify/types';
import { Badge, type BadgeProps } from '@/app/components/ui/core/Badge';
import { displayNotes, stopProgress, type ExecutionPhase } from '@/lib/stopProgress';
import { stopProgressTone, type StopProgressTone } from '@/lib/stopStatusLabel';
import styles from './StopListItem.module.css';

interface StopListItemProps {
  stop: Stop;
  sequence: number;
  /** The phase the Customer is following the Route by (lib/customerRouteProgress.ts). */
  phase: ExecutionPhase;
}

const TONE_CIRCLE_CLASS: Record<StopProgressTone, string> = {
  awaiting: styles.circleAwaiting,
  placed: styles.circlePlaced,
  pickedUp: styles.circlePickedUp,
  skipped: styles.circleSkipped,
};

/** Placement/pickup status label + tone for a stop — the single source of
 * truth for how far along its own phase it is, read from the same Stop
 * Progress the operator's Placement/Pickup screens write. */
function getStopStatus(stop: Stop, phase: ExecutionPhase): { label: string; tone: BadgeProps['tone'] } {
  const { state } = stopProgress(stop)[phase];
  if (state === 'skipped') {
    return { label: phase === 'pickup' ? 'Pickup skipped' : 'Placement skipped', tone: 'danger' };
  }
  if (state === 'done') {
    return { label: phase === 'pickup' ? 'Picked up' : 'Placed', tone: 'success' };
  }
  return { label: phase === 'pickup' ? 'Awaiting pickup' : 'Awaiting placement', tone: 'warning' };
}

/**
 * StopListItem component
 * Displays a single delivery stop in a route
 */
export default function StopListItem({ stop, sequence, phase }: StopListItemProps) {
  const formatTime = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const circleClass = TONE_CIRCLE_CLASS[stopProgressTone(stop)];
  const operatorNotes = displayNotes(stop.notes);

  const status = getStopStatus(stop, phase);

  const progress = stopProgress(stop);
  const placementTime = progress.placement.state === 'done' ? progress.placement.at : null;
  const pickupTime = progress.pickup.state === 'done' ? progress.pickup.at : null;

  return (
    <div className={styles.card}>
      {/* Sequence Number */}
      <div className={`${styles.sequenceCircle} ${circleClass}`}>{sequence}</div>

      {/* Stop Details */}
      <div className={styles.body}>
        <h4 className={styles.stopTitle}>{stop.address}</h4>
        {operatorNotes && <p className={styles.notes}>&quot;{operatorNotes}&quot;</p>}
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
