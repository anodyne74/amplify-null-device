'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';
import AsyncState from '@/app/components/AsyncState';
import OperatorRoute from '@/app/components/OperatorRoute';
import ConfirmDialog from '@/app/components/ConfirmDialog';
import AdminRowMenu from '@/app/components/AdminRowMenu';
import { isAdmin } from '@/lib/amplify-config';
import { useRoutesList, ROUTE_STATUS_FILTERS, type StatusFilter } from '@/lib/useRoutesList';
import { useAdminTableSort } from '@/app/components/AdminDataTable';
import { usePropertySearch } from '@/lib/usePropertySearch';
import { useIsNarrowViewport } from '@/lib/useIsNarrowViewport';
import { compareRoutesBy, formatRouteDate, formatStopTotals, localToday, routeLabel, NEEDS_ATTENTION_RULE, routeNeedsAttention, routePickupOverdue, routeUnassigned, summariseStopsByRoute, type RouteSortKey } from '@/lib/routeListHelpers';
import { RouteStatusPill } from '@/app/administrator/components/RouteStatusPill';
import { Badge } from '@/app/components/ui/core/Badge';
import { routeFeedbackLabel } from '@/lib/routeFeedback';
import PageHeader from '@/app/administrator/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { Checkbox } from '@/app/components/ui/forms/Checkbox';
import { Button } from '@/app/components/ui/core/Button';
import { Tag } from '@/app/components/ui/core/Tag';
import { Icon } from '@/app/components/ui/core/Icon';
import { DataTable, type DataColumn } from '@/app/components/ui/data/DataTable';
import { PropertySearchCard } from './PropertySearchCard';
import { AssignOperatorDialog } from './AssignOperatorDialog';
import type { Route } from '@/amplify/types';
import styles from './page.module.css';

const ASSIGN_OPERATOR_ID = 'routes-assign-operator';

function routeDetailHref(route: Route) {
  return `/administrator/routes/detail?id=${route.id}`;
}

// Below this the table can't hold every column, so Stops and signs moves under the Route Code and
// Placement and Pickup share one Dates cell.
const NARROW_TABLE_MAX_WIDTH = 1279;

