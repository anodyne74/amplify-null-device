'use client';

import { Dialog } from '@/app/components/ui/feedback/Dialog';
import { Button } from '@/app/components/ui/core/Button';
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  open: boolean;
  /** Preformatted "HH:MM" — the time that will be stamped if OK is pressed. */
  time: string;
  title: string;
  summary: string;
  busy?: boolean;
  onCancel: () => void;
  onOk: () => void;
}

/** Shared Start/Complete confirmation for the four Driver Sign Run work phases (Load,
 * Placement, Pickup, Unload) — every start and completion tap raises this same dialog.
 * Nothing is stamped until OK; Cancel leaves state untouched. */
export function ConfirmDialog({ open, time, title, summary, busy = false, onCancel, onOk }: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      title={
        <>
          <span className={styles.time}>{time}</span>
          <span>{title}</span>
        </>
      }
      description={summary}
      onClose={onCancel}
      footer={
        <div className={styles.footer}>
          <Button variant="secondary" block onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button block onClick={onOk} loading={busy}>
            OK
          </Button>
        </div>
      }
    />
  );
}
