'use client';

import { useEffect, useRef } from 'react';
import { Toast, type ToastTone } from '@/app/components/ui/feedback/Toast';
import { Button } from '@/app/components/ui/core/Button';
import styles from './UndoToast.module.css';

export const UNDO_WINDOW_MS = 5000;

interface UndoToastProps {
  message: string;
  /** The Stop it's about, so the Operator can tell it's the one they just tapped. */
  description?: string;
  /** Success for placing or collecting; a neutral tone for taking a Stop off the Route, which is not a win. */
  tone?: ToastTone;
  onUndo: () => void;
  /** The window ran out; the settlement stands. */
  onExpire: () => void;
}

/**
 * The few seconds after a Stop is settled in which the Operator can take it back. Sits just above
 * the pinned action bar, not in the corner the global toasts use, which would cover that bar's
 * buttons. Mount it with a key per settlement so each one gets its own window.
 */
export function UndoToast({ message, description, tone = 'success', onUndo, onExpire }: UndoToastProps) {
  // The page re-renders as writes save; the timer must not restart each time.
  const expire = useRef(onExpire);
  expire.current = onExpire;

  useEffect(() => {
    const timer = setTimeout(() => expire.current(), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={styles.dock}>
      <Toast
        className={styles.toast}
        tone={tone}
        title={message}
        description={description}
        action={
          <Button variant="ghost" size="lg" onClick={onUndo}>
            Undo
          </Button>
        }
      />
    </div>
  );
}
