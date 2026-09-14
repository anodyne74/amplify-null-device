import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from '@/amplify/types';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { ADMIN_PAGE_SIZE, getPageSlice } from '@/app/components/AdminPagination';
import { getFinalizedRouteMinutes } from '@/app/administrator/invoices/routeInvoiceMetrics';
import { formatDuration } from '@/lib/signRunBilling';
import styles from '../page.module.css';

interface UninvoicedRoutesTableProps {
  loading: boolean;
  routes: Route[];
  customerName: (id: string) => string;
}

function formatScheduledDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export default function UninvoicedRoutesTable({ loading, routes, customerName }: UninvoicedRoutesTableProps) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [routes.length]);

  const { currentPage, totalPages, pageRows: pageRoutes } = getPageSlice(routes, page, ADMIN_PAGE_SIZE);

  return (
    <Card title="Completed routes not yet invoiced" padded={loading || routes.length === 0}>
      {loading || routes.length === 0 ? (
        <p className={styles.mutedText}>
          {loading ? 'Loading routes...' : 'No completed routes are waiting to be invoiced.'}
        </p>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className="nd-table nd-table--hoverable" aria-label="Completed routes not yet invoiced">
              <thead>
                <tr>
                  <th scope="col">Route</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Scheduled</th>
                  <th scope="col">Duration</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRoutes.map((route) => (
                  <tr key={route.id}>
                    <td>{route.routeCode ?? route.id.slice(0, 8)}</td>
                    <td>{customerName(route.customerId)}</td>
                    <td>{formatScheduledDate(route.scheduledDate)}</td>
                    <td>{formatDuration(getFinalizedRouteMinutes(route))}</td>
                    <td>
                      <Link
                        href={`/administrator/invoices/generate?routeId=${route.id}&customerId=${route.customerId}`}
                        className="nd-btn nd-btn--primary nd-btn--sm"
                      >
                        Generate invoice
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className={styles.paginationBar} aria-label="uninvoiced routes pagination">
            <p className={styles.paginationSummary} aria-live="polite">
              {`Showing ${(currentPage - 1) * ADMIN_PAGE_SIZE + 1}–${Math.min(routes.length, currentPage * ADMIN_PAGE_SIZE)} of ${routes.length} routes`}
            </p>
            <div className={styles.paginationControls}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
                aria-label="Previous page of uninvoiced routes"
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(currentPage + 1)}
                aria-label="Next page of uninvoiced routes"
              >
                Next
              </Button>
            </div>
          </nav>
        </>
      )}
    </Card>
  );
}
