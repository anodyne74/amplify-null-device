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
import { queueSignRunTransition } from '@/lib/signRunTransitions';
import { formatClockTime } from '@/lib/format';
import { reconcileSignRun } from '@/lib/signRunReconciliation';
import type { Route } from '@/amplify/types';
import { NoRouteSelected, PhaseNotReady } from '../PhaseNotReady';
import shellStyles from '../signRunShell.module.css';
import styles from './page.module.css';
import { getCustomer } from '@/lib/customers';

interface UnloadScreenExtra {
  customerName: string;
  yardAddress: string | null;
}

async function fetchUnloadScreenExtra(route: Route): Promise<UnloadScreenExtra> {
  const [customer, orgSettingsResult] = await Promise.all([
    getCustomer(route.customerId).catch(() => null),
    // The yard address is best-effort: unreadable settings show none.
    getOrganizationSettings().catch(() => null),
  ]);
  return {
    customerName: customer?.name ?? '',
    yardAddress: orgSettingsResult?.address ?? null,
  };
}

export default function OperatorUnloadPage() {
  const router = useRouter();
  const {
    routeId,
    route,
    stops,
    loading,
    phaseInfo,
    isOnPhase: isUnloadScreen,
    extra,
  } = useSignRunPhaseScreen({ phaseIdx: 3, fetchExtra: fetchUnloadScreenExtra });
  const customerName = extra?.customerName ?? '';
  const yardAddress = extra?.yardAddress ?? null;
  const [error, setError] = useState<string | null>(null);
  const { dialog, openDialog, closeDialog, submitting } = useTimestampConfirmDialog<
    'start' | 'confirm'
  >();

  const reconciliation = useMemo(() => (route ? reconcileSignRun(route, stops) : null), [route, stops]);

  // Transitions show at once and save in the background (lib/signRunOutbox.ts).
  const handleStartUnload = (iso: string) => {
    if (!route) return;
    setError(null);

    const result = queueSignRunTransition(route, { type: 'startUnload', at: iso });
    if ('error' in result) {
      setError(result.error);
      return;
    }

    closeDialog();
  };

  const handleConfirmUnload = (iso: string) => {
    if (!route) return;
    setError(null);

    const result = queueSignRunTransition(route, { type: 'confirmUnload', at: iso });
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
