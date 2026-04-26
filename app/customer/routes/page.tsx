'use client';

import { useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { listMyRoutes } from '@/lib/queries/ListMyRoutes';
import { getCurrentCustomerId } from '@/app/auth/session';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import RouteListItem from '@/app/customer/components/RouteListItem';
import type { Route } from '@/amplify/types';

type RouteStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

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
        const statusOrder = { scheduled: 0, in_progress: 1, completed: 2, cancelled: 3 };
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
          <div style={{ padding: '16px', backgroundColor: '#ffebee', color: '#c62828', borderRadius: '4px', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        {/* Filters */}
        <div style={{ marginBottom: '24px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as RouteStatus | 'all')}
              style={{
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            >
              <option value="all">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'status')}
              style={{
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            >
              <option value="date">Date (Newest First)</option>
              <option value="status">Status</option>
            </select>
          </div>
        </div>

        {/* Routes List */}
        {filteredRoutes.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#666' }}>
            <p>No routes found</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredRoutes.map((route) => (
              <RouteListItem key={route.id} route={route} />
            ))}
          </div>
        )}

        <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#e3f2fd', borderRadius: '4px' }}>
          <p style={{ margin: '0 0 8px 0' }}>Showing {filteredRoutes.length} routes</p>
          <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
            Click on any route to view details and stops
          </p>
        </div>
      </div>
    </ProtectedRoute>
  );
}
