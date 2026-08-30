import type { SignRunTrackState } from '@/lib/signRunPhase';
import styles from './PhaseTrackBar.module.css';

export interface PhaseTrackBarProps {
  track: SignRunTrackState[];
  caption: string;
}

/**
 * The 4-segment Driver Sign Run progress bar (completed indigo, current amber,
 * upcoming gray) with its caption underneath — shared by the Today-screen
 * SignRunRouteCard and every phase screen (Load, Placement, Pickup, Unload).
 */
export function PhaseTrackBar({ track, caption }: PhaseTrackBarProps) {
  return (
    <div className={styles.track}>
      <div className={styles.trackBar}>
        {track.map((state, i) => (
          <span key={i} className={`${styles.trackSegment} ${styles[`trackSegment_${state}`]}`} />
        ))}
      </div>
      <div className={styles.trackCaption}>{caption}</div>
    </div>
  );
}
