'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import { PhaseTrackBar } from '@/app/operator/components/PhaseTrackBar';
import { ConfirmDialog } from '@/app/operator/components/ConfirmDialog';
import { getCustomer, updateRouteExecution } from '@/lib/queries';
import { getOrganizationSettings } from '@/lib/queries/OrganizationSettings';
import { useSignRunPhaseScreen } from '@/lib/useSignRunPhaseScreen';
import { useTimestampConfirmDialog } from '@/lib/useTimestampConfirmDialog';
import { formatClockTime } from '@/lib/signRunBilling';
import { groupByAgent, signsPlaced } from '@/lib/signRunTotals';
import type { Route, Stop } from '@/amplify/types';
import { NoRouteSelected, PhaseNotReady } from '../PhaseNotReady';
import shellStyles from '../signRunShell.module.css';
import styles from './page.module.css';

interface LoadScreenExtra {
  customerName: string;
  yardAddress: string | null;
}

async function fetchLoadScreenExtra(route: Route): Promise<LoadScreenExtra> {
  const [customerResult, orgSettingsResult] = await Promise.all([
    getCustomer(route.customerId),
    getOrganizationSettings(),
  ]);
  return {
    customerName: (customerResult.data as { name?: string } | null)?.name ?? '',
    yardAddress: orgSettingsResult.data?.address ?? null,
  };
}

interface AgentBreakdownRow {
  name: string;
  timed: number;
  blank: number;
}

/** Distinct stop.agent values, first-appearance (sequence) order — stops.list
 * from getRouteWithStops is already sorted by sequence. No-agent stops are
 * pooled under "Unassigned", shown only if any exist.
 *
 * Every auction property's signs are all timed (they all carry the auction
 * date/time). A non-auction property gets exactly one timed sign -- the main
 * board, which carries the viewing-times rider -- and any remaining signs are
 * blank. */
function buildBreakdown(stops: Stop[]): AgentBreakdownRow[] {
  const stopsWithSigns = stops.filter((stop) => (stop.numberOfSigns ?? 0) > 0);

  return groupByAgent(stopsWithSigns).map((group) => {
    const row: AgentBreakdownRow = { name: group.agent, timed: 0, blank: 0 };
    for (const stop of group.stops) {
      const signs = stop.numberOfSigns ?? 0;
      if (stop.isAuction) {
        row.timed += signs;
      } else {
        row.timed += 1;
        row.blank += signs - 1;
      }
    }
    return row;
  });
}

export default function OperatorLoadPage() {
  const router = useRouter();
  const {
    routeId,
    route,
    setRoute,
    stops,
    loading,
    phaseInfo,
    isOnPhase: isValidLoadScreen,
    extra,
  } = useSignRunPhaseScreen({ phaseIdx: 0, requireStops: false, fetchExtra: fetchLoadScreenExtra });
  const customerName = extra?.customerName ?? '';
  const yardAddress = extra?.yardAddress ?? null;
  const [error, setError] = useState<string | null>(null);
  const { dialog, openDialog, closeDialog, submitting, setSubmitting } = useTimestampConfirmDialog<
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

  const handleStartLoad = async (iso: string) => {
    if (!route) return;
    setSubmitting(true);
    setError(null);

    const result = await updateRouteExecution(route.id, {
      loadStartedAt: iso,
      actualStartTime: route.actualStartTime ?? iso,
    });

    setSubmitting(false);
    if (result.errors && result.errors.length > 0) {
      setError('Could not start the load. Try again.');
      return;
    }

    setRoute((prev) =>
      prev ? { ...prev, loadStartedAt: iso, actualStartTime: prev.actualStartTime ?? iso } : prev
    );
    closeDialog();
  };

  const handleConfirmLoad = async (iso: string) => {
    if (!route) return;
    setSubmitting(true);
    setError(null);

    const result = await updateRouteExecution(route.id, {
      loadConfirmedAt: iso,
      loadedSignsCount: totalSigns,
      executionPhase: 'placement',
      status: route.status === 'planned' ? 'in_progress' : route.status ?? 'in_progress',
    });

    if (result.errors && result.errors.length > 0) {
      setError('Could not confirm the load. Try again.');
      setSubmitting(false);
      closeDialog();
      return;
    }

    router.push('/operator/dashboard');
  };

  const handleRecount = () => {
    router.push('/operator/van-count');
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
        <>
          <button
            type="button"
            className={`${shellStyles.primaryButton} ${styles.primaryButton}`}
            onClick={() => openDialog('confirm')}
            disabled={submitting}
          >
            {`Confirm ${totalSigns} signs loaded`}
          </button>
          <button type="button" className={shellStyles.secondaryButton} onClick={handleRecount} disabled={submitting}>
            Count differs — recount
          </button>
        </>
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
