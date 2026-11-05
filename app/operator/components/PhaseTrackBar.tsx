import type { SignRunTrackState } from '@/lib/signRunPhase';
import styles from './PhaseTrackBar.module.css';

export interface PhaseTrackBarProps {
  track: SignRunTrackState[];
  caption: string;
}

// The segments' names, in order: the work tracker is the four phases and the completed
// segment, and the overview tracker (a Route's detail page) puts Planned in front.
const WORK_LABELS = ['Load', 'Placement', 'Pickup', 'Unload', 'Completed'];
const OVERVIEW_LABELS = ['Planned', ...WORK_LABELS];

function segmentName(length: number, index: number): string {
  const names = length === WORK_LABELS.length ? WORK_LABELS : length === OVERVIEW_LABELS.length ? OVERVIEW_LABELS : null;
  return names ? names[index] : `Step ${index + 1} of ${length}`;
}

/**
 * The 4-segment Driver Sign Run progress bar (completed indigo, current amber,
 * upcoming gray) with its caption underneath — shared by the Today-screen
 * SignRunRouteCard and every phase screen (Load, Placement, Pickup, Unload).
 */
export function PhaseTrackBar({ track, caption }: PhaseTrackBarProps) {
  return (
    <div className={styles.track}>
      <div className={styles.trackBar} role="list" aria-label="Sign Run progress">
        {track.map((state, i) => (
          <span
            key={i}
            role="listitem"
            aria-label={`${segmentName(track.length, i)}, ${state}`}
            aria-current={state === 'current' ? 'step' : undefined}
            className={`${styles.trackSegment} ${styles[`trackSegment_${state}`]}`}
          />
        ))}
      </div>
      <div className={styles.trackCaption}>{caption}</div>
    </div>
  );
}
