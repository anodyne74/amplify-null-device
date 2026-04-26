'use client';

import Link from 'next/link';
import type { Route } from '@/amplify/types';

interface RouteListItemProps {
  route: Route;
}

/**
 * RouteListItem Component
 * Displays a single route in the list view
 */
export default function RouteListItem({ route }: RouteListItemProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return '#1976d2'; // Blue
      case 'in_progress':
        return '#f57c00'; // Orange
      case 'completed':
        return '#388e3c'; // Green
      case 'cancelled':
        return '#d32f2f'; // Red
      default:
        return '#666';
    }
  };

  const getStatusLabel = (status: string) => {
    return status.replace(/_/g, ' ').charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDuration = (minutes?: number | null): string => {
    if (!minutes) return 'N/A';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  return (
    <Link href={`/customer/routes/${route.id}`}>
      <div
        style={{
          padding: '16px',
          backgroundColor: 'white',
          border: '1px solid #e0e0e0',
          borderRadius: '8px',
          cursor: 'pointer',
          transition: 'box-shadow 0.2s, border-color 0.2s',
          display: 'grid',
          gridTemplateColumns: '1fr 120px 120px 100px',
          gap: '16px',
          alignItems: 'center',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
          (e.currentTarget as HTMLDivElement).style.borderColor = '#1976d2';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
          (e.currentTarget as HTMLDivElement).style.borderColor = '#e0e0e0';
        }}
      >
        {/* Route ID and Notes */}
        <div>
          <p style={{ margin: '0 0 4px 0', fontWeight: 'bold', fontSize: '16px' }}>
            Route {route.id.slice(0, 8)}...
          </p>
          <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
            {route.notes || 'No notes'}
          </p>
        </div>

        {/* Status Badge */}
        <div>
          <div
            style={{
              display: 'inline-block',
              padding: '6px 12px',
              backgroundColor: getStatusColor(route.status || ''),
              color: 'white',
              borderRadius: '16px',
              fontSize: '12px',
              fontWeight: 'bold',
              textAlign: 'center',
            }}
          >
            {getStatusLabel(route.status || 'unknown')}
          </div>
        </div>

        {/* Date */}
        <div>
          <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#999' }}>Created</p>
          <p style={{ margin: 0, fontSize: '14px', fontWeight: '500' }}>
            {formatDate(route.createdAt)}
          </p>
        </div>

        {/* Duration */}
        <div>
          <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#999' }}>Duration</p>
          <p style={{ margin: 0, fontSize: '14px', fontWeight: '500' }}>
            {formatDuration(route.estimatedDurationMinutes as number | undefined)}
          </p>
        </div>
      </div>
    </Link>
  );
}
