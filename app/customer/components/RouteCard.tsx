'use client';

import type { Route } from '@/amplify/types';

interface RouteCardProps {
  route: Route;
}

/**
 * RouteCard component
 * Displays a route in card format for list view
 */
export default function RouteCard({ route }: RouteCardProps) {
  const getStatusColor = (status?: string | null) => {
    switch (status) {
      case 'completed':
        return '#4caf50';
      case 'active':
        return '#ff9800';
      case 'archived':
        return '#f44336';
      default:
        return '#1976d2';
    }
  };

  const getStatusLabel = (status?: string | null) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'active':
        return 'In Progress';
      case 'planned':
        return 'Planned';
      case 'archived':
        return 'Archived';
      default:
        return 'Unknown';
    }
  };

  const stopCount = route.stops?.length || 0;

  return (
    <div
      style={{
        padding: '16px',
        backgroundColor: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
      }}
    >
      {/* Header with ID and Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '16px' }}>
          Route {route.id.slice(0, 8)}...
        </h3>
        <span
          style={{
            padding: '4px 12px',
            backgroundColor: getStatusColor(route.status),
            color: '#fff',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: '600',
          }}
        >
          {getStatusLabel(route.status)}
        </span>
      </div>

      {/* Route Info */}
      <div style={{ marginBottom: '12px' }}>
        <p style={{ margin: '4px 0', fontSize: '13px', color: '#666' }}>
          <strong>Stops:</strong> {stopCount}
        </p>

        {route.estimatedDurationMinutes && (
          <p style={{ margin: '4px 0', fontSize: '13px', color: '#666' }}>
            <strong>Duration:</strong> {Math.floor(route.estimatedDurationMinutes / 60)}h{' '}
            {route.estimatedDurationMinutes % 60}m
          </p>
        )}

        {route.createdAt && (
          <p style={{ margin: '4px 0', fontSize: '13px', color: '#666' }}>
            <strong>Created:</strong>{' '}
            {new Date(route.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        )}
      </div>

      {/* Footer */}
      <div style={{ paddingTop: '12px', borderTop: '1px solid #f0f0f0' }}>
        <p style={{ margin: 0, fontSize: '12px', color: '#1976d2', fontWeight: '600' }}>
          View Details →
        </p>
      </div>
    </div>
  );
}
