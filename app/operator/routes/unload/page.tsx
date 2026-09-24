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
import { reconcileSignRun } from '@/lib/signRunReconciliation';
import type { Route } from '@/amplify/types';
import { NoRouteSelected, PhaseNotReady } from '../PhaseNotReady';
import shellStyles from '../signRunShell.module.css';
import styles from './page.module.css';

interface UnloadScreenExtra {
  customerName: string;
  yardAddress: string | null;
}

async function fetchUnloadScreenExtra(route: Route): Promise<UnloadScreenExtra> {
  const [customerResult, orgSettingsResult] = await Promise.all([
    getCustomer(route.customerId),
    getOrganizationSettings(),
  ]);
  return {
    customerName: (customerResult.data as { name?: string } | null)?.name ?? '',
    yardAddress: orgSettingsResult.data?.address ?? null,
  };
}

export default function OperatorUnloadPage() {
  const router = useRouter();
  const {
    routeId,
    route,
    setRoute,
    stops,
    loading,
    phaseInfo,
    isOnPhase: isUnloadScreen,
    extra,
  } = useSignRunPhaseScreen({ phaseIdx: 3, fetchExtra: fetchUnloadScreenExtra });
  const customerName = extra?.customerName ?? '';
  const yardAddress = extra?.yardAddress ?? null;
  const [error, setError] = useState<string | null>(null);
  const { dialog, openDialog, closeDialog, submitting, setSubmitting } = useTimestampConfirmDialog<
    'start' | 'confirm'
  >();

  const reconciliation = useMemo(() => (route ? reconcileSignRun(route, stops) : null), [route, stops]);

  const handleStartUnload = async (iso: string) => {
    if (!route) return;
    setSubmitting(true);
    setError(null);

    const result = await updateRouteExecution(route.id, { unloadStartedAt: iso });

    setSubmitting(false);
    if (result.errors && result.errors.length > 0) {
      setError('Could not start the unload. Try again.');
      return;
    }

    setRoute((prev) => (prev ? { ...prev, unloadStartedAt: iso } : prev));
    closeDialog();
  };

  const handleConfirmUnload = async (iso: string) => {
    if (!route) return;
    setSubmitting(true);
    setError(null);

    const result = await updateRouteExecution(route.id, {
      unloadConfirmedAt: iso,
      actualEndTime: route.actualEndTime ?? iso,
    });

    if (result.errors && result.errors.length > 0) {
      setError('Could not confirm the unload. Try again.');
      setSubmitting(false);
      closeDialog();
      return;
    }

    router.push('/operator/dashboard');
  };

  if (!routeId) {
    return <NoRouteSelected />;
  }

  if (loading) return <LoadingSpinner message="Loading route..." />;

  if (!isUnloadScreen || !route || !phaseInfo) {
    return (
      <PhaseNotReady
        phaseLabel="Unload"
        message={route ? 'This route is not currently on the Unload phase.' : 'Route not found.'}
      />
    );
  }

  const { returnedTotal, doneCount, skipCount, missingTotal, loadedTotal, stillOnSite } = reconciliation!;

  return (
    <div className={shellStyles.page}>
      <Breadcrumbs
        items={[
          { label: 'Today', href: '/operator/dashboard' },
          { label: `${route.routeCode || route.id.slice(0, 8)} · Unload` },
        ]}
      />

      {error && <div className={shellStyles.errorBanner}>{error}</div>}

      <div>
        <div className={shellStyles.kickerRow}>
          <span className={shellStyles.kicker}>{phaseInfo.phaseKicker}</span>
          {customerName && <span className={shellStyles.customer}>{customerName}</span>}
        </div>
        <h2 className={shellStyles.title}>{returnedTotal} signs to return</h2>
        {yardAddress && <p className={shellStyles.subtitle}>{yardAddress}</p>}
      </div>

      <PhaseTrackBar track={phaseInfo.track} caption={phaseInfo.phaseNumberLabel} />

      <div className={shellStyles.statsGrid}>
        <div className={shellStyles.statCell}>
          <span className={shellStyles.statLabel}>Signs collected</span>
          <span className={shellStyles.statValue}>{returnedTotal}</span>
        </div>
        <div className={shellStyles.statCell}>
          <span className={shellStyles.statLabel}>Stops picked up</span>
          <span className={shellStyles.statValue}>
            {doneCount} / {stops.length}
          </span>
        </div>
        <div className={shellStyles.statCell}>
          <span className={shellStyles.statLabel}>Left on site</span>
          <span className={shellStyles.statValue}>{skipCount ? `${skipCount} stops` : 'None'}</span>
        </div>
        <div className={shellStyles.statCell}>
          <span className={shellStyles.statLabel}>Missing reported</span>
          <span className={shellStyles.statValue}>{missingTotal}</span>
        </div>
      </div>

      <div className={styles.reconcilePanel}>
        <span className={styles.reconcileKicker}>Against the load</span>
        <p className={styles.reconcileText}>
          {loadedTotal} loaded · {returnedTotal} returned · {missingTotal} reported missing · {stillOnSite} still on
          site.
        </p>
      </div>

      {route.unloadStartedAt && (
        <div className={styles.stampLine}>Unload started {formatClockTime(route.unloadStartedAt)}</div>
      )}

      {!route.unloadStartedAt ? (
        <button
          type="button"
          className={`${shellStyles.primaryButton} ${styles.primaryButton}`}
          onClick={() => openDialog('start')}
          disabled={submitting}
        >
          Start unload
        </button>
      ) : (
        <button
          type="button"
          className={`${shellStyles.primaryButton} ${styles.primaryButton}`}
          onClick={() => openDialog('confirm')}
          disabled={submitting}
        >
          {`Confirm ${returnedTotal} signs returned`}
        </button>
      )}

      <p className={shellStyles.footnote}>
        Unload only unlocks once every stop is settled. Start and complete both confirm in a dialog; charged time is
        set on Finalise.
      </p>

      <ConfirmDialog
        open={dialog !== null}
        time={dialog ? formatClockTime(dialog.time) : ''}
        title={dialog?.kind === 'start' ? 'Start unload' : 'Complete unload'}
        summary={
          dialog?.kind === 'start'
            ? `Starting unload at ${yardAddress ?? 'the yard'}.`
            : `Signs returned to ${yardAddress ?? 'the yard'}.`
        }
        busy={submitting}
        onCancel={closeDialog}
        onOk={() => {
          if (!dialog) return;
          void (dialog.kind === 'start' ? handleStartUnload(dialog.time) : handleConfirmUnload(dialog.time));
        }}
      />
    </div>
  );
}
