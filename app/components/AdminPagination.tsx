'use client';

import AdminActionButton from '@/app/components/AdminActionButton';
import styles from '@/app/dashboard.module.css';

import { PAGE_SIZE, getPageRange, getPageSlice } from '@/lib/pagination';

export const ADMIN_PAGE_SIZE = PAGE_SIZE;
export { getPageSlice };

interface AdminPaginationProps {
  /** Current 1-based page (clamped internally). */
  page: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  /** Plural noun for the summary, e.g. "invoices". */
  itemsLabel?: string;
}

export default function AdminPagination({
  page,
  totalItems,
  onPageChange,
  pageSize = ADMIN_PAGE_SIZE,
  itemsLabel = 'items',
}: AdminPaginationProps) {
  if (totalItems <= 0) return null;

  const { currentPage, totalPages, start, end } = getPageRange(totalItems, page, pageSize);

  return (
    <nav className={styles.paginationBar} aria-label={`${itemsLabel} pagination`}>
      <p className={styles.paginationSummary} aria-live="polite">
        Showing {start}–{end} of {totalItems} {itemsLabel}
      </p>
      <div className={styles.paginationControls}>
        <AdminActionButton
          variant="secondary"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          aria-label={`Previous page of ${itemsLabel}`}
        >
          Previous
        </AdminActionButton>
        <AdminActionButton
          variant="secondary"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          aria-label={`Next page of ${itemsLabel}`}
        >
          Next
        </AdminActionButton>
      </div>
    </nav>
  );
}
