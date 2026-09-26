'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import { PhaseTrackBar } from '@/app/operator/components/PhaseTrackBar';
import { useSignRunPhaseScreen } from '@/lib/useSignRunPhaseScreen';
import { reconcileSignRun } from '@/lib/signRunReconciliation';
import { runSignRunTransition } from '@/lib/signRunTransitions';
import {
  MIN_BILLED_MINUTES,
  measuredPhaseMinutes,
  defaultBilledMinutes,
  sumBilledMinutes,
  formatDuration,
} from '@/lib/signRunBilling';
import type { RouteExecutionPhase } from '@/amplify/types';
import { NoRouteSelected, PhaseNotReady } from '../PhaseNotReady';
import shellStyles from '../signRunShell.module.css';
import styles from './page.module.css';

const PHASE_ROWS: Array<{ key: RouteExecutionPhase; label: string }> = [
  { key: 'load', label: 'Load' },
  { key: 'placement', label: 'Placement' },
  { key: 'pickup', label: 'Pickup' },
  { key: 'unload', label: 'Unload' },
];

export default function OperatorFinalisePage() {
  const router = useRouter();
  const {
    routeId,
    route,
    stops,
    loading,
    phaseInfo,
    isOnPhase: isFinaliseScreen,
  } = useSignRunPhaseScreen({ phaseIdx: 4 });
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billedOverride, setBilledOverride] = useState<Partial<Record<RouteExecutionPhase, number>>>({});
  const [kmOverride, setKmOverride] = useState<number | null>(null);

  const summary = useMemo(() => (route ? reconcileSignRun(route, stops) : null), [route, stops]);
  const measured = useMemo(() => (route ? measuredPhaseMinutes(route) : null), [route]);

  const defaults = useMemo(() => {
    if (!route || !measured) return null;
    return {
      load: route.billedLoadMinutes ?? defaultBilledMinutes('load', measured.load),
      placement: route.billedPlacementMinutes ?? defaultBilledMinutes('placement', measured.placement),
      pickup: route.billedPickupMinutes ?? defaultBilledMinutes('pickup', measured.pickup),
      unload: route.billedUnloadMinutes ?? defaultBilledMinutes('unload', measured.unload),
    };
  }, [route, measured]);

  const billedMinutes = defaults ? { ...defaults, ...billedOverride } : null;
  const kmAdj = kmOverride ?? route?.overrideDistanceKm ?? 0;
  // Cumulative duration of the completed phases, not raw wall-clock start-to-end —
  // a phase with no recorded times (e.g. pickup/unload never actioned) contributes 0.
  const duration = measured ? sumBilledMinutes(measured) : 0;

  const bumpBilled = (phase: RouteExecutionPhase, step: number) => {
    if (!billedMinutes) return;
    const next = Math.max(MIN_BILLED_MINUTES[phase], Math.min(600, billedMinutes[phase] + step));
    setBilledOverride((prev) => ({ ...prev, [phase]: next }));
  };

  const bumpKm = (step: number) => {
    setKmOverride(Math.max(0, kmAdj + step));
  };

  const billTotal = billedMinutes ? sumBilledMinutes(billedMinutes) : 0;
  const billAligned = billTotal % 15 === 0;
  const nextQuarterHour = Math.ceil(billTotal / 15) * 15;

  const handleRoundUp = () => {
    bumpBilled('unload', nextQuarterHour - billTotal);
  };

  const handleConfirm = async () => {
    if (!route || !billedMinutes || !billAligned) return;
    setConfirming(true);
    setError(null);

    const result = await runSignRunTransition(route, { type: 'finalise', billedMinutes, distanceKm: kmAdj });

    if ('error' in result) {
      setError(result.error);
      setConfirming(false);
      return;
    }

    router.push('/operator/dashboard');
  };

  if (!routeId) {
    return <NoRouteSelected />;
  }

  if (loading) return <LoadingSpinner message="Loading route..." />;

  if (!isFinaliseScreen || !route || !phaseInfo) {
    return (
      <PhaseNotReady
        phaseLabel="Finalise"
        message={route ? 'This route is not ready to finalise yet.' : 'Route not found.'}
      />
    );
  }

  return (
    <div className={shellStyles.page}>
      <Breadcrumbs
        items={[
          { label: 'Today', href: '/operator/dashboard' },
          { label: `${route.routeCode || route.id.slice(0, 8)} · Finalise` },
        ]}
      />

      {error && <div className={shellStyles.errorBanner}>{error}</div>}

      <div>
        <div className={shellStyles.kickerRow}>
          <span className={shellStyles.kicker}>{phaseInfo.phaseKicker} · {route.routeCode || route.id.slice(0, 8)}</span>
        </div>
        <h2 className={shellStyles.title}>Finalise route</h2>
        <p className={shellStyles.subtitle}>
          Adjust each phase in 5 min steps and correct the tracked distance in 0.5 km steps. Load and unload are
          charged at a 15 min minimum, and the total has to land on a 15 min increment.
        </p>
      </div>

      <PhaseTrackBar track={phaseInfo.track} caption={phaseInfo.phaseNumberLabel} />

      <div className={shellStyles.statsGrid}>
        <div className={shellStyles.statCell}>
          <span className={shellStyles.statLabel}>Stops completed</span>
          <span className={shellStyles.statValue}>
            {summary!.doneCount} / {stops.length}
          </span>
        </div>
        <div className={shellStyles.statCell}>
          <span className={shellStyles.statLabel}>Signs collected</span>
          <span className={shellStyles.statValue}>{summary!.returnedTotal}</span>
        </div>
        <div className={shellStyles.statCell}>
          <span className={shellStyles.statLabel}>Signs missing</span>
          <span className={shellStyles.statValue}>{summary!.missingTotal}</span>
        </div>
        <div className={shellStyles.statCell}>
          <span className={shellStyles.statLabel}>Duration</span>
          <span className={shellStyles.statValue}>{formatDuration(duration)}</span>
        </div>
        <div className={shellStyles.statCell}>
          <span className={shellStyles.statLabel}>Loaded time</span>
          <span className={shellStyles.statValue}>{formatDuration(measured?.load ?? 0)}</span>
        </div>
        <div className={shellStyles.statCell}>
          <span className={shellStyles.statLabel}>Returned time</span>
          <span className={shellStyles.statValue}>{formatDuration(measured?.unload ?? 0)}</span>
        </div>
      </div>

      <div className={styles.adjustList}>
        <div className={styles.adjustRow}>
          <div>
            <span className={styles.adjustLabel}>Distance</span>
            <span className={styles.adjustMeasured}>Not tracked — enter manually</span>
          </div>
          <button
            type="button"
            className={styles.stepperButtonMinus}
            onClick={() => bumpKm(-0.5)}
            aria-label="Decrease distance"
          >
            −
          </button>
          <span className={styles.adjustValue}>{kmAdj.toFixed(1)} km</span>
          <button
            type="button"
            className={styles.stepperButtonPlus}
            onClick={() => bumpKm(0.5)}
            aria-label="Increase distance"
          >
            +
          </button>
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
              <span className={styles.adjustValue}>{formatDuration(billedMinutes![key])}</span>
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

      <div
        className={
          billAligned ? `${styles.billPanel} ${styles.billPanelValid}` : `${styles.billPanel} ${styles.billPanelWarning}`
        }
      >
        <div className={styles.billTotalRow}>
          <span>Total charged</span>
          <span className={styles.billTotalValue}>{formatDuration(billTotal)}</span>
        </div>
        <div className={styles.billCueRow}>
          <span className={styles.billCueDot} />
          <span className={styles.billCueText}>
            {billAligned
              ? 'Lands on a 15 min increment'
              : `${formatDuration(billTotal)} is not a 15 min increment — the office can't invoice it`}
          </span>
        </div>
        {!billAligned && (
          <button type="button" className={styles.roundUpButton} onClick={handleRoundUp}>
            Round up to {formatDuration(nextQuarterHour)}
          </button>
        )}
      </div>

      <button
        type="button"
        className={`${shellStyles.primaryButton} ${styles.primaryButton}`}
        onClick={() => void handleConfirm()}
        disabled={confirming || !billAligned}
      >
        {confirming ? 'Completing…' : `Complete route · ${formatDuration(billTotal)}`}
      </button>
      <button type="button" className={shellStyles.secondaryButton} onClick={() => router.push('/operator/dashboard')} disabled={confirming}>
        Back to today
      </button>
    </div>
  );
}
