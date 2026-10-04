'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import { PhaseTrackBar } from '@/app/operator/components/PhaseTrackBar';
import { ConfirmDialog } from '@/app/operator/components/ConfirmDialog';
import { getOrganizationSettings } from '@/lib/queries/OrganizationSettings';
import { useSignRunPhaseScreen } from '@/lib/useSignRunPhaseScreen';
import { useTimestampConfirmDialog } from '@/lib/useTimestampConfirmDialog';
import { queueLoadChange, queueSignRunTransition } from '@/lib/signRunTransitions';
import { activeStops, type LoadStopInput } from '@/lib/loadChange';
import { useCurrentUserId } from '@/lib/use-user-groups';
import { formatClockTime } from '@/lib/format';
import { groupByAgent, signsPlaced, timedSigns } from '@/lib/signRunTotals';
import type { Route, Stop } from '@/amplify/types';
import { NoRouteSelected, PhaseNotReady } from '../PhaseNotReady';
import shellStyles from '../signRunShell.module.css';
import styles from './page.module.css';
import { getCustomer } from '@/lib/customers';
import { TimedSignsChecklist } from './TimedSignsChecklist';

interface LoadScreenExtra {
  customerName: string;
  customerAgents: Array<string | null>;
  yardAddress: string | null;
}

async function fetchLoadScreenExtra(route: Route): Promise<LoadScreenExtra> {
  const [customer, orgSettingsResult] = await Promise.all([
    getCustomer(route.customerId).catch(() => null),
    // The yard address is best-effort: unreadable settings show none.
    getOrganizationSettings().catch(() => null),
  ]);
  return {
    customerName: customer?.name ?? '',
    customerAgents: customer?.agentOptions ?? [],
    yardAddress: orgSettingsResult?.address ?? null,
  };
}

interface AgentBreakdownRow {
  name: string;
  timed: number;
  blank: number;
}

/** Distinct stop.agent values, first-appearance (sequence) order — stops.list
 * from getRouteWithStops is already sorted by sequence. No-agent stops are
 * pooled under "Unassigned", shown only if any exist. Timed vs blank follows
 * timedSigns(). */
function buildBreakdown(stops: Stop[]): AgentBreakdownRow[] {
  const stopsWithSigns = stops.filter((stop) => (stop.numberOfSigns ?? 0) > 0);

  return groupByAgent(stopsWithSigns).map((group) => {
    const row: AgentBreakdownRow = { name: group.agent, timed: 0, blank: 0 };
    for (const stop of group.stops) {
      const timed = timedSigns(stop);
      row.timed += timed;
      row.blank += (stop.numberOfSigns ?? 0) - timed;
    }
    return row;
  });
}

