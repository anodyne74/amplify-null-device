'use client';

import { useAuthenticator } from '@aws-amplify/ui-react';
import OperatorRoute from '@/app/components/OperatorRoute';
import PageHeader from '@/app/operator/components/PageHeader';
import { RouteStatusPill } from '@/app/operator/components/RouteStatusPill';
import { Card } from '@/app/components/ui/core/Card';
import { Tag } from '@/app/components/ui/core/Tag';
import { Button } from '@/app/components/ui/core/Button';
import { DataTable, type DataColumn } from '@/app/components/ui/data/DataTable';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import { isAdmin } from '@/lib/amplify-config';
import { useRoutesList, ROUTE_STATUS_FILTERS, type StatusFilter } from '@/lib/useRoutesList';
import { formatRouteDate, formatRouteDuration } from '@/lib/routeListHelpers';
import type { Route } from '@/amplify/types';
import styles from './page.module.css';

function formatStatusFilterLabel(status: StatusFilter) {
  if (status === 'all') return 'All';
  return status
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

export default function OperatorRoutesPage() {
  const { user } = useAuthenticator();
  const canDeleteRoutes = isAdmin(user);

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
        return (
          <div className={styles.actionsCell}>
            <a href={`/operator/routes/detail?id=${route.id}`} className="nd-btn nd-btn--secondary nd-btn--sm">
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
    <OperatorRoute>
      <div>
        <PageHeader
          title="Routes"
          actions={
            canDeleteRoutes ? (
              <a href="/administrator/routes/new" className="nd-btn nd-btn--primary">
                Create New Route
              </a>
            ) : undefined
          }
        />

        {error && <div className={styles.errorBanner}>{error}</div>}

        <div className={styles.filtersRow}>
          <div className={styles.chips}>
            {ROUTE_STATUS_FILTERS.map((status) => (
              <Tag key={status} selected={statusFilter === status} onClick={() => setStatusFilter(status)}>
                {formatStatusFilterLabel(status)}
              </Tag>
            ))}
          </div>
        </div>

        <Card padded={false}>
          <DataTable columns={columns} rows={filteredRoutes} wrapped={false} empty="No routes found." />
        </Card>
      </div>
    </OperatorRoute>
  );
}
