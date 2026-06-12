'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuthenticator } from '@aws-amplify/ui-react';
import AdminActionButton from '@/app/components/AdminActionButton';
import AdminSectionHeader from '@/app/components/AdminSectionHeader';
import AsyncState from '@/app/components/AsyncState';
import OperatorRoute from '@/app/components/OperatorRoute';
import RoutesListContent from '@/app/components/RoutesListContent';
import { isAdmin } from '@/lib/amplify-config';
import { useRoutesList } from '@/lib/useRoutesList';
import dashboardStyles from '@/app/dashboard.module.css';
import styles from './page.module.css';

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
  // RoutesListContent renders its own empty message below the filter row.
  const isEmpty = !loading && !error && statusFilter === 'all' && filteredRoutes.length === 0;

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
        <div className={styles.searchField}>
          <label htmlFor="routes-search" className={styles.filterFieldLabel}>
            Search
          </label>
          <input
            id="routes-search"
            type="search"
            className={styles.searchInput}
            placeholder="Route code, ID, or customer"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
        <div className={styles.dateField}>
          <label htmlFor="routes-date-from" className={styles.filterFieldLabel}>
            Created from
          </label>
          <input
            id="routes-date-from"
            type="date"
            className={styles.dateInput}
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </div>
        <div className={styles.dateField}>
          <label htmlFor="routes-date-to" className={styles.filterFieldLabel}>
            Created to
          </label>
          <input
            id="routes-date-to"
            type="date"
            className={styles.dateInput}
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </div>
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

      <RoutesListContent
        canDeleteRoutes={canDeleteRoutes}
        classes={styles}
        customersById={customersById}
        deletingRouteId={deletingRouteId}
        error={null}
        filteredRoutes={visibleRoutes}
        getDetailHref={(route) => `/administrator/routes/detail?id=${route.id}`}
        getEditHref={(route) => `/administrator/routes/edit?id=${route.id}`}
        loading={false}
        onDeleteRoute={(route) => {
          void handleDeleteRoute(route);
        }}
        onStatusFilterChange={setStatusFilter}
        showEditLink={true}
        statusFilter={statusFilter}
      />
    </AsyncState>
  );
}

export default function AdministratorRoutesPage() {
  const { user } = useAuthenticator();
  const canDeleteRoutes = isAdmin(user);
  const [retryKey, setRetryKey] = useState(0);

  return (
    <OperatorRoute requireAdmin>
      <div className={dashboardStyles.page}>
        <h1 className={dashboardStyles.heading}>Routes</h1>

        <div className={dashboardStyles.infoPanel}>
          <AdminSectionHeader
            title="Route List"
            description="Plan and manage delivery routes across all customers."
            actions={(
              <Link href="/administrator/routes/new" className={styles.createRouteLink}>
                <AdminActionButton variant="primary">Create New Route</AdminActionButton>
              </Link>
            )}
          />

          <RoutesListSection
            key={retryKey}
            canDeleteRoutes={canDeleteRoutes}
            onRetry={() => setRetryKey((value) => value + 1)}
          />
        </div>
      </div>
    </OperatorRoute>
  );
}
