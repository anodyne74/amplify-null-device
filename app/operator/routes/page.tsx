'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import OperatorRoute from '@/app/components/OperatorRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import { listAllRoutes } from '@/lib/queries/ListAllRoutes';
import type { Route, RouteStatus } from '@/amplify/types';

type StatusFilter = RouteStatus | 'all';

const STATUS_COLORS: Record<RouteStatus, string> = {
  planned: '#1976d2',
  active: '#f57c00',
  completed: '#388e3c',
  archived: '#757575',
};

function StatusBadge({ status }: { status?: string | null }) {
  const color = STATUS_COLORS[(status as RouteStatus) || 'planned'] || '#757575';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 10px',
        backgroundColor: color,
        color: 'white',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: 'bold',
        textTransform: 'uppercase',
      }}
    >
      {status || 'unknown'}
    </span>
  );
}

function formatDate(dateString?: string) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function OperatorRoutesPage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    async function fetchRoutes() {
      setLoading(true);
      setError(null);
      const result = await listAllRoutes({ limit: 100 });
      if (result.errors && result.errors.length > 0) {
        setError('Failed to load routes.');
      } else {
        setRoutes(result.data as unknown as Route[]);
      }
      setLoading(false);
    }
    fetchRoutes();
  }, []);

  const filtered =
    statusFilter === 'all' ? routes : routes.filter((r) => r.status === statusFilter);

  return (
    <OperatorRoute>
      <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '24px',
          }}
        >
          <h1 style={{ margin: 0, color: '#1b5e20' }}>Routes</h1>
          <Link href="/operator/routes/new">
            <button
              style={{
                padding: '10px 20px',
                backgroundColor: '#1b5e20',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Create New Route
            </button>
          </Link>
        </div>

        {loading && <LoadingSpinner message="Loading routes..." />}

        {!loading && error && (
          <div
            style={{
              padding: '16px',
              backgroundColor: '#ffebee',
              color: '#c62828',
              borderRadius: '4px',
              marginBottom: '16px',
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Status Filter */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ marginRight: '8px', fontWeight: '600', fontSize: '14px' }}>
                Status:
              </label>
              {(['all', 'planned', 'active', 'completed', 'archived'] as StatusFilter[]).map(
                (s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    style={{
                      marginRight: '8px',
                      padding: '6px 14px',
                      borderRadius: '4px',
                      border: '1px solid #ccc',
                      backgroundColor: statusFilter === s ? '#1b5e20' : 'white',
                      color: statusFilter === s ? 'white' : '#333',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: statusFilter === s ? '600' : 'normal',
                    }}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                )
              )}
            </div>

            {filtered.length === 0 ? (
              <div
                style={{
                  padding: '48px',
                  textAlign: 'center',
                  color: '#666',
                  border: '1px dashed #ccc',
                  borderRadius: '8px',
                }}
              >
                <p style={{ margin: 0 }}>No routes found.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filtered.map((route) => (
                  <div
                    key={route.id}
                    style={{
                      padding: '16px',
                      backgroundColor: 'white',
                      border: '1px solid #e0e0e0',
                      borderRadius: '8px',
                      display: 'grid',
                      gridTemplateColumns: '130px 130px 120px 120px 1fr 80px',
                      gap: '16px',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '11px', color: '#999', marginBottom: '2px' }}>
                        Route ID
                      </div>
                      <div style={{ fontWeight: '600', fontFamily: 'monospace', fontSize: '13px' }}>
                        {route.id.slice(0, 8)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#999', marginBottom: '2px' }}>
                        Customer ID
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                        {route.customerId.slice(0, 8)}
                      </div>
                    </div>
                    <div>
                      <StatusBadge status={route.status} />
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#999', marginBottom: '2px' }}>
                        Created
                      </div>
                      <div style={{ fontSize: '13px' }}>{formatDate(route.createdAt)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#999', marginBottom: '2px' }}>
                        Est. Duration
                      </div>
                      <div style={{ fontSize: '13px' }}>
                        {route.estimatedDurationMinutes
                          ? `${route.estimatedDurationMinutes} min`
                          : '—'}
                      </div>
                      {route.notes && (
                        <div
                          style={{
                            fontSize: '12px',
                            color: '#666',
                            marginTop: '4px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {route.notes.slice(0, 60)}
                          {route.notes.length > 60 ? '…' : ''}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <Link
                        href={`/operator/routes/detail?id=${route.id}`}
                        style={{
                          color: '#1b5e20',
                          fontWeight: '600',
                          textDecoration: 'none',
                          fontSize: '14px',
                        }}
                      >
                        View
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </OperatorRoute>
  );
}
