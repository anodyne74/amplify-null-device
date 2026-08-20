import styles from '@/app/dashboard.module.css';

interface AdminListStateProps {
  loading?: boolean;
  empty?: boolean;
  loadingMessage?: string;
  emptyMessage?: string;
}

export default function AdminListState({
  loading = false,
  empty = false,
  loadingMessage = 'Loading...',
  emptyMessage = 'No items yet.',
}: AdminListStateProps) {
  if (loading) {
    return <p className={styles.welcome}>{loadingMessage}</p>;
  }

  if (empty) {
    return <p className={styles.welcome}>{emptyMessage}</p>;
  }

  return null;
}