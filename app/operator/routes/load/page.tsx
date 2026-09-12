'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import { PhaseTrackBar } from '@/app/operator/components/PhaseTrackBar';
import { ConfirmDialog } from '@/app/operator/components/ConfirmDialog';
import { getRouteWithStops, getCustomer, updateRouteExecution } from '@/lib/queries';
import { getOrganizationSettings } from '@/lib/queries/OrganizationSettings';
import { getSignRunPhase } from '@/lib/signRunPhase';
import { formatClockTime } from '@/lib/signRunBilling';
import type { Route, Stop } from '@/amplify/types';
import shellStyles from '../signRunShell.module.css';
import styles from './page.module.css';

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
  const rows: AgentBreakdownRow[] = [];
  const indexByName = new Map<string, number>();

  for (const stop of stops) {
    const name = stop.agent?.trim() || 'Unassigned';
    const signs = stop.numberOfSigns ?? 0;
    if (signs === 0) continue;

    let idx = indexByName.get(name);
    if (idx === undefined) {
      idx = rows.length;
      indexByName.set(name, idx);
      rows.push({ name, timed: 0, blank: 0 });
    }
    if (stop.isAuction) {
      rows[idx].timed += signs;
    } else {
      rows[idx].timed += 1;
      rows[idx].blank += signs - 1;
    }
  }

  return rows;
}

export default function OperatorLoadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeId = searchParams.get('id');

  const [route, setRoute] = useState<Route | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [yardAddress, setYardAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: 'start' | 'confirm'; time: string } | null>(null);

  useEffect(() => {
    if (!routeId) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [{ route: fetchedRoute, stops: fetchedStops }, orgSettingsResult] = await Promise.all([
        getRouteWithStops(routeId as string),
        getOrganizationSettings(),
      ]);
      if (cancelled) return;

      setRoute(fetchedRoute as Route | null);
      setStops(fetchedStops as Stop[]);
      setYardAddress(orgSettingsResult.data?.address ?? null);

      if (fetchedRoute) {
        const customerResult = await getCustomer(fetchedRoute.customerId);
        if (!cancelled) {
          setCustomerName((customerResult.data as { name?: string } | null)?.name ?? '');
        }
      }
      if (!cancelled) setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  const phaseInfo = useMemo(() => (route ? getSignRunPhase(route, stops.length) : null), [route, stops.length]);
  const breakdown = useMemo(() => buildBreakdown(stops), [stops]);
  const totals = useMemo(
    () =>
      breakdown.reduce(
        (acc, row) => ({ timed: acc.timed + row.timed, blank: acc.blank + row.blank }),
        { timed: 0, blank: 0 }
      ),
    [breakdown]
  );
  const totalSigns = totals.timed + totals.blank;

  const openDialog = (kind: 'start' | 'confirm') => setDialog({ kind, time: new Date().toISOString() });
  const closeDialog = () => {
    if (!submitting) setDialog(null);
  };

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
    setDialog(null);
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
      setDialog(null);
      return;
    }

    router.push('/operator/dashboard');
  };

  const handleRecount = () => {
    router.push('/operator/van-count');
  };

  if (!routeId) {
    return (
      <div className={shellStyles.page}>
        <p className={shellStyles.mutedText}>No route selected.</p>
        <Link href="/operator/dashboard" className={shellStyles.backLink}>
          Back to Today
        </Link>
      </div>
    );
  }

  if (loading) return <LoadingSpinner message="Loading route..." />;

  const isValidLoadScreen = route && phaseInfo && phaseInfo.phaseIdx === 0;

  if (!isValidLoadScreen) {
    return (
      <div className={shellStyles.page}>
        <Breadcrumbs items={[{ label: 'Today', href: '/operator/dashboard' }, { label: 'Load' }]} />
        <p className={shellStyles.mutedText}>
          {route ? 'This route is not currently on the Load phase.' : 'Route not found.'}
        </p>
        <Link href="/operator/dashboard" className={shellStyles.backLink}>
          Back to Today
        </Link>
      </div>
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
