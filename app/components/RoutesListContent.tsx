import Link from 'next/link';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import RouteStatusBadge from '@/app/components/RouteStatusBadge';
import type { Route } from '@/amplify/types';
import { formatRouteDate, formatRouteDuration } from '@/lib/routeListHelpers';
import { ROUTE_STATUS_FILTERS, type StatusFilter } from '@/lib/useRoutesList';

type RoutesListContentClasses = {
  badge: string;
  badgePlanned: string;
  badgeActive: string;
  badgeCompleted: string;
  badgeArchived: string;
  cellLabel: string;
  cellRight: string;
  cellValue: string;
  cellValueMono: string;
  cellValueMonoNormal: string;
  deleteBtn: string;
  editLink: string;
  emptyState: string;
  emptyStateText: string;
  errorBanner: string;
  filterBtn: string;
  filterBtnActive: string;
  filterLabel: string;
  filterRow: string;
  notesPreview: string;
  routeRow: string;
  routesList: string;
  viewLink: string;
};

type RoutesListContentProps = {
  canDeleteRoutes: boolean;
  classes: RoutesListContentClasses;
  customersById: Record<string, string>;
  deletingRouteId: string | null;
  error: string | null;
  filteredRoutes: Route[];
  getDetailHref: (route: Route) => string;
  getEditHref: (route: Route) => string;
  loading: boolean;
  onDeleteRoute: (route: Route) => void;
  onStatusFilterChange: (status: StatusFilter) => void;
  showEditLink: boolean;
  statusFilter: StatusFilter;
};

export default function RoutesListContent({
  canDeleteRoutes,
  classes,
  customersById,
  deletingRouteId,
  error,
  filteredRoutes,
  getDetailHref,
  getEditHref,
  loading,
  onDeleteRoute,
  onStatusFilterChange,
  showEditLink,
  statusFilter,
}: RoutesListContentProps) {
  if (loading) {
    return <LoadingSpinner message="Loading routes..." />;
  }

  if (error) {
    return <div className={classes.errorBanner}>{error}</div>;
  }

  return (
    <>
      <div className={classes.filterRow}>
        <label className={classes.filterLabel}>
          Status:
        </label>
        {ROUTE_STATUS_FILTERS.map((status) => (
          <button
            key={status}
            onClick={() => onStatusFilterChange(status)}
            className={`${classes.filterBtn} ${statusFilter === status ? classes.filterBtnActive : ''}`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {filteredRoutes.length === 0 ? (
        <div className={classes.emptyState}>
          <p className={classes.emptyStateText}>No routes found.</p>
        </div>
      ) : (
        <div className={classes.routesList}>
          {filteredRoutes.map((route) => (
            <div key={route.id} className={classes.routeRow}>
              <div>
                <div className={classes.cellLabel}>Route ID</div>
                <div className={classes.cellValueMono}>{route.routeCode || route.id.slice(0, 8)}</div>
              </div>
              <div>
                <div className={classes.cellLabel}>Customer</div>
                <div className={classes.cellValueMonoNormal}>{customersById[route.customerId] || 'Unknown customer'}</div>
              </div>
              <div>
                <RouteStatusBadge status={route.status} classes={classes} />
              </div>
              <div>
                <div className={classes.cellLabel}>Created</div>
                <div className={classes.cellValue}>{formatRouteDate(route.createdAt)}</div>
              </div>
              <div>
                <div className={classes.cellLabel}>Duration</div>
                <div className={classes.cellValue}>{formatRouteDuration(route)}</div>
                {route.notes && (
                  <div className={classes.notesPreview}>
                    {route.notes.slice(0, 60)}
                    {route.notes.length > 60 ? '…' : ''}
                  </div>
                )}
              </div>
              <div className={classes.cellRight}>
                <Link href={getDetailHref(route)} className={classes.viewLink}>
                  View
                </Link>
                {showEditLink && (
                  <Link href={getEditHref(route)} className={classes.editLink}>
                    Edit
                  </Link>
                )}
                {canDeleteRoutes && (
                  <button
                    type="button"
                    className={classes.deleteBtn}
                    onClick={() => onDeleteRoute(route)}
                    disabled={deletingRouteId === route.id}
                  >
                    {deletingRouteId === route.id ? 'Deleting...' : 'Delete'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
