'use client';

import { useState } from 'react';
import type { Route } from '@/amplify/types';
import { Button } from '@/app/components/ui/core/Button';
import { FinaliseAdjusters } from '@/app/components/FinaliseAdjusters';
import { finaliseRouteAsAdministrator } from '@/lib/administratorRouteActions';
import { formatDuration } from '@/lib/format';
import { useStoredRouteEstimate } from '@/lib/useStoredRouteEstimate';
import { useFinaliseAdjusters } from '@/lib/useFinaliseAdjusters';
import styles from './AdministratorFinalisePanel.module.css';

/**
 * Lets an administrator finalise a Route that's waiting on Finalise (#408),
 * with the operator Finalise screen's adjusters. The caller shows it only on
 * that phase; a refused or failed save keeps the panel and what was entered.
 */
export function AdministratorFinalisePanel({ route, onFinalised }: { route: Route; onFinalised: () => Promise<void> | void }) {
  const adjusters = useFinaliseAdjusters(route);
  const routeEstimate = useStoredRouteEstimate(route.id);
  const { billedMinutes, distanceKm, billTotal, canConfirm } = adjusters;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFinalise = async () => {
    if (!billedMinutes || distanceKm === null || !canConfirm) return;
    setSaving(true);
    setError(null);
    const result = await finaliseRouteAsAdministrator(route, { billedMinutes, distanceKm });
    setSaving(false);
    if (!result.ok) setError(result.error);
    // Refetch once the Route is completed, even if only its audit entry failed.
    if (result.ok || result.saved) await onFinalised();
  };

  return (
    <div className={styles.panel}>
      <p className={styles.intro}>
        Unload is confirmed. Check the distance and the time charged for each phase, then finalise the route.
      </p>
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      <FinaliseAdjusters adjusters={adjusters} estimateMeters={routeEstimate?.totalMeters} />
      <Button type="button" onClick={() => void handleFinalise()} disabled={!canConfirm} loading={saving}>
        {saving ? 'Finalising…' : `Finalise route · ${formatDuration(billTotal)}`}
      </Button>
    </div>
  );
}
