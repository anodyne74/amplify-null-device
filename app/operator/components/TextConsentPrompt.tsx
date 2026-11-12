'use client';

import { Dialog } from '@/app/components/ui/feedback/Dialog';
import { Button } from '@/app/components/ui/core/Button';
import { useTextConsent } from '@/lib/useTextConsent';
import styles from './TextConsentPrompt.module.css';

/**
 * Asks an Operator once whether we may text them about their Routes (Text
 * Consent, ADR 0016). Shown only while their answer is unset and they have a
 * mobile; closing it without choosing counts as no. If the answer can't be
 * saved it stays up with the error, so a failure is never taken for a no.
 */
export function TextConsentPrompt({ userId }: { userId: string | undefined }) {
  const { shouldAsk, saving, saveError, answer } = useTextConsent(userId);

  return (
    <Dialog
      open={shouldAsk}
      title="May we text you about your Routes?"
      description="We'll text your mobile when a Route is assigned to you. You can change this any time in Settings."
      onClose={saving ? undefined : () => void answer('no')}
      footer={
        <div className={styles.footer}>
          <Button variant="secondary" block onClick={() => void answer('no')} disabled={saving}>
            No
          </Button>
          <Button block onClick={() => void answer('yes')} loading={saving}>
            Yes
          </Button>
        </div>
      }
    >
      {saveError && (
        <p className={styles.error} role="alert">
          {saveError}
        </p>
      )}
    </Dialog>
  );
}
