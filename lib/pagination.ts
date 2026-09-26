/**
 * Client-side pagination shared by the admin and customer portals: both page
 * a fully fetched list 25 rows at a time.
 */
export const PAGE_SIZE = 25;

/**
 * Clamp a 1-based page number to the available range and work out which
 * items (1-based, inclusive) it shows. Keeps pages valid when the result set
 * shrinks.
 */
export function getPageRange(totalItems: number, page: number, pageSize: number = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  return {
    currentPage,
    totalPages,
    start: (currentPage - 1) * pageSize + 1,
    end: Math.min(totalItems, currentPage * pageSize),
  };
}

/** The rows for a 1-based page, clamped as in getPageRange. */
export function getPageSlice<T>(rows: T[], page: number, pageSize: number = PAGE_SIZE) {
  const { currentPage, totalPages, start } = getPageRange(rows.length, page, pageSize);
  return {
    currentPage,
    totalPages,
    pageRows: rows.slice(start - 1, start - 1 + pageSize),
  };
}
