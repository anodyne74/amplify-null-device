'use client';

import styles from './LoadingSpinner.module.css';

/**
 * Loading Spinner Component
 * Shows a centered spinner during data loading
 */
export default function LoadingSpinner({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.spinner} />
      <p className={styles.message}>{message}</p>
    </div>
  );
}
