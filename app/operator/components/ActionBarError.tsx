import styles from './ActionBarError.module.css';

interface ActionBarErrorProps {
  message: string;
  /** An undo toast is showing in the dock below, so sit above it, not on top of it. */
  aboveUndoToast?: boolean;
}

/**
 * A failed Sign Run write, shown just above the pinned action bar where the Operator is
 * looking, not in a banner at the top of a long page. Like UndoToast it leaves the bar's
 * buttons uncovered.
 */
export function ActionBarError({ message, aboveUndoToast = false }: ActionBarErrorProps) {
  return (
    <div className={`${styles.dock} ${aboveUndoToast ? styles.aboveToast : ''}`}>
      <div className={styles.message} role="alert">
        {message}
      </div>
    </div>
  );
}
