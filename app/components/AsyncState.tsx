'use client';

import LoadingSpinner from './LoadingSpinner';
import styles from './AsyncState.module.css';

interface AsyncStateProps {
  loading: boolean;
  error?: string | null;
  /** When true (and not loading/error), renders the empty state instead of children. */
  empty?: boolean;
  loadingMessage?: string;
  emptyMessage?: string;
  /** Optional call to action rendered under the empty message, e.g. a "Create" link. */
  emptyAction?: React.ReactNode;
  /** When provided, the error state shows a Retry button wired to this callback. */
  onRetry?: () => void;
  children: React.ReactNode;
}

/**
 * Async State Wrapper
 * Standard loading / error / empty handling for data-fetching pages, so every
 * page presents the same spinner, a retryable error, and an actionable empty state.
 */
export default function AsyncState({
  loading,
  error,
  empty = false,
  loadingMessage = 'Loading...',
  emptyMessage = 'Nothing here yet.',
  emptyAction,
  onRetry,
  children,
}: AsyncStateProps) {
  if (loading) {
    return <LoadingSpinner message={loadingMessage} />;
  }

  if (error) {
    return (
      <div className={styles.errorState} role="alert">
        <p className={styles.errorMessage}>{error}</p>
        {onRetry && (
          <button type="button" className={styles.retryButton} onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    );
  }

  if (empty) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyMessage}>{emptyMessage}</p>
        {emptyAction}
      </div>
    );
  }

  return <>{children}</>;
}
