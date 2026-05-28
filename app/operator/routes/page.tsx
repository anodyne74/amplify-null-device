'use client';

import Link from 'next/link';
import { useAuthenticator } from '@aws-amplify/ui-react';
import OperatorRoute from '@/app/components/OperatorRoute';
import RoutesListContent from '@/app/components/RoutesListContent';
import { isAdmin } from '@/lib/amplify-config';
import { useRoutesList } from '@/lib/useRoutesList';
import styles from './page.module.css';

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

  return (
    <OperatorRoute>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.pageHeader}>
          <h1 className={styles.heading}>Routes</h1>
          {canDeleteRoutes && (
            <Link href="/administrator/routes/new">
              <button className={styles.btnCreateRoute}>
                Create New Route
              </button>
            </Link>
          )}
        </div>

        <RoutesListContent
          canDeleteRoutes={canDeleteRoutes}
          classes={styles}
          customersById={customersById}
          deletingRouteId={deletingRouteId}
          error={error}
          filteredRoutes={filteredRoutes}
          getDetailHref={(route) => `/operator/routes/detail?id=${route.id}`}
          getEditHref={(route) => `/administrator/routes/edit?id=${route.id}`}
          loading={loading}
          onDeleteRoute={(route) => {
            void handleDeleteRoute(route);
          }}
          onStatusFilterChange={setStatusFilter}
          showEditLink={canDeleteRoutes}
          statusFilter={statusFilter}
        />
      </div>
    </OperatorRoute>
  );
}
