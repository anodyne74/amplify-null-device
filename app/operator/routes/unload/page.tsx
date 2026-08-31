'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import { PhaseTrackBar } from '@/app/operator/components/PhaseTrackBar';
import { getRouteWithStops, getCustomer, updateRouteExecution } from '@/lib/queries';
import { getOrganizationSettings } from '@/lib/queries/OrganizationSettings';
import { getSignRunPhase } from '@/lib/signRunPhase';
import { isStopCompletedForPhase, isStopSkippedForPhase } from '@/lib/stopExecutionMarkers';
import type { Route, Stop } from '@/amplify/types';
import styles from './page.module.css';

interface UnloadReconciliation {
  returnedTotal: number;
  doneCount: number;
  skipCount: number;
  missingTotal: number;
  loadedTotal: number;
  stillOnSite: number;
}

/** Reconciles what came back against what went out — Pickup's PICKUP_DONE/
 * PICKUP_SKIPPED markers and missingSignsCount (lib/stopExecutionMarkers.ts,
 * set by app/operator/routes/pickup/page.tsx) against Load's loadedSignsCount. */
function buildReconciliation(route: Route, stops: Stop[]): UnloadReconciliation {
  let returnedTotal = 0;
  let doneCount = 0;
  let skipCount = 0;
  let missingTotal = 0;

  for (const stop of stops) {
    const skipped = isStopSkippedForPhase(stop, 'pickup');
    if (skipped) {
      skipCount += 1;
    } else if (isStopCompletedForPhase(stop, 'pickup')) {
      doneCount += 1;
      returnedTotal += stop.numberOfSigns ?? 0;
    }
    missingTotal += stop.missingSignsCount ?? 0;
  }

  const loadedTotal = route.loadedSignsCount ?? 0;
  const stillOnSite = Math.max(0, loadedTotal - returnedTotal - missingTotal);

  return { returnedTotal, doneCount, skipCount, missingTotal, loadedTotal, stillOnSite };
}

export default function OperatorUnloadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeId = searchParams.get('id');

  const [route, setRoute] = useState<Route | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [yardAddress, setYardAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const reconciliation = useMemo(() => (route ? buildReconciliation(route, stops) : null), [route, stops]);

  const handleConfirm = async () => {
    if (!route) return;
    setConfirming(true);
    setError(null);

    const now = new Date().toISOString();
    const result = await updateRouteExecution(route.id, {
      unloadConfirmedAt: now,
      actualEndTime: route.actualEndTime ?? now,
    });

    if (result.errors && result.errors.length > 0) {
      setError('Could not confirm the unload. Try again.');
      setConfirming(false);
      return;
    }

    router.push('/operator/dashboard');
  };

  if (!routeId) {
    return (
      <div className={styles.page}>
        <p className={styles.mutedText}>No route selected.</p>
        <Link href="/operator/dashboard" className={styles.backLink}>
          Back to Today
        </Link>
      </div>
    );
  }

  if (loading) return <LoadingSpinner message="Loading route..." />;

  const isUnloadScreen = route && phaseInfo && phaseInfo.phaseIdx === 3 && stops.length > 0;

  if (!isUnloadScreen) {
    return (
      <div className={styles.page}>
        <Breadcrumbs items={[{ label: 'Today', href: '/operator/dashboard' }, { label: 'Unload' }]} />
        <p className={styles.mutedText}>
          {route ? 'This route is not currently on the Unload phase.' : 'Route not found.'}
        </p>
        <Link href="/operator/dashboard" className={styles.backLink}>
          Back to Today
        </Link>
      </div>
    );
  }

  const { returnedTotal, doneCount, skipCount, missingTotal, loadedTotal, stillOnSite } = reconciliation!;

  return (
    <div className={styles.page}>
      <Breadcrumbs
        items={[
          { label: 'Today', href: '/operator/dashboard' },
          { label: `${route.routeCode || route.id.slice(0, 8)} · Unload` },
        ]}
      />

      {error && <div className={styles.errorBanner}>{error}</div>}

      <div>
        <div className={styles.kickerRow}>
          <span className={styles.kicker}>{phaseInfo.phaseKicker}</span>
          {customerName && <span className={styles.customer}>{customerName}</span>}
        </div>
        <h2 className={styles.title}>{returnedTotal} signs to return</h2>
        {yardAddress && <p className={styles.subtitle}>{yardAddress}</p>}
      </div>

      <PhaseTrackBar track={phaseInfo.track} caption={phaseInfo.phaseNumberLabel} />

      <div className={styles.statsGrid}>
        <div className={styles.statCell}>
          <span className={styles.statLabel}>Signs collected</span>
          <span className={styles.statValue}>{returnedTotal}</span>
        </div>
        <div className={styles.statCell}>
          <span className={styles.statLabel}>Stops picked up</span>
          <span className={styles.statValue}>
            {doneCount} / {stops.length}
          </span>
        </div>
        <div className={styles.statCell}>
          <span className={styles.statLabel}>Left on site</span>
          <span className={styles.statValue}>{skipCount ? `${skipCount} stops` : 'None'}</span>
        </div>
        <div className={styles.statCell}>
          <span className={styles.statLabel}>Missing reported</span>
          <span className={styles.statValue}>{missingTotal}</span>
        </div>
      </div>

      <div className={styles.reconcilePanel}>
        <span className={styles.reconcileKicker}>Against the load</span>
        <p className={styles.reconcileText}>
          {loadedTotal} loaded · {returnedTotal} returned · {missingTotal} reported missing · {stillOnSite} still on
          site.
        </p>
      </div>

      <button type="button" className={styles.primaryButton} onClick={() => void handleConfirm()} disabled={confirming}>
        {confirming ? 'Confirming…' : `Confirm ${returnedTotal} signs returned`}
      </button>

      <p className={styles.footnote}>
        Confirming returns you to the main screen with the route ready to finalise. Charged time is set on Finalise,
        not here.
      </p>
    </div>
  );
}
