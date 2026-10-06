'use client';

import { useEffect, useState } from 'react';
import type { Route } from '@/amplify/types';
import { Button } from '@/app/components/ui/core/Button';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { FinaliseAdjusters } from '@/app/components/FinaliseAdjusters';
import { correctBilledTime, type BilledTimeCorrection } from '@/lib/administratorRouteActions';
import { billedTime, isBillableTotal, parseDistanceKm } from '@/lib/billedTime';
import { formatDuration } from '@/lib/format';
import { listRouteInvoices } from '@/lib/invoices';
import { DISTANCE_ERROR, useFinaliseAdjusters } from '@/lib/useFinaliseAdjusters';
import styles from './BilledTimeCorrectionPanel.module.css';

const TOTAL_ERROR = 'Enter a total of 15 min or more, in 15 min increments.';

type Props = { route: Route; onSaved: () => Promise<void> | void };

/**
 * Lets an administrator correct a completed Route's Billed Time, with the
 * rules and adjusters Finalise uses. A total-only Route (one from before the
 * Sign Run) is corrected by its total. Warns, but doesn't stop, when the Route
 * has already been invoiced.
 */
export function BilledTimeCorrectionPanel({ route, onSaved }: Props) {
  const [invoiceNumbers, setInvoiceNumbers] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    listRouteInvoices(route.id)
      .then((invoices) => {
        if (!cancelled) setInvoiceNumbers(invoices.map((invoice) => invoice.invoiceNumber));
      })
      .catch(() => {
        // Non-blocking: the warning is a courtesy, the correction still works.
      });
    return () => {
      cancelled = true;
    };
  }, [route.id]);

  return (
    <div className={styles.panel}>
      {invoiceNumbers.length > 0 && (
        <div className={styles.warning} role="status">
          Already invoiced on {invoiceNumbers.join(', ')}. Correcting the Billed Time here won&apos;t change{' '}
          {invoiceNumbers.length > 1 ? 'those invoices' : 'that invoice'}.
        </div>
      )}
      {billedTime(route).phases ? <PhaseCorrection route={route} onSaved={onSaved} /> : <TotalCorrection route={route} onSaved={onSaved} />}
    </div>
  );
}

function useCorrectionSave(route: Route, onSaved: Props['onSaved']) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async (correction: BilledTimeCorrection) => {
    setSaving(true);
    setError(null);
    setSaved(false);
    const result = await correctBilledTime(route, correction);
    setSaving(false);
    if (result.ok) setSaved(true);
    else setError(result.error);
    // Refetch once the Billed Time is saved, even if only its audit entry failed.
    if (result.ok || result.saved) await onSaved();
  };

  return { saving, error, saved, save };
}

function SaveFeedback({ error, saved }: { error: string | null; saved: boolean }) {
  if (error) {
    return (
      <div className={styles.error} role="alert">
        {error}
      </div>
    );
  }
  return saved ? (
    <div className={styles.success} role="status">
      Billed Time saved.
    </div>
  ) : null;
}

function PhaseCorrection({ route, onSaved }: Props) {
  const adjusters = useFinaliseAdjusters(route);
  const { billedMinutes, distanceKm, billTotal, canConfirm } = adjusters;
  const { saving, error, saved, save } = useCorrectionSave(route, onSaved);

  const current = billedTime(route);
  const unchanged =
    Boolean(billedMinutes && current.phases) &&
    (['load', 'placement', 'pickup', 'unload'] as const).every((phase) => billedMinutes?.[phase] === current.phases?.[phase]) &&
    distanceKm === current.distanceKm;

  const handleSave = () => {
    if (!billedMinutes || distanceKm === null || !canConfirm) return;
    void save({ billedMinutes, distanceKm });
  };

  return (
    <>
      <SaveFeedback error={error} saved={saved && unchanged} />
      <FinaliseAdjusters adjusters={adjusters} />
      <Button type="button" onClick={handleSave} disabled={!canConfirm || unchanged} loading={saving}>
        {saving ? 'Saving…' : `Save Billed Time · ${formatDuration(billTotal)}`}
      </Button>
    </>
  );
}

function parseTotalMinutes(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const minutes = Number(trimmed);
  return minutes > 0 && isBillableTotal(minutes) ? minutes : null;
}

function TotalCorrection({ route, onSaved }: Props) {
  const current = billedTime(route);
  const [totalText, setTotalText] = useState(String(current.totalMinutes ?? 0));
  const [distanceText, setDistanceText] = useState((current.distanceKm ?? 0).toFixed(1));
  const { saving, error, saved, save } = useCorrectionSave(route, onSaved);

  const totalMinutes = parseTotalMinutes(totalText);
  const distanceKm = parseDistanceKm(distanceText);
  const unchanged = totalMinutes === current.totalMinutes && distanceKm === current.distanceKm;

  const handleSave = () => {
    if (totalMinutes === null || distanceKm === null) return;
    void save({ totalMinutes, distanceKm });
  };

  return (
    <>
      <p className={styles.intro}>This route has a total only, with no time recorded for each phase.</p>
      <SaveFeedback error={error} saved={saved && unchanged} />
      <Field label="Total charged (minutes)" htmlFor="billed-total" error={totalMinutes === null ? TOTAL_ERROR : undefined}>
        <Input id="billed-total" type="text" inputMode="numeric" value={totalText} onChange={(event) => setTotalText(event.target.value)} />
      </Field>
      <Field label="Distance (km)" htmlFor="billed-distance" error={distanceKm === null ? DISTANCE_ERROR : undefined}>
        <Input id="billed-distance" type="text" inputMode="decimal" value={distanceText} onChange={(event) => setDistanceText(event.target.value)} />
      </Field>
      <Button type="button" onClick={handleSave} disabled={totalMinutes === null || distanceKm === null || unchanged} loading={saving}>
        {saving ? 'Saving…' : `Save Billed Time${totalMinutes === null ? '' : ` · ${formatDuration(totalMinutes)}`}`}
      </Button>
    </>
  );
}
