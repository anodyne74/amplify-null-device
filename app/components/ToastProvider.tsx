'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Toast } from '@/app/components/ui/feedback/Toast';
import styles from './ToastProvider.module.css';

export type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  /** Show a toast. Success/info auto-dismiss; errors stay until dismissed. */
  showToast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const AUTO_DISMISS_MS = 5000;

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextIdRef.current++;
      setToasts((current) => [...current, { id, tone, message }]);
      if (tone !== 'error') {
        setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
      }
    },
    [dismissToast]
  );

  const contextValue = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className={styles.viewport} aria-live="polite" aria-label="Notifications">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            tone={toast.tone}
            title={toast.message}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            onDismiss={() => dismissToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
