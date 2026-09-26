'use client';

import { useEffect, useState } from 'react';
import { useCustomerPortalContext } from '@/lib/useCustomerPortalContext';
import { useLiveRoutes } from '@/lib/useLiveRoutes';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import PageHeader from '@/app/customer/components/PageHeader';
import { RouteStatusPill } from '@/app/customer/components/RouteListItem';
import RouteCard from '@/app/customer/components/RouteCard';
import CustomerPagination from '@/app/customer/components/CustomerPagination';
import { Card } from '@/app/components/ui/core/Card';
import { Tag } from '@/app/components/ui/core/Tag';
import { Input } from '@/app/components/ui/forms/Input';
import { DataTable, type DataColumn } from '@/app/components/ui/data/DataTable';
import type { Route } from '@/amplify/types';
import { compareRouteIdDesc, formatEstimatedDurationMinutes, getFinalizedRouteDurationMinutes } from '@/lib/routeListHelpers';
import { formatRouteDate } from '@/lib/routeDetailHelpers';
import { useIsNarrowViewport } from '@/lib/useIsNarrowViewport';
import { getPageSlice } from '@/lib/pagination';
import { getRoutePhaseKey, ROUTE_PHASE_KEYS, ROUTE_PHASE_LABELS, type RoutePhaseKey } from '@/lib/signRunPhase';
import styles from './page.module.css';

// Below this width the DataTable's 5 columns don't fit sensibly (mirrors the
// breakpoint already used by the orders/billing-details pages for their own
// mobile layout switch) — show a stacked RouteCard list instead.
const NARROW_LIST_BREAKPOINT_PX = 900;

type ChipFilter = RoutePhaseKey | 'all';

// archived is intentionally absent — it's a legacy, soft-deprecated status
// that now displays (and filters) identically to completed.
const STATUS_CHIPS: { id: ChipFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  ...ROUTE_PHASE_KEYS.map((key) => ({ id: key, label: ROUTE_PHASE_LABELS[key] })),
];

/**
 * Customer Routes List Page
 * Displays all routes for the current customer with filtering and sorting,
 * kept live via useLiveRoutes so status changes appear without a reload.
 */
export default function CustomerRoutesPage() {
  const { customerId, loading: contextLoading, error: contextError } = useCustomerPortalContext();
  const { routes, loading: routesLoading, error: routesError } = useLiveRoutes(customerId);
  const loading = contextLoading || routesLoading;
  const error = contextError || routesError;

  const [filteredRoutes, setFilteredRoutes] = useState<Route[]>([]);
  const [statusFilter, setStatusFilter] = useState<ChipFilter>('all');
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const isNarrow = useIsNarrowViewport(NARROW_LIST_BREAKPOINT_PX);

  // Apply filtering and sorting
  useEffect(() => {
    let filtered = [...routes];

    if (statusFilter !== 'all') {
      filtered = filtered.filter((route) => getRoutePhaseKey(route) === statusFilter);
    }

    const trimmedSearch = searchText.trim().toLowerCase();
    if (trimmedSearch) {
      filtered = filtered.filter((route) =>
        (route.routeCode || route.id).toLowerCase().includes(trimmedSearch)
      );
    }

    filtered.sort(compareRouteIdDesc);

    setFilteredRoutes(filtered);
  }, [routes, statusFilter, searchText]);

  // Only a filter or search change starts again from page 1; live updates to
  // `routes` keep the page, which getPageSlice clamps if it no longer exists.
  const handleStatusChange = (status: ChipFilter) => {
    setStatusFilter(status);
    setPage(1);
  };
  const handleSearchChange = (value: string) => {
    setSearchText(value);
    setPage(1);
  };
  const { currentPage, pageRows } = getPageSlice(filteredRoutes, page);

  if (loading) {
    return <LoadingSpinner message="Loading routes..." />;
  }

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
    { key: 'status', header: 'Status', render: (route) => <RouteStatusPill route={route} /> },
    { key: 'created', header: 'Created', render: (route) => formatRouteDate(route.createdAt) },
    {
      key: 'duration',
      header: 'Duration',
      align: 'right',
      // Total time is only meaningful once the route has actually finished —
      // it's calculated from the operator's finalisation, not an estimate.
      render: (route) =>
        getRoutePhaseKey(route) === 'completed'
          ? formatEstimatedDurationMinutes(getFinalizedRouteDurationMinutes(route))
          : 'N/A',
    },
    {
      key: 'action',
      header: '',
      width: 90,
      render: (route) => (
        <div style={{ textAlign: 'right' }}>
          <a href={`/customer/routes/${route.id}`} className="nd-btn nd-btn--secondary nd-btn--sm">
            View
          </a>
        </div>
      ),
    },
  ];

  return (
    <ProtectedRoute>
      <div>
        <PageHeader title="Routes" />

        {error && <div className={styles.errorBanner}>{error}</div>}

        <div className={styles.filtersRow}>
          <div className={styles.chips}>
            {STATUS_CHIPS.map((chip) => (
              <Tag key={chip.id} selected={statusFilter === chip.id} onClick={() => handleStatusChange(chip.id)}>
                {chip.label}
              </Tag>
            ))}
          </div>

          <div className={styles.filtersRowEnd}>
            <Input
              aria-label="Search route code"
              iconLeft="search"
              value={searchText}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search route code"
            />
          </div>
        </div>

        {isNarrow ? (
          filteredRoutes.length > 0 ? (
            <div className={styles.cardList}>
              {pageRows.map((route) => (
                <RouteCard key={route.id} route={route} />
              ))}
            </div>
          ) : (
            <Card>
              <p className={styles.summarySubtext}>No routes found.</p>
            </Card>
          )
        ) : (
          <Card padded={false}>
            <DataTable columns={columns} rows={pageRows} wrapped={false} empty="No routes found." />
          </Card>
        )}

        <CustomerPagination
          page={currentPage}
          totalItems={filteredRoutes.length}
          onPageChange={setPage}
          itemsLabel="routes"
        />

        <div className={styles.summary}>
          <p className={styles.summaryHint}>Click on any route to view details and stops</p>
        </div>
      </div>
    </ProtectedRoute>
  );
}
