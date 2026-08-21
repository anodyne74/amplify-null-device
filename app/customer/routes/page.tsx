'use client';

import { useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { listMyRoutes } from '@/lib/queries/ListMyRoutes';
import { getCustomerPortalContext } from '@/lib/queries';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import PageHeader from '@/app/customer/components/PageHeader';
import { RouteStatusPill } from '@/app/customer/components/RouteListItem';
import { Card } from '@/app/components/ui/core/Card';
import { Tag } from '@/app/components/ui/core/Tag';
import { Select } from '@/app/components/ui/forms/Select';
import { Input } from '@/app/components/ui/forms/Input';
import { DataTable, type DataColumn } from '@/app/components/ui/data/DataTable';
import type { Route } from '@/amplify/types';
import { compareRouteIdDesc, compareRouteStatusAsc, formatEstimatedDurationMinutes } from '@/lib/routeListHelpers';
import { formatRouteDate } from '@/lib/routeDetailHelpers';
import { getRouteStatusPresentation } from '@/lib/routeStatusHelpers';
import styles from './page.module.css';

type ChipFilter = 'all' | 'planned' | 'active' | 'completed' | 'archived';

const STATUS_CHIPS: { id: ChipFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'planned', label: 'Planned' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
  { id: 'archived', label: 'Archived' },
];

/**
 * Customer Routes List Page
 * Displays all routes for the current customer with filtering and sorting
 */
export default function CustomerRoutesPage() {
  const { user } = useAuthenticator();
  const userId = user?.userId;

  const [routes, setRoutes] = useState<Route[]>([]);
  const [filteredRoutes, setFilteredRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ChipFilter>('all');
  const [sortBy, setSortBy] = useState<'routeId' | 'status'>('routeId');
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function fetchRoutes() {
      setLoading(true);
      setError(null);

      try {
        const context = await getCustomerPortalContext(userId);

        if (!context.customerId) {
          if (!cancelled) {
            setError('Could not resolve your customer account');
            setRoutes([]);
          }
          return;
        }

        const result = await listMyRoutes({ customerId: context.customerId, limit: 50 });

        if (cancelled) return;

        if (result.errors) {
          setError('Failed to load routes');
        } else if (result.data) {
          setRoutes(result.data as unknown as Route[]);
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load routes');
          setRoutes([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchRoutes();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Apply filtering and sorting
  useEffect(() => {
    let filtered = [...routes];

    if (statusFilter !== 'all') {
      filtered = filtered.filter((route) => getRouteStatusPresentation(route.status).badgeKey === statusFilter);
    }

    const trimmedSearch = searchText.trim().toLowerCase();
    if (trimmedSearch) {
      filtered = filtered.filter((route) =>
        (route.routeCode || route.id).toLowerCase().includes(trimmedSearch)
      );
    }

    if (sortBy === 'routeId') {
      filtered.sort(compareRouteIdDesc);
    } else {
      filtered.sort(compareRouteStatusAsc);
    }

    setFilteredRoutes(filtered);
  }, [routes, statusFilter, sortBy, searchText]);

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
    { key: 'status', header: 'Status', render: (route) => <RouteStatusPill status={route.status} /> },
    { key: 'created', header: 'Created', render: (route) => formatRouteDate(route.createdAt) },
    {
      key: 'duration',
      header: 'Duration',
      align: 'right',
      render: (route) => formatEstimatedDurationMinutes(route.estimatedDurationMinutes as number | undefined),
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
              <Tag key={chip.id} selected={statusFilter === chip.id} onClick={() => setStatusFilter(chip.id)}>
                {chip.label}
              </Tag>
            ))}
          </div>

          <div className={styles.filtersRowEnd}>
            <Input
              aria-label="Search route code"
              iconLeft="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search route code"
            />
            <Select
              aria-label="Sort by"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'routeId' | 'status')}
              options={[
                { value: 'routeId', label: 'Route ID (Desc)' },
                { value: 'status', label: 'Status' },
              ]}
            />
          </div>
        </div>

        <Card padded={false}>
          <DataTable columns={columns} rows={filteredRoutes} wrapped={false} empty="No routes found." />
        </Card>

        <div className={styles.summary}>
          <p>Showing {filteredRoutes.length} routes</p>
          <p className={styles.summarySubtext}>Click on any route to view details and stops</p>
        </div>
      </div>
    </ProtectedRoute>
  );
}