export default function OperatorLoadPage() {
  const router = useRouter();
  const {
    routeId,
    route,
    stops: allStops,
    loading,
    phaseInfo,
    isOnPhase: isValidLoadScreen,
    extra,
  } = useSignRunPhaseScreen({ phaseIdx: 0, requireStops: false, includeRemoved: true, fetchExtra: fetchLoadScreenExtra });
  // Removed properties stay in the checklist to be restored, and count toward nothing.
  const stops = useMemo(() => activeStops(allStops), [allStops]);
  const userId = useCurrentUserId();
  const customerName = extra?.customerName ?? '';
  const yardAddress = extra?.yardAddress ?? null;
  const customerAgents = extra?.customerAgents ?? [];
  const [error, setError] = useState<string | null>(null);
  const { dialog, openDialog, closeDialog, submitting } = useTimestampConfirmDialog<
    'start' | 'confirm'
  >();

  const breakdown = useMemo(() => buildBreakdown(stops), [stops]);
  const totals = useMemo(
    () =>
      breakdown.reduce(
        (acc, row) => ({ timed: acc.timed + row.timed, blank: acc.blank + row.blank }),
        { timed: 0, blank: 0 }
      ),
    [breakdown]
  );
  const totalSigns = signsPlaced(stops);

  // Transitions show at once and save in the background (lib/signRunOutbox.ts).
  const handleStartLoad = (iso: string) => {
    if (!route) return;
    setError(null);

    const result = queueSignRunTransition(route, { type: 'startLoad', at: iso });
    if ('error' in result) {
      setError(result.error);
      return;
    }

    closeDialog();
  };

  // Load Changes, like transitions, show at once and save in the background.
  const changeLoad = (change: Parameters<typeof queueLoadChange>[1]): string | null => {
    if (!route) return null;
    const result = queueLoadChange(route, change);
    return 'error' in result ? result.error : null;
  };

  const findStop = (stopId: string) => allStops.find((stop) => stop.id === stopId);

  const handleRemoveStop = (stopId: string) => {
    const stop = findStop(stopId);
    if (!stop) return null;
    if (!userId) return 'Could not tell who is signed in. Try again in a moment.';
    return changeLoad({ type: 'remove', stop, by: userId });
  };

  const handleRestoreStop = (stopId: string) => {
    const stop = findStop(stopId);
    return stop ? changeLoad({ type: 'restore', stop }) : null;
  };

  const handleAddStop = (input: LoadStopInput) => changeLoad({ type: 'add', stops: allStops, input });

  const handleConfirmLoad = (iso: string) => {
    if (!route) return;
    setError(null);

    const result = queueSignRunTransition(route, { type: 'confirmLoad', at: iso, loadedSignsCount: totalSigns });
    if ('error' in result) {
      setError(result.error);
      closeDialog();
      return;
    }

    router.push('/operator/dashboard');
  };

  if (!routeId) {
    return <NoRouteSelected />;
  }

  if (loading) return <LoadingSpinner message="Loading route..." />;

  if (!isValidLoadScreen || !route || !phaseInfo) {
    return (
      <PhaseNotReady
        phaseLabel="Load"
        message={route ? 'This route is not currently on the Load phase.' : 'Route not found.'}
      />
    );
  }

  return (
    <div className={shellStyles.page}>
      <Breadcrumbs
        items={[
          { label: 'Today', href: '/operator/dashboard' },
          { label: `${route.routeCode || route.id.slice(0, 8)} · Load` },
        ]}
      />

      {error && <div className={shellStyles.errorBanner}>{error}</div>}

      <div>
        <div className={shellStyles.kickerRow}>
          <span className={shellStyles.kicker}>{phaseInfo.phaseKicker}</span>
          {customerName && <span className={shellStyles.customer}>{customerName}</span>}
        </div>
        <h2 className={shellStyles.title}>{totalSigns} signs to load</h2>
        {yardAddress && <p className={shellStyles.subtitle}>{yardAddress}</p>}
      </div>

      <PhaseTrackBar track={phaseInfo.track} caption={phaseInfo.phaseNumberLabel} />

      <div className={styles.breakdownCard}>
        <div className={styles.breakdownRow}>
          <span className={styles.breakdownHeaderCell}>AGENT</span>
          <span className={styles.breakdownHeaderCellNum}>TIMED</span>
          <span className={styles.breakdownHeaderCellNum}>BLANK</span>
        </div>
        {breakdown.map((row) => (
          <div key={row.name} className={styles.breakdownRow}>
            <span className={styles.breakdownName}>{row.name}</span>
            <span className={styles.breakdownValue}>{row.timed}</span>
            <span className={styles.breakdownValue}>{row.blank}</span>
          </div>
        ))}
        <div className={styles.breakdownDivider} />
        <div className={styles.breakdownRow}>
          <span className={styles.breakdownTotalLabel}>{totalSigns} signs</span>
          <span className={styles.breakdownTotalValue}>{totals.timed}</span>
          <span className={styles.breakdownTotalValue}>{totals.blank}</span>
        </div>
      </div>

      {!route.loadStartedAt && (
        <div className={styles.startPanel}>Tap start once you&apos;re at the yard to begin loading.</div>
      )}

      {route.loadStartedAt && (
        <TimedSignsChecklist
          stops={allStops}
          customerAgents={customerAgents}
          onRemove={handleRemoveStop}
          onRestore={handleRestoreStop}
          onAdd={handleAddStop}
        />
      )}

      {route.loadStartedAt && (
        <div className={styles.stampLine}>Load started {formatClockTime(route.loadStartedAt)}</div>
      )}

      {route.loadStartedAt && !route.loadConfirmedAt && (
        <div className={styles.warningPanel}>
          Load not confirmed — stops still open, but the yard time may not bill.
        </div>
      )}

      {!route.loadStartedAt ? (
        <button
          type="button"
          className={`${shellStyles.primaryButton} ${styles.primaryButton}`}
          onClick={() => openDialog('start')}
          disabled={submitting}
        >
          Start load
        </button>
      ) : (
        <button
          type="button"
          className={`${shellStyles.primaryButton} ${styles.primaryButton}`}
          onClick={() => openDialog('confirm')}
          disabled={submitting}
        >
          {`Confirm ${totalSigns} signs loaded`}
        </button>
      )}

      <p className={shellStyles.footnote}>
        Start and complete both confirm in a dialog showing the time. Completing returns you to the main screen with
        the route on phase 2; charged time is set on Finalise.
      </p>

      <ConfirmDialog
        open={dialog !== null}
        time={dialog ? formatClockTime(dialog.time) : ''}
        title={dialog?.kind === 'start' ? 'Start load' : 'Complete load'}
        summary={
          dialog?.kind === 'start'
            ? `Starting load of ${totalSigns} signs at ${yardAddress ?? 'the yard'}.`
            : `${totalSigns} signs loaded at ${yardAddress ?? 'the yard'}.`
        }
        busy={submitting}
        onCancel={closeDialog}
        onOk={() => {
          if (!dialog) return;
          void (dialog.kind === 'start' ? handleStartLoad(dialog.time) : handleConfirmLoad(dialog.time));
        }}
      />
    </div>
  );
}
