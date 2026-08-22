'use client';

import { useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import PageHeader from '@/app/operator/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { getVanSignCount } from '@/lib/queries/GetVanSignCount';
import { createVanSignCount } from '@/lib/queries/CreateVanSignCount';
import { updateVanSignCount } from '@/lib/queries/UpdateVanSignCount';
import type { VanSignCount } from '@/amplify/types';
import styles from './page.module.css';

type CountKey = 'standardCount' | 'auctionCount' | 'frameCount';

const CATEGORIES: { key: CountKey; name: string; sub: string }[] = [
  { key: 'standardCount', name: 'Standard post', sub: 'Steel post + panel' },
  { key: 'auctionCount', name: 'Auction rider', sub: 'Clips to standard post' },
  { key: 'frameCount', name: 'A-frame', sub: 'Narrow verges, shopfronts' },
];

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatCountedAt(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

export default function OperatorVanCountPage() {
  const { user } = useAuthenticator();
  const operatorSub = user?.userId || '';

  const [existingId, setExistingId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<CountKey, number>>({
    standardCount: 0,
    auctionCount: 0,
    frameCount: 0,
  });
  const [countedAt, setCountedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!operatorSub) return;
    let cancelled = false;
    setLoading(true);

    void getVanSignCount(operatorSub, getTodayDate()).then((result) => {
      if (cancelled) return;
      const existing = result.data as VanSignCount | null;
      if (existing) {
        setExistingId(existing.id);
        setCounts({
          standardCount: existing.standardCount,
          auctionCount: existing.auctionCount,
          frameCount: existing.frameCount,
        });
        setCountedAt(existing.countedAt ?? null);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [operatorSub]);

  const total = counts.standardCount + counts.auctionCount + counts.frameCount;

  const adjust = (key: CountKey, delta: number) => {
    setCounts((prev) => ({ ...prev, [key]: Math.max(0, prev[key] + delta) }));
  };

  const handleSave = async () => {
    if (!operatorSub) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    const now = new Date().toISOString();
    const result = existingId
      ? await updateVanSignCount(existingId, { ...counts, countedAt: now })
      : await createVanSignCount({ operatorSub, countDate: getTodayDate(), ...counts, countedAt: now });

    if (result.errors && result.errors.length > 0) {
      setError('Could not save the van count.');
      setSaving(false);
      return;
    }

    if (!existingId) {
      const newId = (result.data as { id?: string } | null)?.id;
      if (newId) setExistingId(newId);
    }
    setCountedAt(now);
    setSuccess('Van count saved.');
    setSaving(false);
  };

  return (
    <div className={styles.page}>
      <PageHeader title="Van Count" subtitle="Count signs before you leave the yard. The office sees today's total." />

      <Card>
        {loading ? (
          <p className={styles.mutedText}>Loading today&apos;s count...</p>
        ) : (
          <div className={styles.form}>
            {error && <p className="nd-badge nd-badge--danger">{error}</p>}
            {success && <p className="nd-badge nd-badge--success">{success}</p>}

            <div className={styles.totalRow}>
              <span className={styles.totalLabel}>Signs on van</span>
              <span className={styles.totalValue}>{total}</span>
            </div>

            {CATEGORIES.map((category) => (
              <div key={category.key} className={styles.countRow}>
                <div className={styles.countRowText}>
                  <span className={styles.countRowName}>{category.name}</span>
                  <span className={styles.countRowSub}>{category.sub}</span>
                </div>
                <button
                  type="button"
                  className={styles.stepperButton}
                  onClick={() => adjust(category.key, -1)}
                  disabled={saving}
                  aria-label={`Decrease ${category.name}`}
                >
                  –
                </button>
                <span className={styles.countValue}>{counts[category.key]}</span>
                <button
                  type="button"
                  className={`${styles.stepperButton} ${styles.stepperButtonInc}`}
                  onClick={() => adjust(category.key, 1)}
                  disabled={saving}
                  aria-label={`Increase ${category.name}`}
                >
                  +
                </button>
              </div>
            ))}

            <Button size="lg" block loading={saving} disabled={saving} onClick={() => void handleSave()}>
              {saving ? 'Saving…' : 'Save count'}
            </Button>
            {countedAt && <p className={styles.countedAtNote}>Last counted {formatCountedAt(countedAt)}</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
