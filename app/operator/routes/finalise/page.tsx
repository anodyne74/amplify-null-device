'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import { PhaseTrackBar } from '@/app/operator/components/PhaseTrackBar';
import { useSignRunPhaseScreen } from '@/lib/useSignRunPhaseScreen';
import { reconcileSignRun } from '@/lib/signRunReconciliation';
import { activeStops } from '@/lib/loadChange';
import { queueSignRunTransition } from '@/lib/signRunTransitions';
import { sumBilledMinutes } from '@/lib/billedTime';
import { formatDuration } from '@/lib/format';
import { useFinaliseAdjusters } from '@/lib/useFinaliseAdjusters';
import { useStoredRouteEstimate } from '@/lib/useStoredRouteEstimate';
import { FinaliseAdjusters } from '@/app/components/FinaliseAdjusters';
import { NoRouteSelected, PhaseNotReady } from '../PhaseNotReady';
import shellStyles from '../signRunShell.module.css';
import styles from './page.module.css';

export default function OperatorFinalisePage() {
  const router = useRouter();
  const {
    routeId,
    route,
    stops: allStops,
    loading,
    phaseInfo,
    isOnPhase: isFinaliseScreen,
  } = useSignRunPhaseScreen({ phaseIdx: 4, includeRemoved: true });
  // Reconciliation counts the signs of Stops removed at the door as returned; every other count leaves them out.
  const stops = useMemo(() => activeStops(allStops), [allStops]);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adjusters = useFinaliseAdjusters(route);
  const routeEstimate = useStoredRouteEstimate(routeId ?? undefined);
  const { measured, billedMinutes, distanceKm, billTotal, canConfirm } = adjusters;

  const summary = useMemo(() => (route ? reconcileSignRun(route, allStops) : null), [route, allStops]);
  // Cumulative duration of the completed phases, not raw wall-clock start-to-end —
  // a phase with no recorded times (e.g. pickup/unload never actioned) contributes 0.
  const duration = measured ? sumBilledMinutes(measured) : 0;

  // Shows at once and saves in the background (lib/signRunOutbox.ts);
  // confirming only guards a second tap before the dashboard opens.
  const handleConfirm = () => {
    if (!route || !billedMinutes || distanceKm === null || !canConfirm) return;
    setConfirming(true);
    setError(null);

    const result = queueSignRunTransition(route, { type: 'finalise', billedMinutes, distanceKm });
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
          Adjust each phase in 5 min steps, and type the distance or step it by 0.5 km. Load and unload are
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
          <span className={shellStyles.statLabel}>Signs returned</span>
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

      <FinaliseAdjusters adjusters={adjusters} estimateMeters={routeEstimate?.totalMeters} />

      <button
        type="button"
        className={`${shellStyles.primaryButton} ${styles.primaryButton}`}
        onClick={() => void handleConfirm()}
        disabled={confirming || !canConfirm}
      >
        {confirming ? 'Completing…' : `Complete route · ${formatDuration(billTotal)}`}
      </button>
      <button type="button" className={shellStyles.secondaryButton} onClick={() => router.push('/operator/dashboard')} disabled={confirming}>
        Back to today
      </button>
    </div>
  );
}
