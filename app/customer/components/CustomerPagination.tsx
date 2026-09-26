'use client';

import { Button } from '@/app/components/ui/core/Button';
import { PAGE_SIZE, getPageRange } from '@/lib/pagination';
import styles from './CustomerPagination.module.css';

interface CustomerPaginationProps {
  /** Current 1-based page (clamped internally). */
  page: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  /** Plural noun for the summary, e.g. "invoices". */
  itemsLabel?: string;
}

/** Previous/Next pager for customer portal lists; pair with getPageSlice. */
export default function CustomerPagination({
  page,
  totalItems,
  onPageChange,
  pageSize = PAGE_SIZE,
  itemsLabel = 'items',
}: CustomerPaginationProps) {
  if (totalItems <= 0) return null;

  const { currentPage, totalPages, start, end } = getPageRange(totalItems, page, pageSize);

  return (
    <nav className={styles.bar} aria-label={`${itemsLabel} pagination`}>
      <p className={styles.summary} aria-live="polite">
        Showing {start}–{end} of {totalItems} {itemsLabel}
      </p>
      <div className={styles.controls}>
        <Button
          variant="secondary"
          size="sm"
          iconLeft="chevron-left"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          aria-label={`Previous page of ${itemsLabel}`}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          iconRight="chevron-right"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          aria-label={`Next page of ${itemsLabel}`}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
