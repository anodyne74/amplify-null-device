'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';
import AsyncState from '@/app/components/AsyncState';
import OperatorRoute from '@/app/components/OperatorRoute';
import ConfirmDialog from '@/app/components/ConfirmDialog';
import AdminRowMenu from '@/app/components/AdminRowMenu';
import { isAdmin } from '@/lib/amplify-config';
import { useRoutesList, ROUTE_STATUS_FILTERS, type StatusFilter } from '@/lib/useRoutesList';
import { usePropertySearch } from '@/lib/usePropertySearch';
import { formatRouteDate, formatStopTotals, summariseStopsByRoute } from '@/lib/routeListHelpers';
import { RouteStatusPill } from '@/app/administrator/components/RouteStatusPill';
import { Badge } from '@/app/components/ui/core/Badge';
import { routeFeedbackLabel } from '@/lib/routeFeedback';
import PageHeader from '@/app/administrator/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { Button } from '@/app/components/ui/core/Button';
import { Tag } from '@/app/components/ui/core/Tag';
import { DataTable, type DataColumn } from '@/app/components/ui/data/DataTable';
import { PropertySearchCard } from './PropertySearchCard';
import type { Route } from '@/amplify/types';
import styles from './page.module.css';

function routeDetailHref(route: Route) {
  return `/administrator/routes/detail?id=${route.id}`;
}

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
  const router = useRouter();
  const {
    cancelDeleteRoute,
    customersById,
    deletingRouteId,
    error,
    filteredRoutes,
    handleDeleteRoute,
    loading,
    requestDeleteRoute,
    routePendingDelete,
    setStatusFilter,
    statusFilter,
  } = useRoutesList(canDeleteRoutes);

  // Admin-only refinements layered on top of the hook's status filter.
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Find a property stays out of the way until wanted; a live property match keeps its note below.
  const [findPropertyOpen, setFindPropertyOpen] = useState(false);

  const hasRefinements = searchQuery.trim() !== '' || dateFrom !== '' || dateTo !== '';

  const propertySearch = usePropertySearch(filteredRoutes, customersById);
  const { filterActive: propertyFilterActive, shownRouteIds, focusedRouteId } = propertySearch;
  const stopTotalsByRoute = useMemo(() => summariseStopsByRoute(propertySearch.stops), [propertySearch.stops]);
  const shownRouteIdSet = useMemo(() => new Set(shownRouteIds), [shownRouteIds]);

  // Client-side search (route code / route id / customer name), inclusive
  // Placement Date range filter, and property-search route filter, all
  // composed with the status-filtered list.
  const visibleRoutes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return filteredRoutes.filter((route) => {
      if (propertyFilterActive && !shownRouteIdSet.has(route.id)) return false;

      if (query) {
        const customerName = customersById[route.customerId] || '';
        const matchesQuery = [route.routeCode || '', route.id, customerName].some((value) =>
          value.toLowerCase().includes(query)
        );
        if (!matchesQuery) return false;
      }

      if (dateFrom || dateTo) {
        const placementDate = route.scheduledDate || '';
        if (!placementDate) return false;
        if (dateFrom && placementDate < dateFrom) return false;
        if (dateTo && placementDate > dateTo) return false;
      }

      return true;
    });
  }, [filteredRoutes, customersById, searchQuery, dateFrom, dateTo, propertyFilterActive, shownRouteIdSet]);

  const focusedRoute = focusedRouteId ? filteredRoutes.find((route) => route.id === focusedRouteId) : undefined;
  const focusedRouteLabel = focusedRoute ? focusedRoute.routeCode || focusedRoute.id.slice(0, 8) : null;

  // Routes the date range can't place, because they have no Placement Date yet.
  const hiddenForNoPlacementDate =
    dateFrom || dateTo ? filteredRoutes.filter((route) => !route.scheduledDate).length : 0;

  const activeFilterNames = [
    statusFilter !== 'all' ? `status ${formatStatusFilterLabel(statusFilter).toLowerCase()}` : null,
    searchQuery.trim() ? `search "${searchQuery.trim()}"` : null,
    dateFrom || dateTo
      ? `Placement ${dateFrom ? `from ${formatRouteDate(dateFrom)}` : ''}${dateFrom && dateTo ? ' ' : ''}${dateTo ? `to ${formatRouteDate(dateTo)}` : ''}`
      : null,
    propertyFilterActive ? 'a property match' : null,
  ].filter((name): name is string => name !== null);

  function clearAllFilters() {
    clearRefinements();
    setStatusFilter('all');
    propertySearch.clear();
  }

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
      header: 'Route Code',
      render: (route) => (
        <div>
          <Link
            href={routeDetailHref(route)}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-heading)' }}
          >
            {route.routeCode || `${route.id.slice(0, 8)}...`}
          </Link>
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
      key: 'customer',
      header: 'Customer',
      render: (route) => customersById[route.customerId] || 'Unknown customer',
    },
    {
      key: 'status',
      header: 'Status',
      render: (route) => (
        <div className={styles.statusCell}>
          <RouteStatusPill route={route} />
          {route.customerFeedbackTone === 'issue' && (
            <Badge tone="danger" dot>
              Feedback: {routeFeedbackLabel('issue').toLowerCase()}
            </Badge>
          )}
        </div>
      ),
    },
    { key: 'placementDate', header: 'Placement', render: (route) => formatRouteDate(route.scheduledDate) },
    { key: 'pickupDate', header: 'Pickup', render: (route) => formatRouteDate(route.pickupDate) },
    {
      key: 'stopTotals',
      header: 'Stops and signs',
      render: (route) =>
        propertySearch.stopsLoading ? <span className={styles.notesPreview}>Loading…</span> : formatStopTotals(stopTotalsByRoute.get(route.id)),
    },
    {
      key: 'operator',
      header: 'Operator',
      render: (route) => route.assignedOperatorName || route.assignedOperatorEmail || <span className={styles.unassigned}>Unassigned</span>,
    },
    {
      key: 'action',
      header: <span className={styles.visuallyHidden}>Actions</span>,
      width: 110,
      render: (route: Route) => {
        const routeLabel = route.routeCode || route.id.slice(0, 8);
        return (
          <AdminRowMenu ariaLabel={`Actions for route ${routeLabel}`} align="end">
            <Link
              href={`/administrator/routes/edit?id=${route.id}`}
              className="nd-btn nd-btn--ghost nd-btn--sm"
              aria-label={`Edit route ${routeLabel}`}
            >
              Edit
            </Link>
            {canDeleteRoutes && (
              <Button
                size="sm"
                variant="danger"
                loading={deletingRouteId === route.id}
                onClick={() => requestDeleteRoute(route)}
                aria-label={`Delete route ${routeLabel}`}
              >
                {deletingRouteId === route.id ? 'Deleting...' : 'Delete'}
              </Button>
            )}
          </AdminRowMenu>
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
        <Link href="/administrator/routes/new" className="nd-btn nd-btn--primary nd-btn--md">
          Create your first route
        </Link>
      )}
      onRetry={onRetry}
    >
      <div className={styles.toolbar} role="group" aria-label="Filter routes">
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
          <Field label="Placement from" htmlFor="routes-date-from" className={styles.dateField}>
            <Input
              id="routes-date-from"
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </Field>
          <Field label="Placement to" htmlFor="routes-date-to" className={styles.dateField}>
            <Input
              id="routes-date-to"
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </Field>
          <Button
            variant="ghost"
            aria-expanded={findPropertyOpen}
            aria-controls="routes-find-property"
            onClick={() => setFindPropertyOpen((open) => !open)}
          >
            Find a property
          </Button>
          {hasRefinements && (
            <button type="button" className={styles.clearFiltersBtn} onClick={clearRefinements}>
              Clear filters
            </button>
          )}
        </div>

        <div className={styles.filterRow} role="group" aria-labelledby="routes-status-label">
          <span id="routes-status-label" className={styles.filterLabel}>Status</span>
          {ROUTE_STATUS_FILTERS.map((status) => (
            <Tag key={status} selected={statusFilter === status} onClick={() => setStatusFilter(status)}>
              {formatStatusFilterLabel(status)}
            </Tag>
          ))}
        </div>
      </div>

      {findPropertyOpen && (
        <div id="routes-find-property">
          <PropertySearchCard search={propertySearch} />
        </div>
      )}

      {propertyFilterActive && (
        <div className={styles.propertyFilterBar}>
          <p className={styles.propertyFilterNote} role="status">
            {focusedRouteLabel
              ? `Showing ${focusedRouteLabel} only`
              : `Showing ${visibleRoutes.length} of ${filteredRoutes.length} routes with a property match`}
          </p>
          <button type="button" className={styles.clearFiltersBtn} onClick={propertySearch.clear}>
            Show all routes
          </button>
        </div>
      )}

      {hasRefinements && (
        <p className={styles.resultCount} role="status">
          Showing {visibleRoutes.length} of {filteredRoutes.length} routes
          {hiddenForNoPlacementDate > 0 &&
            ` (${hiddenForNoPlacementDate} without a Placement Date ${hiddenForNoPlacementDate === 1 ? 'is' : 'are'} hidden by the date range)`}
        </p>
      )}

      {visibleRoutes.length === 0 ? (
        <div className={styles.emptyFiltered} role="status">
          <p className={styles.resultCount}>
            No routes found{activeFilterNames.length > 0 ? ` for ${activeFilterNames.join(', ')}` : ''}.
          </p>
          {activeFilterNames.length > 0 && (
            <button type="button" className={styles.clearFiltersBtn} onClick={clearAllFilters}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <Card padded={false}>
          <div className={styles.tableWrap}>
            <DataTable
              columns={columns}
              rows={visibleRoutes}
              wrapped={false}
              onRowClick={(route) => router.push(routeDetailHref(route))}
            />
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={routePendingDelete !== null}
        title="Delete route?"
        message={`Delete route ${routePendingDelete?.routeCode || routePendingDelete?.id.slice(0, 8)}? This will also delete all stops on the route.`}
        confirmLabel="Delete"
        tone="danger"
        busy={deletingRouteId === routePendingDelete?.id}
        onConfirm={() => {
          if (routePendingDelete) void handleDeleteRoute(routePendingDelete);
        }}
        onCancel={cancelDeleteRoute}
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
