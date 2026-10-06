'use client';

import { useEffect, useState } from 'react';
import { Dialog } from '@/app/components/ui/feedback/Dialog';
import { Button } from '@/app/components/ui/core/Button';
import type { Stop } from '@/amplify/types';
import styles from './StopCompletionDialog.module.css';

/** Why a Stop can't be done, per phase: in Placement it becomes a Removed
 *  Stop, in Pickup it's Couldn't Collect (see CONTEXT.md). */
export const STOP_PROBLEM_REASONS: Record<'placement' | 'pickup', string[]> = {
  placement: [
    'Gate locked / no access',
    'Owner or tenant refused',
    'Signs already on site',
    'No safe placement',
    'Property not ready',
    'Cancelled on the spot',
  ],
  pickup: ['Gate locked / no access', 'Owner or tenant refused', 'Access blocked', 'Not safe to collect'],
};

const PROBLEM_COPY = {
  placement: {
    button: "Can't place",
    title: "Why can't the signs go up?",
    hint: 'The stop comes off the route and its signs stay on the van.',
  },
  pickup: {
    button: "Couldn't collect",
    title: "Why couldn't the signs be collected?",
    hint: 'The signs stay on site until someone goes back for them.',
  },
};

interface StopCompletionDialogProps {
  stop: Stop | null;
  phase: 'placement' | 'pickup';
  /** Opens straight to the reason step — used by the action bar's problem button, which
   * already knows the operator can't do the stop. */
  initialStep?: 'action' | 'reason';
  onComplete: () => void;
  /** Can't place (Placement) or Couldn't collect (Pickup), with the reason picked. */
  onProblem: (reason: string) => void;
  onClose: () => void;
}

/** Tap-row-to-sheet completion flow: address/facts + primary action, or the reason picker. */
export function StopCompletionDialog({
  stop,
  phase,
  initialStep = 'action',
  onComplete,
  onProblem,
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
  const copy = PROBLEM_COPY[phase];

  if (step === 'reason') {
    return (
      <Dialog open title={copy.title} description={`${address} · ${copy.hint}`} onClose={onClose}>
        <div className={styles.reasonList}>
          {STOP_PROBLEM_REASONS[phase].map((reason) => (
            <button
              key={reason}
              type="button"
              className={styles.reasonButton}
              onClick={() => onProblem(reason)}
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
          <Button variant="secondary" onClick={() => setStep('reason')}>
            {copy.button}
          </Button>
          <Button onClick={onComplete}>
            {primaryLabel}
          </Button>
        </>
      }
    />
  );
}
