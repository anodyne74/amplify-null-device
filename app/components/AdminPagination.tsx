'use client';

import AdminActionButton from '@/app/components/AdminActionButton';
import styles from '@/app/dashboard.module.css';

export const ADMIN_PAGE_SIZE = 25;

/**
 * Clamp a 1-based page number to the available range and return the rows
 * for that page. Keeps pages valid when the result set shrinks.
 */
export function getPageSlice<T>(rows: T[], page: number, pageSize: number = ADMIN_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  return {
    currentPage,
    totalPages,
    pageRows: rows.slice(start, start + pageSize),
  };
}

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

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(totalItems, currentPage * pageSize);

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
