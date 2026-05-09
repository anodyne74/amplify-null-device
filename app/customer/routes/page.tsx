'use client';

import { useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { listMyRoutes } from '@/lib/queries/ListMyRoutes';
import { getCurrentCustomerId } from '@/app/auth/session';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import RouteListItem from '@/app/customer/components/RouteListItem';
import type { Route } from '@/amplify/types';
import styles from './page.module.css';

type RouteStatus = 'planned' | 'signs_placed' | 'signs_picked_up' | 'completed' | 'archived';

/**
 * Customer Routes List Page
 * Displays all routes for the current customer with filtering and sorting
 */
export default function CustomerRoutesPage() {
  const { user } = useAuthenticator();
  const customerId = user ? getCurrentCustomerId(user) : undefined;
  
  const [routes, setRoutes] = useState<Route[]>([]);
  const [filteredRoutes, setFilteredRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<RouteStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'status'>('date');

  useEffect(() => {
    if (!customerId) return;

    async function fetchRoutes() {
      setLoading(true);
      const result = await listMyRoutes({ customerId: customerId as string, limit: 50 });
      
      if (result.errors) {
        setError('Failed to load routes');
      } else if (result.data) {
        setRoutes(result.data as unknown as Route[]);
      }
      setLoading(false);
    }

    fetchRoutes();
  }, [customerId]);

  // Apply filtering and sorting
  useEffect(() => {
    let filtered = routes;

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((route) => route.status === statusFilter);
    }

    // Apply sorting
    if (sortBy === 'date') {
      filtered = filtered.sort((a, b) => {
        const dateA = new Date(a.createdAt || '').getTime();
        const dateB = new Date(b.createdAt || '').getTime();
        return dateB - dateA; // Newest first
      });
    } else {
      filtered = filtered.sort((a, b) => {
        const statusOrder = { planned: 0, signs_placed: 1, signs_picked_up: 2, completed: 3, archived: 4 };
        return (statusOrder[a.status as RouteStatus] || 0) - (statusOrder[b.status as RouteStatus] || 0);
      });
    }

    setFilteredRoutes(filtered);
  }, [routes, statusFilter, sortBy]);

  if (loading) {
    return <LoadingSpinner message="Loading routes..." />;
  }

  return (
    <ProtectedRoute>
      <div>
        <h1>Your Routes</h1>

        {error && (
          <div className={styles.errorBanner}>
            {error}
          </div>
        )}

        {/* Filters */}
        <div className={styles.filtersRow}>
          <div>
            <label className={styles.filterLabel}>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as RouteStatus | 'all')}
              className={styles.select}
            >
              <option value="all">All Statuses</option>
              <option value="planned">Planned</option>
              <option value="signs_placed">Signs Placed</option>
              <option value="signs_picked_up">Signs Picked Up</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div>
            <label className={styles.filterLabel}>Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'status')}
              className={styles.select}
            >
              <option value="date">Date (Newest First)</option>
              <option value="status">Status</option>
            </select>
          </div>
        </div>

        {/* Routes List */}
        {filteredRoutes.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No routes found</p>
          </div>
        ) : (
          <div className={styles.routesList}>
            {filteredRoutes.map((route) => (
              <RouteListItem key={route.id} route={route} />
            ))}
          </div>
        )}

        <div className={styles.summary}>
          <p className={styles.summaryText}>Showing {filteredRoutes.length} routes</p>
          <p className={styles.summarySubtext}>
            Click on any route to view details and stops
          </p>
        </div>
      </div>
    </ProtectedRoute>
  );
}
