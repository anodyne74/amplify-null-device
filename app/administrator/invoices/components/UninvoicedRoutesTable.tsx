import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from '@/amplify/types';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { getFinalizedRouteDurationMinutes } from '@/lib/routeListHelpers';
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
  const router = useRouter();
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  // Drop the selection if its route left the list (e.g. it was just invoiced).
  useEffect(() => {
    if (selectedRouteId && !routes.some((route) => route.id === selectedRouteId)) {
      setSelectedRouteId(null);
    }
  }, [routes, selectedRouteId]);

  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? null;

  const handleGenerateInvoice = () => {
    if (!selectedRoute) return;
    router.push(`/administrator/invoices/generate?routeId=${selectedRoute.id}&customerId=${selectedRoute.customerId}`);
  };

  return (
    <Card
      title="Completed routes not yet invoiced"
      subtitle="Select a route to bill — one route per invoice"
      padded={loading || routes.length === 0}
    >
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
                  <th scope="col" aria-hidden="true" />
                  <th scope="col">Route</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Driver</th>
                  <th scope="col">Scheduled</th>
                  <th scope="col">Duration</th>
                  <th scope="col">Stops</th>
                  <th scope="col">Signs</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((route) => {
                  const routeLabel = route.routeCode ?? route.id.slice(0, 8);
                  return (
                    <tr key={route.id}>
                      <td>
                        <input
                          type="radio"
                          name="uninvoiced-route"
                          className={styles.radio}
                          checked={selectedRouteId === route.id}
                          onChange={() => setSelectedRouteId(route.id)}
                          aria-label={`Select route ${routeLabel} to invoice`}
                        />
                      </td>
                      <td>{routeLabel}</td>
                      <td>{customerName(route.customerId)}</td>
                      <td>{route.assignedOperatorName ?? '—'}</td>
                      <td>{formatScheduledDate(route.scheduledDate)}</td>
                      <td>{formatDuration(getFinalizedRouteDurationMinutes(route))}</td>
                      <td className={styles.numericCell}>{route.overrideStops ?? '—'}</td>
                      <td className={styles.numericCell}>{route.overrideSigns ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className={styles.uninvoicedFooter}>
            <p className={styles.uninvoicedFooterSummary}>
              {selectedRoute
                ? `${customerName(selectedRoute.customerId)} · ${selectedRoute.routeCode ?? selectedRoute.id.slice(0, 8)}`
                : 'Select a route above to generate its invoice.'}
            </p>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={!selectedRoute}
              onClick={handleGenerateInvoice}
            >
              Generate invoice
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
