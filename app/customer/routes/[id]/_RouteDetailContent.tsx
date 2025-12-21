'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { getRouteDetail } from '@/lib/queries/GetRouteDetail';
import { verifyCustomerAccess, getCurrentCustomerId } from '@/app/auth/session';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import RouteTimeline from '@/app/customer/components/RouteTimeline';
import StopListItem from '@/app/customer/components/StopListItem';
import type { Route } from '@/amplify/types';

interface RouteDetailContentProps {
  params: {
    id: string;
  };
}

/**
 * Customer Route Detail Page
 * Shows full route information with stops and timeline
 */
export default function RouteDetailContent({ params }: RouteDetailContentProps) {
  const { user } = useAuthenticator();
  const customerId = user ? getCurrentCustomerId(user) : undefined;
  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id) return;

    async function fetchRoute() {
      setLoading(true);
      const result = await getRouteDetail(params.id);

      if (result.errors) {
        setError('Failed to load route details');
      } else if (result.data) {
        // Verify customer can access this route
        if (customerId && !verifyCustomerAccess(user, result.data.customerId)) {
          setError('You do not have permission to view this route');
        } else {
          setRoute(result.data as unknown as Route);
        }
      } else {
        setError('Route not found');
      }

      setLoading(false);
    }

    fetchRoute();
  }, [params.id, customerId, user]);

  if (loading) {
    return <LoadingSpinner message="Loading route details..." />;
  }

  if (error || !route) {
    return (
      <ProtectedRoute>
        <div style={{ padding: '20px' }}>
          <Link href="/customer/routes" style={{ color: '#1976d2', textDecoration: 'none' }}>
            ← Back to Routes
          </Link>
          <div
            style={{
              marginTop: '16px',
              padding: '16px',
              backgroundColor: '#ffebee',
              color: '#c62828',
              borderRadius: '4px',
            }}
          >
            {error || 'Route not found'}
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (minutes?: number | null): string => {
    if (!minutes) return 'N/A';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  return (
    <ProtectedRoute>
      <div>
        <Link href="/customer/routes" style={{ color: '#1976d2', textDecoration: 'none' }}>
          ← Back to Routes
        </Link>

        <h1 style={{ marginTop: '16px' }}>Route {route.id.slice(0, 8)}...</h1>

        {/* Status and Timeline */}
        <div style={{ marginBottom: '32px' }}>
          <RouteTimeline route={route} />
        </div>

        {/* Route Details Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '32px',
          }}
        >
          <div
            style={{
              padding: '16px',
              backgroundColor: '#f5f5f5',
              borderRadius: '8px',
              border: '1px solid #e0e0e0',
            }}
          >
            <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>
              Status
            </p>
            <p style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>
              {(route.status || 'unknown').replace(/_/g, ' ')}
            </p>
          </div>

          <div
            style={{
              padding: '16px',
              backgroundColor: '#f5f5f5',
              borderRadius: '8px',
              border: '1px solid #e0e0e0',
            }}
          >
            <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>
              Estimated Duration
            </p>
            <p style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>
              {formatDuration(route.estimatedDurationMinutes as number | undefined)}
            </p>
          </div>

          {route.actualDurationMinutes && (
            <div
              style={{
                padding: '16px',
                backgroundColor: '#f5f5f5',
                borderRadius: '8px',
                border: '1px solid #e0e0e0',
              }}
            >
              <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>
                Actual Duration
              </p>
              <p style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>
                {formatDuration(route.actualDurationMinutes as number | undefined)}
              </p>
            </div>
          )}

          <div
            style={{
              padding: '16px',
              backgroundColor: '#f5f5f5',
              borderRadius: '8px',
              border: '1px solid #e0e0e0',
            }}
          >
            <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>
              Created
            </p>
            <p style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>
              {formatDate(route.createdAt)}
            </p>
          </div>
        </div>

        {/* Notes */}
        {route.notes && (
          <div style={{ marginBottom: '32px' }}>
            <h3>Notes</h3>
            <p style={{ padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
              {route.notes}
            </p>
          </div>
        )}

        {/* Stops */}
        <div>
          <h3>Delivery Stops ({route.stops?.length || 0})</h3>

          {(!route.stops || route.stops.length === 0) ? (
            <p style={{ color: '#666' }}>No stops scheduled for this route</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {route.stops.map((stop, index) => (
                <StopListItem key={stop.id} stop={stop} sequence={index + 1} />
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
