'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import OperatorRoute from '@/app/components/OperatorRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import { Button } from '@/app/components/ui/core/Button';
import { getCustomer } from '@/lib/customers';
import { useRouteWithStops } from '@/lib/useRouteWithStops';
import { formatRouteDate } from '@/lib/routeDetailHelpers';
import { routeReference, routeSheetStops } from '@/lib/routeSheet';
import styles from './page.module.css';

function RouteSheetContent() {
  const routeId = useSearchParams().get('id');
  const { route, stops, loading, error } = useRouteWithStops(routeId);
  const [customerName, setCustomerName] = useState('');

  const customerId = route?.customerId;
  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    getCustomer(customerId)
      .then((customer) => {
        if (!cancelled) setCustomerName(customer?.name ?? '');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (loading) return <LoadingSpinner message="Loading route..." />;
  if (error || !route) return <p role="alert">{error ?? 'Route not found.'}</p>;

  const rows = routeSheetStops(stops);

  return (
    <div className={styles.sheet}>
      <div className={styles.toolbar}>
        <Button size="sm" onClick={() => window.print()}>
          Print
        </Button>
      </div>

      <header className={styles.header}>
        <h1 className={styles.title}>Route {routeReference(route)}</h1>
        <dl className={styles.details}>
          <div>
            <dt>Customer</dt>
            <dd>{customerName || '—'}</dd>
          </div>
          <div>
            <dt>Operator</dt>
            <dd>{route.assignedOperatorName || '—'}</dd>
          </div>
          <div>
            <dt>Placement Date</dt>
            <dd>{formatRouteDate(route.scheduledDate)}</dd>
          </div>
          <div>
            <dt>Pickup Date</dt>
            <dd>{formatRouteDate(route.pickupDate)}</dd>
          </div>
        </dl>
      </header>

      <table className={styles.stops}>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Address</th>
            <th scope="col">Agent</th>
            <th scope="col">Signs</th>
            <th scope="col">Notes</th>
            <th scope="col">Place</th>
            <th scope="col">Pickup</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((stop) => (
            <tr key={stop.id}>
              <td>{stop.row}</td>
              <td>
                {stop.address}
                {stop.isAuction && <span className={styles.auction}>AUCTION</span>}
              </td>
              <td>{stop.agent}</td>
              <td>{stop.numberOfSigns}</td>
              <td>{stop.notes}</td>
              <td>
                <span className={styles.box} aria-label={`Place ${stop.row}`} />
              </td>
              <td>
                <span className={styles.box} aria-label={`Pickup ${stop.row}`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RouteSheetPage() {
  return (
    <OperatorRoute requireAdmin>
      <Suspense fallback={<LoadingSpinner message="Loading route..." />}>
        <RouteSheetContent />
      </Suspense>
    </OperatorRoute>
  );
}
