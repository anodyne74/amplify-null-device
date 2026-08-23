'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuthenticator } from '@aws-amplify/ui-react';
import AsyncState from '@/app/components/AsyncState';
import OperatorRoute from '@/app/components/OperatorRoute';
import { isAdmin } from '@/lib/amplify-config';
import { useRoutesList, ROUTE_STATUS_FILTERS, type StatusFilter } from '@/lib/useRoutesList';
import { formatRouteDate, formatRouteDuration } from '@/lib/routeListHelpers';
import { RouteStatusPill } from '@/app/administrator/components/RouteStatusPill';
import PageHeader from '@/app/administrator/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { Button } from '@/app/components/ui/core/Button';
import { DataTable, type DataColumn } from '@/app/components/ui/data/DataTable';
import type { Route } from '@/amplify/types';
import styles from './page.module.css';

function formatStatusFilterLabel(status: StatusFilter) {
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
}

interface RoutesListSectionProps {
  canDeleteRoutes: boolean;
  onRetry: () => void;
}

/**
 * Owns the routes data fetch via useRoutesList. Mounted with a key from the
 * parent so Retry can remount it and re-run the fetch effect.
 */
function RoutesListSection({ canDeleteRoutes, onRetry }: RoutesListSectionProps) {
  const {
    customersById,
    deletingRouteId,
    error,
    filteredRoutes,
    handleDeleteRoute,
    loading,
    setStatusFilter,
    statusFilter,
  } = useRoutesList(canDeleteRoutes);

  // Admin-only refinements layered on top of the hook's status filter.
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const hasRefinements = searchQuery.trim() !== '' || dateFrom !== '' || dateTo !== '';

  // Client-side search (route code / route id / customer name) and inclusive
  // createdAt date-range filter, composed with the status-filtered list.
  const visibleRoutes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return filteredRoutes.filter((route) => {
      if (query) {
        const customerName = customersById[route.customerId] || '';
        const matchesQuery = [route.routeCode || '', route.id, customerName].some((value) =>
          value.toLowerCase().includes(query)
        );
        if (!matchesQuery) return false;
      }

      if (dateFrom || dateTo) {
        const createdDate = (route.createdAt || '').slice(0, 10);
        if (!createdDate) return false;
        if (dateFrom && createdDate < dateFrom) return false;
        if (dateTo && createdDate > dateTo) return false;
      }

      return true;
    });
  }, [filteredRoutes, customersById, searchQuery, dateFrom, dateTo]);

  function clearRefinements() {
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
  }

  // Only treat the unfiltered list as "empty" — when a status filter is active,
  // the inline table renders its own empty message below the filter row.
  const isEmpty = !loading && !error && statusFilter === 'all' && filteredRoutes.length === 0;

  const columns: DataColumn<Route>[] = [
    {
      key: 'routeCode',
      header: 'Route ID',
      render: (route) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-heading)' }}>
          {route.routeCode || `${route.id.slice(0, 8)}...`}
        </span>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (route) => customersById[route.customerId] || 'Unknown customer',
    },
    { key: 'status', header: 'Status', render: (route) => <RouteStatusPill status={route.status} /> },
    { key: 'created', header: 'Created', render: (route) => formatRouteDate(route.createdAt) },
    {
      key: 'duration',
      header: 'Duration',
      render: (route) => (
        <div>
          {formatRouteDuration(route)}
          {route.notes && (
            <div className={styles.notesPreview}>
              {route.notes.slice(0, 60)}
              {route.notes.length > 60 ? '…' : ''}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'action',
      header: '',
      width: canDeleteRoutes ? 220 : 90,
      render: (route) => {
        const routeLabel = route.routeCode || route.id.slice(0, 8);
        return (
          <div className={styles.actionsCell}>
            <a href={`/administrator/routes/detail?id=${route.id}`} className="nd-btn nd-btn--secondary nd-btn--sm">
              View
            </a>
            {canDeleteRoutes && (
              <a href={`/administrator/routes/edit?id=${route.id}`} className="nd-btn nd-btn--secondary nd-btn--sm">
                Edit
              </a>
            )}
            {canDeleteRoutes && (
              <Button
                size="sm"
                variant="danger"
                loading={deletingRouteId === route.id}
                onClick={() => void handleDeleteRoute(route)}
                aria-label={`Delete route ${routeLabel}`}
              >
                {deletingRouteId === route.id ? 'Deleting...' : 'Delete'}
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <AsyncState
      loading={loading}
      error={error}
      empty={isEmpty}
      loadingMessage="Loading routes..."
      emptyMessage="No routes found. Routes you create will appear here."
      emptyAction={(
        <Link href="/administrator/routes/new" className={styles.emptyStateCta}>
          Create your first route
        </Link>
      )}
      onRetry={onRetry}
    >
      <div className={styles.searchFilterRow}>
        <Field label="Search" htmlFor="routes-search" className={styles.searchField}>
          <Input
            id="routes-search"
            type="search"
            placeholder="Route code, ID, or customer"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </Field>
        <Field label="Created from" htmlFor="routes-date-from" className={styles.dateField}>
          <Input
            id="routes-date-from"
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </Field>
        <Field label="Created to" htmlFor="routes-date-to" className={styles.dateField}>
          <Input
            id="routes-date-to"
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </Field>
        {hasRefinements && (
          <button type="button" className={styles.clearFiltersBtn} onClick={clearRefinements}>
            Clear filters
          </button>
        )}
      </div>

      {hasRefinements && (
        <p className={styles.resultCount} role="status">
          Showing {visibleRoutes.length} of {filteredRoutes.length} routes
        </p>
      )}

      <div className={styles.filterRow}>
        <span className={styles.filterLabel}>Status:</span>
        {ROUTE_STATUS_FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            className={`${styles.filterBtn} ${statusFilter === status ? styles.filterBtnActive : ''}`}
          >
            {formatStatusFilterLabel(status)}
          </button>
        ))}
      </div>

      {visibleRoutes.length === 0 ? (
        <p className={styles.resultCount}>No routes found.</p>
      ) : (
        <Card padded={false}>
          <div className={styles.tableWrap}>
            <DataTable columns={columns} rows={visibleRoutes} wrapped={false} />
          </div>
        </Card>
      )}
    </AsyncState>
  );
}

export default function AdministratorRoutesPage() {
  const { user } = useAuthenticator();
  const canDeleteRoutes = isAdmin(user);
  const [retryKey, setRetryKey] = useState(0);

  return (
    <OperatorRoute requireAdmin>
      <div className={styles.page}>
        <PageHeader
          title="Routes"
          subtitle="Plan and manage delivery routes across all customers."
          actions={
            <Link href="/administrator/routes/new" className="nd-btn nd-btn--primary nd-btn--md">
              Create New Route
            </Link>
          }
        />

        <RoutesListSection
          key={retryKey}
          canDeleteRoutes={canDeleteRoutes}
          onRetry={() => setRetryKey((value) => value + 1)}
        />
      </div>
    </OperatorRoute>
  );
}
