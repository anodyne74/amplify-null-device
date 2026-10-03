'use client';

import { useState } from 'react';
import type { Route } from '@/amplify/types';
import { Button } from '@/app/components/ui/core/Button';
import { Input } from '@/app/components/ui/forms/Input';
import { changePickupDate } from '@/lib/administratorRouteActions';
import { checkRouteDateBlocked } from '@/lib/routeScheduleGuard';
import { useNoOperatorsWarning } from '@/lib/useNoOperatorsWarning';
import styles from './PickupDateEditor.module.css';

type Props = {
  route: Pick<Route, 'id' | 'customerId' | 'scheduledDate' | 'pickupDate'>;
  onSaved: () => Promise<void> | void;
};

/**
 * Lets an administrator change a Route's Pickup Date, saved straight away and
 * audited. A day with no operators available is only a warning.
 */
export function PickupDateEditor({ route, onSaved }: Props) {
  const [date, setDate] = useState(route.pickupDate ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Warn only about a date that differs from the one already saved.
  const noOperators = useNoOperatorsWarning(route.customerId, date === route.pickupDate ? '' : date, checkRouteDateBlocked);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const result = await changePickupDate(route, date);
    setSaving(false);
    if (!result.ok) setError(result.error);
    // Refetch once the date is saved, even if only its audit entry failed.
    if (result.ok || result.saved) await onSaved();
  };

  return (
    <div className={styles.editor}>
      <div className={styles.row}>
        <Input
          id="pickup-date"
          type="date"
          aria-label="Pickup date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={saving}
        />
        <Button type="button" size="sm" onClick={() => void handleSave()} disabled={!date || date === route.pickupDate} loading={saving}>
          Save
        </Button>
      </div>
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
      {noOperators && <span className={styles.note}>{noOperators}</span>}
    </div>
  );
}
