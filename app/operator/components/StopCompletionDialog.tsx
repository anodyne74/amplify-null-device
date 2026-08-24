'use client';

import { useEffect, useState } from 'react';
import { Dialog } from '@/app/components/ui/feedback/Dialog';
import { Button } from '@/app/components/ui/core/Button';
import type { Stop } from '@/amplify/types';
import styles from './StopCompletionDialog.module.css';

export const SKIP_REASONS = [
  'Gate locked / no access',
  'Owner or tenant refused',
  'Signs already on site',
  'No safe placement',
  'Property not ready',
];

interface StopCompletionDialogProps {
  stop: Stop | null;
  phase: 'placement' | 'pickup';
  busy: boolean;
  /** Opens straight to the skip-reason step — used by the primary "Skip" button, which
   * already knows the driver wants to skip rather than complete. */
  initialStep?: 'action' | 'reason';
  onComplete: () => void;
  onSkip: (reason: string) => void;
  onClose: () => void;
}

/** Tap-row-to-sheet completion flow: address/facts + primary action, or the skip-reason picker. */
export function StopCompletionDialog({
  stop,
  phase,
  busy,
  initialStep = 'action',
  onComplete,
  onSkip,
  onClose,
}: StopCompletionDialogProps) {
  const [step, setStep] = useState<'action' | 'reason'>(initialStep);

  useEffect(() => {
    if (stop) setStep(initialStep);
    // Depend on stop?.id, not the stop object itself — stops is refetched with new
    // object references on every save, which would otherwise bounce an in-progress
    // "reason" step back to "action" whenever unrelated stop data refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop?.id, initialStep]);

  if (!stop) return null;

  const primaryLabel = phase === 'pickup' ? 'Signs Picked Up' : 'Signs Placed';
  const address = stop.formattedAddress || stop.address || '';

  if (step === 'reason') {
    return (
      <Dialog open title="Why is this stop skipped?" description={address} onClose={onClose}>
        <div className={styles.reasonList}>
          {SKIP_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              className={styles.reasonButton}
              onClick={() => onSkip(reason)}
              disabled={busy}
            >
              {reason}
            </button>
          ))}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      title={address}
      description={`${stop.numberOfSigns ?? '-'} signs · Agent ${stop.agent?.trim() || 'Unassigned'}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={() => setStep('reason')} disabled={busy}>
            Skip
          </Button>
          <Button onClick={onComplete} loading={busy} disabled={busy}>
            {primaryLabel}
          </Button>
        </>
      }
    />
  );
}
