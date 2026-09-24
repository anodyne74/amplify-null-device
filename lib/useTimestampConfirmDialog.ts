'use client';

import { useState } from 'react';

/**
 * The "confirm this at a captured timestamp" dialog pattern shared by every
 * Driver Sign Run phase screen's start/complete actions: open captures
 * `Date.now()` as the ISO time shown/submitted, close is blocked mid-submit,
 * and `kind` distinguishes which action the dialog is currently confirming.
 * Title/summary copy and the onOk handler stay with each caller — those are
 * genuinely per-screen, not boilerplate.
 */
export function useTimestampConfirmDialog<K extends string>() {
  const [dialog, setDialog] = useState<{ kind: K; time: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const openDialog = (kind: K) => setDialog({ kind, time: new Date().toISOString() });
  const closeDialog = () => {
    if (!submitting) setDialog(null);
  };

  return { dialog, openDialog, closeDialog, submitting, setSubmitting };
}
