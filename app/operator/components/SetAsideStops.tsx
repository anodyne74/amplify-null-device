'use client';

import { getPrimaryAddressLine } from '@/lib/routeDetailHelpers';
import styles from './SetAsideStops.module.css';

export interface SetAsideStop {
  id: string;
  address: string;
  reason: string | null;
}

interface SetAsideStopsProps {
  title: string;
  stops: SetAsideStop[];
  actionLabel: string;
  onAction: (stopId: string) => void;
}

/** The Stops the operator couldn't do on this screen -- removed at the door
 *  in Placement, Couldn't Collect in Pickup -- each with a way back while the
 *  phase is still open. */
export function SetAsideStops({ title, stops, actionLabel, onAction }: SetAsideStopsProps) {
  if (stops.length === 0) return null;
  return (
    <section className={styles.section} aria-label={title}>
      <div className={styles.heading}>
        {title} · {stops.length}
      </div>
      <ul className={styles.list}>
        {stops.map((stop) => (
          <li key={stop.id} className={styles.row}>
            <span className={styles.body}>
              <span className={styles.address}>{getPrimaryAddressLine(stop.address)}</span>
              {stop.reason && <span className={styles.reason}>{stop.reason}</span>}
            </span>
            <button type="button" className={styles.action} onClick={() => onAction(stop.id)}>
              {actionLabel}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
