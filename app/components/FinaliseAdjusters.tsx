'use client';

import type { RouteExecutionPhase } from '@/amplify/types';
import { MIN_BILLED_MINUTES } from '@/lib/billedTime';
import { formatDuration } from '@/lib/format';
import type { FinaliseAdjusters as Adjusters } from '@/lib/useFinaliseAdjusters';
import styles from './FinaliseAdjusters.module.css';

const PHASE_ROWS: Array<{ key: RouteExecutionPhase; label: string }> = [
  { key: 'load', label: 'Load' },
  { key: 'placement', label: 'Placement' },
  { key: 'pickup', label: 'Pickup' },
  { key: 'unload', label: 'Unload' },
];

/**
 * The distance and billed-time adjusters and the Total charged panel, shared by
 * the operator Finalise screen and the administrator Finalise panel (#408).
 * State lives in useFinaliseAdjusters; each screen confirms in its own way.
 */
export function FinaliseAdjusters({ adjusters }: { adjusters: Adjusters }) {
  const { measured, billedMinutes, bumpBilled, distanceInput, setDistanceInput, distanceError, bumpKm, billTotal, billAligned, nextQuarterHour, roundUp } =
    adjusters;

  return (
    <>
      <div className={styles.adjustList}>
        <div className={styles.adjustRow}>
          <div>
            <span className={styles.adjustLabel}>Distance</span>
            <span className={styles.adjustMeasured}>Not tracked, enter manually</span>
          </div>
          <button type="button" className={styles.stepperButtonMinus} onClick={() => bumpKm(-0.5)} aria-label="Decrease distance">
            −
          </button>
          <span className={styles.distanceField}>
            <input
              type="text"
              inputMode="decimal"
              className={styles.distanceInput}
              value={distanceInput}
              onChange={(event) => setDistanceInput(event.target.value)}
              aria-label="Distance (km)"
              aria-invalid={distanceError ? true : undefined}
              aria-describedby={distanceError ? 'finalise-distance-error' : undefined}
            />
            <span className={styles.distanceUnit}>km</span>
          </span>
          <button type="button" className={styles.stepperButtonPlus} onClick={() => bumpKm(0.5)} aria-label="Increase distance">
            +
          </button>
          {distanceError && (
            <span id="finalise-distance-error" className={styles.distanceError} role="alert">
              {distanceError}
            </span>
          )}
        </div>

        {PHASE_ROWS.map(({ key, label }) => {
          const measuredForPhase = measured?.[key] ?? 0;
          const floor = MIN_BILLED_MINUTES[key];
          const measuredLabel =
            measuredForPhase > 0
              ? `Recorded ${formatDuration(measuredForPhase)}${floor > measuredForPhase ? ` · ${floor} min minimum` : ''}`
              : 'Not recorded';
          return (
            <div className={styles.adjustRow} key={key}>
              <div>
                <span className={styles.adjustLabel}>{label}</span>
                <span className={styles.adjustMeasured}>{measuredLabel}</span>
              </div>
              <button
                type="button"
                className={styles.stepperButtonMinus}
                onClick={() => bumpBilled(key, -5)}
                aria-label={`Decrease ${label} minutes`}
              >
                −
              </button>
              <span className={styles.adjustValue}>{formatDuration(billedMinutes?.[key] ?? 0)}</span>
              <button
                type="button"
                className={styles.stepperButtonPlus}
                onClick={() => bumpBilled(key, 5)}
                aria-label={`Increase ${label} minutes`}
              >
                +
              </button>
            </div>
          );
        })}
      </div>

      <div className={billAligned ? `${styles.billPanel} ${styles.billPanelValid}` : `${styles.billPanel} ${styles.billPanelWarning}`}>
        <div className={styles.billTotalRow}>
          <span>Total charged</span>
          <span className={styles.billTotalValue}>{formatDuration(billTotal)}</span>
        </div>
        <div className={styles.billCueRow}>
          <span className={styles.billCueDot} />
          <span className={styles.billCueText}>
            {billAligned
              ? 'Lands on a 15 min increment'
              : `${formatDuration(billTotal)} is not a 15 min increment, so the office can't invoice it`}
          </span>
        </div>
        {!billAligned && (
          <button type="button" className={styles.roundUpButton} onClick={roundUp}>
            Round up to {formatDuration(nextQuarterHour)}
          </button>
        )}
      </div>
    </>
  );
}