const SORT_LABELS: Record<RouteSortKey, string> = {
  placementDate: 'Placement',
  pickupDate: 'Pickup',
  customer: 'Customer',
  status: 'Status',
};

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
    customersFailed,
    deletingRouteId,
    error,
    filteredRoutes,
    handleDeleteRoute,
    loading,
    reloadCustomers,
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

  // null keeps the hook's default order (latest Placement Date first).
  const { sortBy, sortDirection, toggleSort } = useAdminTableSort<RouteSortKey>();

  const [needsAttention, setNeedsAttention] = useState(false);

  const hasRefinements = searchQuery.trim() !== '' || dateFrom !== '' || dateTo !== '' || needsAttention;

  const propertySearch = usePropertySearch(filteredRoutes, customersById);
  const { filterActive: propertyFilterActive, shownRouteIds, focusedRouteId } = propertySearch;
  const stopTotalsByRoute = useMemo(() => summariseStopsByRoute(propertySearch.stops), [propertySearch.stops]);
  const shownRouteIdSet = useMemo(() => new Set(shownRouteIds), [shownRouteIds]);

  // Client-side search (route code / route id / customer name), inclusive
  // Placement Date range filter, and property-search route filter, all
  // composed with the status-filtered list.
  const visibleRoutes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const today = localToday();

    const matching = filteredRoutes.filter((route) => {
      if (propertyFilterActive && !shownRouteIdSet.has(route.id)) return false;

      if (needsAttention && !routeNeedsAttention(route, today)) return false;

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

    return sortBy ? [...matching].sort(compareRoutesBy(sortBy, sortDirection, customersById)) : matching;
  }, [filteredRoutes, customersById, searchQuery, dateFrom, dateTo, needsAttention, propertyFilterActive, shownRouteIdSet, sortBy, sortDirection]);

  // Selected Routes, by id. Anything that changes which Routes are shown starts the selection over, so it
  // never holds a Route the administrator can't see; a Route that goes away (deleted) drops out below.
  // Sorting only reorders the same Routes, so it is not part of the scope.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [selectionReset, setSelectionReset] = useState(false);
  const selectedSize = useRef(0);
  const shownScope = [statusFilter, searchQuery, dateFrom, dateTo, needsAttention, propertyFilterActive, focusedRouteId].join('|');
  useEffect(() => {
    selectedSize.current = selectedIds.size;
    if (selectedIds.size > 0) setSelectionReset(false);
  }, [selectedIds]);
  useEffect(() => {
    if (selectedSize.current > 0) setSelectionReset(true);
    setSelectedIds(new Set());
  }, [shownScope]);

  const [assignOpen, setAssignOpen] = useState(false);
  const selectedCount = visibleRoutes.filter((route) => selectedIds.has(route.id)).length;
  const allShownSelected = visibleRoutes.length > 0 && selectedCount === visibleRoutes.length;

  function toggleSelected(routeId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (!next.delete(routeId)) next.add(routeId);
      return next;
    });
  }

  const today = localToday();
  const needsAttentionCount = useMemo(
    () => filteredRoutes.filter((route) => routeNeedsAttention(route, today)).length,
    [filteredRoutes, today]
  );
  const focusedRoute = focusedRouteId ? filteredRoutes.find((route) => route.id === focusedRouteId) : undefined;
  const focusedRouteLabel = focusedRoute ? routeLabel(focusedRoute) : null;

  // Routes the date range can't place, because they have no Placement Date yet.
  const hiddenForNoPlacementDate =
    dateFrom || dateTo ? filteredRoutes.filter((route) => !route.scheduledDate).length : 0;

  // Every filter that is on, with how to turn it off. Drives the removable tags, the empty-state
  // message and the one Clear filters button.
  const appliedFilters: { key: string; label: string; remove: () => void }[] = [
    statusFilter !== 'all'
      ? { key: 'status', label: `Status: ${formatStatusFilterLabel(statusFilter)}`, remove: () => setStatusFilter('all') }
      : null,
    searchQuery.trim()
      ? { key: 'search', label: `Search: "${searchQuery.trim()}"`, remove: () => setSearchQuery('') }
      : null,
    dateFrom || dateTo
      ? {
          key: 'placement',
          label: `Placement ${dateFrom ? `from ${formatRouteDate(dateFrom)}` : ''}${dateFrom && dateTo ? ' ' : ''}${dateTo ? `to ${formatRouteDate(dateTo)}` : ''}`,
          remove: () => {
            setDateFrom('');
            setDateTo('');
          },
        }
      : null,
    needsAttention ? { key: 'attention', label: 'Needs attention', remove: () => setNeedsAttention(false) } : null,
    propertyFilterActive ? { key: 'property', label: 'Property match', remove: propertySearch.clear } : null,
  ].filter((filter): filter is { key: string; label: string; remove: () => void } => filter !== null);

  function clearAllFilters() {
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
    setNeedsAttention(false);
    setStatusFilter('all');
    propertySearch.clear();
  }

  // Only treat the unfiltered list as "empty" — when a status filter is active,
  // the inline table renders its own empty message below the filter row.
  const isEmpty = !loading && !error && statusFilter === 'all' && filteredRoutes.length === 0;

  const narrowTable = useIsNarrowViewport(NARROW_TABLE_MAX_WIDTH);

  function stopTotalsCell(route: Route) {
    if (propertySearch.stopsLoading) return <span className={styles.totalsSkeleton} aria-hidden="true" />;
    if (propertySearch.stopsFailed) return <span className={styles.unavailable}>Unavailable</span>;
    return formatStopTotals(stopTotalsByRoute.get(route.id));
  }

  function pickupDate(route: Route) {
    return routePickupOverdue(route, today) ? (
      <span className={styles.dateWithFlag}>
        <span className={styles.overdueDate}>{formatRouteDate(route.pickupDate)}</span>
        <Badge tone="danger" size="sm">Overdue</Badge>
      </span>
    ) : (
      formatRouteDate(route.pickupDate)
    );
  }

  // The one Dates header keeps both sorts: DataTable's own sort header is one button per column.
  function dateSortButton(key: 'placementDate' | 'pickupDate') {
    const shown = sortBy ? { key: sortBy, direction: sortDirection } : { key: 'placementDate', direction: 'desc' };
    const active = shown.key === key;
    return (
      <button type="button" className="nd-table__sort" onClick={() => toggleSort(key)}>
        {SORT_LABELS[key]}
        <Icon
          name={active ? (shown.direction === 'asc' ? 'arrow-up' : 'arrow-down') : 'chevrons-up-down'}
          size={14}
          className={active ? undefined : 'nd-table__sort-idle'}
        />
      </button>
    );
  }

  const allColumns: DataColumn<Route>[] = [
    {
      key: 'select',
      header: (
        <Checkbox
          aria-label={`Select all ${visibleRoutes.length} ${visibleRoutes.length === 1 ? 'route' : 'routes'} shown`}
          checked={allShownSelected}
          indeterminate={selectedCount > 0 && !allShownSelected}
          onChange={() => setSelectedIds(allShownSelected ? new Set() : new Set(visibleRoutes.map((route) => route.id)))}
        />
      ),
      width: 48,
      render: (route) => (
        <div className={styles.selectCell}>
          <Checkbox
            aria-label={`Select route ${routeLabel(route)}`}
            checked={selectedIds.has(route.id)}
            onChange={() => toggleSelected(route.id)}
          />
          {selectedIds.has(route.id) && (
            <button
              type="button"
              className={styles.jumpToActions}
              onClick={() => document.getElementById(ASSIGN_OPERATOR_ID)?.focus()}
            >
              Go to selection actions
            </button>
          )}
        </div>
      ),
    },
    {
      key: 'routeCode',
      header: 'Route Code',
      render: (route) => (
        <div>
          <Link href={routeDetailHref(route)} className={styles.routeCodeLink}>
            {routeLabel(route)}
          </Link>
          {narrowTable && <div className={styles.notesPreview}>{stopTotalsCell(route)}</div>}
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
      sortKey: 'customer',
      render: (route) => customersById[route.customerId] || (customersFailed ? '—' : 'Unknown customer'),
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
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
    { key: 'placementDate', header: 'Placement', sortKey: 'placementDate', render: (route) => formatRouteDate(route.scheduledDate) },
    { key: 'pickupDate', header: 'Pickup', sortKey: 'pickupDate', render: pickupDate },
    {
      key: 'dates',
      header: (
        <span className={styles.dateSorts}>
          {dateSortButton('placementDate')}
          {dateSortButton('pickupDate')}
        </span>
      ),
      render: (route) => (
        <div className={styles.datesCell}>
          <span>
            <span className={styles.dateLabel}>Placement</span> {formatRouteDate(route.scheduledDate)}
          </span>
          <span>
            <span className={styles.dateLabel}>Pickup</span> {pickupDate(route)}
          </span>
        </div>
      ),
    },
    {
      key: 'stopTotals',
      header: 'Stops and signs',
      numeric: true,
      render: stopTotalsCell,
    },
    {
      key: 'operator',
      header: 'Operator',
      render: (route) => routeUnassigned(route) ? <span className={styles.unassigned}>Unassigned</span> : route.assignedOperatorName || route.assignedOperatorEmail,
    },
    {
      key: 'action',
      header: <span className={styles.visuallyHidden}>Actions</span>,
      width: 170,
      render: (route: Route) => {
        const label = routeLabel(route);
        return (
          <div className={styles.rowActions}>
            <Link
              href={`/administrator/routes/edit?id=${route.id}`}
              className="nd-btn nd-btn--ghost nd-btn--sm"
              aria-label={`Edit route ${label}`}
            >
              Edit
            </Link>
            {canDeleteRoutes && (
              <AdminRowMenu ariaLabel={`Actions for route ${label}`} align="end">
                <Button
                  size="sm"
                  variant="danger"
                  loading={deletingRouteId === route.id}
                  onClick={() => requestDeleteRoute(route)}
                  aria-label={`Delete route ${label}`}
                >
                  {deletingRouteId === route.id ? 'Deleting...' : 'Delete'}
                </Button>
              </AdminRowMenu>
            )}
          </div>
        );
      },
    },
  ];
  const columns = allColumns.filter((column) =>
    narrowTable ? column.key !== 'stopTotals' && column.key !== 'placementDate' && column.key !== 'pickupDate' : column.key !== 'dates'
  );

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
          <div className={styles.attentionControl}>
            <Tag
              className={styles.attentionTag}
              selected={needsAttention}
              onClick={() => setNeedsAttention((on) => !on)}
              aria-describedby="routes-needs-attention-rule"
            >
              Needs attention · {needsAttentionCount}
            </Tag>
            <span id="routes-needs-attention-rule" className={styles.filterHint}>
              {NEEDS_ATTENTION_RULE}
            </span>
          </div>
          <Button
            variant="ghost"
            aria-expanded={findPropertyOpen}
            aria-controls="routes-find-property"
            onClick={() => setFindPropertyOpen((open) => !open)}
          >
            Find a property{propertyFilterActive ? ' · filtering' : ''}
          </Button>
        </div>

        <div className={styles.filterRow} role="radiogroup" aria-labelledby="routes-status-label">
          <span id="routes-status-label" className={styles.filterLabel}>Status</span>
          {ROUTE_STATUS_FILTERS.map((status) => (
            <Tag
              key={status}
              role="radio"
              aria-checked={statusFilter === status}
              aria-pressed={undefined}
              selected={statusFilter === status}
              onClick={() => setStatusFilter(status)}
            >
              {formatStatusFilterLabel(status)}
            </Tag>
          ))}
        </div>
      </div>

      {appliedFilters.length > 0 && (
        <div className={styles.appliedFilters} role="group" aria-label="Applied filters">
          {appliedFilters.map((filter) => (
            <Tag key={filter.key} onRemove={filter.remove} removeLabel={`Remove filter ${filter.label}`}>
              {filter.label}
            </Tag>
          ))}
          <button type="button" className={styles.clearFiltersBtn} onClick={clearAllFilters}>
            Clear filters
          </button>
        </div>
      )}

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
        </div>
      )}

      {hasRefinements && (
        <p className={styles.resultCount} role="status">
          Showing {visibleRoutes.length} of {filteredRoutes.length} routes
          {hiddenForNoPlacementDate > 0 &&
            ` (${hiddenForNoPlacementDate} without a Placement Date ${hiddenForNoPlacementDate === 1 ? 'is' : 'are'} hidden by the date range)`}
        </p>
      )}

      {customersFailed && (
        <div className={styles.propertyFilterBar} role="alert">
          <p className={styles.propertyFilterNote}>
            Customer names couldn&rsquo;t be loaded, so Customer search and sorting won&rsquo;t work until they are.
          </p>
          <button type="button" className={styles.clearFiltersBtn} onClick={() => void reloadCustomers()}>
            Try again
          </button>
        </div>
      )}

      {propertySearch.stopsFailed && (
        <div className={styles.propertyFilterBar} role="alert">
          <p className={styles.propertyFilterNote}>
            Stop and sign totals couldn&rsquo;t be loaded, and Find a property can&rsquo;t search until they are.
          </p>
          <button type="button" className={styles.clearFiltersBtn} onClick={() => void propertySearch.reloadStops()}>
            Try again
          </button>
        </div>
      )}

      <p className={styles.visuallyHidden} role="status">
        {sortBy
          ? `Sorted by ${SORT_LABELS[sortBy]}, ${sortDirection === 'asc' ? 'ascending' : 'descending'}`
          : 'Sorted by Placement, latest first'}
      </p>

      <div className={styles.selectionBar}>
        <span role="status">
          {selectedCount > 0 ? <span>{selectedCount} selected</span> : <span>Select Routes to assign an Operator.</span>}
          {selectedCount === 0 && selectionReset && <span> Selection cleared because the filters changed.</span>}
        </span>
        <Button id={ASSIGN_OPERATOR_ID} size="sm" variant="secondary" disabled={selectedCount === 0} onClick={() => setAssignOpen(true)}>
          Assign Operator
        </Button>
        <button type="button" className={styles.clearFiltersBtn} disabled={selectedCount === 0} onClick={() => setSelectedIds(new Set())}>
          Clear selection
        </button>
      </div>

      {visibleRoutes.length === 0 ? (
        <div className={styles.emptyFiltered} role="status">
          <p className={styles.resultCount}>
            No routes found{appliedFilters.length > 0 ? ` for ${appliedFilters.map((filter) => filter.label).join(', ')}` : ''}.
          </p>
        </div>
      ) : (
        <Card padded={false}>
          <div className={styles.tableWrap}>
            <DataTable
              className={styles.table}
              columns={columns}
              rows={visibleRoutes}
              wrapped={false}
              sortBy={sortBy}
              sortDirection={sortDirection}
              onSort={(key) => toggleSort(key as RouteSortKey)}
              defaultSort={{ key: 'placementDate', direction: 'desc' }}
              onRowClick={(route) => router.push(routeDetailHref(route))}
            />
          </div>
        </Card>
      )}

      {assignOpen && (
        <AssignOperatorDialog
          routes={visibleRoutes.filter((route) => selectedIds.has(route.id))}
          onDone={() => {
            setAssignOpen(false);
            setSelectedIds(new Set());
          }}
          onClose={() => setAssignOpen(false)}
        />
      )}

      <ConfirmDialog
        open={routePendingDelete !== null}
        title="Delete route?"
        message={`Delete route ${routePendingDelete ? routeLabel(routePendingDelete) : ''}? This will also delete all stops on the route.`}
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
          subtitle="Plan and manage Routes across all Customers."
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
