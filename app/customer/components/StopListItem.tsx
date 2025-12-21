'use client';

import type { Stop } from '@/amplify/types';

interface StopListItemProps {
  stop: Stop;
  sequence: number;
}

/**
 * StopListItem component
 * Displays a single delivery stop in a route
 */
export default function StopListItem({ stop, sequence }: StopListItemProps) {
  const getStatusColor = (serviceType?: string | null): string => {
    switch (serviceType) {
      case 'delivery':
        return '#4caf50';
      case 'pickup':
        return '#ff9800';
      case 'inspection':
        return '#2196f3';
      default:
        return '#1976d2';
    }
  };

  const formatTime = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div
      style={{
        padding: '16px',
        backgroundColor: '#fff',
        border: `2px solid ${getStatusColor(stop.serviceType as string | undefined)}`,
        borderRadius: '8px',
        display: 'grid',
        gridTemplateColumns: '50px 1fr auto',
        gap: '16px',
        alignItems: 'start',
      }}
    >
      {/* Sequence Number */}
      <div
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: getStatusColor(stop.serviceType as string | undefined),
          color: '#fff',
          fontWeight: 'bold',
          fontSize: '16px',
        }}
      >
        {sequence}
      </div>

      {/* Stop Details */}
      <div>
        <h4 style={{ margin: '0 0 4px 0' }}>
          Stop {sequence}
        </h4>

        <p style={{ margin: '4px 0', fontSize: '14px', color: '#666' }}>
          {stop.address}
        </p>

        {stop.notes && (
          <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: '#999', fontStyle: 'italic' }}>
            "{stop.notes}"
          </p>
        )}
      </div>

      {/* Status and Time */}
      <div style={{ textAlign: 'right', minWidth: '120px' }}>
        <p
          style={{
            margin: '0 0 4px 0',
            fontSize: '12px',
            fontWeight: 'bold',
            color: getStatusColor(stop.serviceType as string | undefined),
            textTransform: 'uppercase',
          }}
        >
          {(stop.serviceType || 'delivery').replace(/_/g, ' ')}
        </p>

        {stop.actualDepartureTime && (
          <p style={{ margin: '4px 0', fontSize: '12px', color: '#666' }}>
            {formatTime(stop.actualDepartureTime)}
          </p>
        )}

        {stop.estimatedArrivalTime && !stop.actualDepartureTime && (
          <p style={{ margin: '4px 0', fontSize: '12px', color: '#999' }}>
            ETA: {formatTime(stop.estimatedArrivalTime)}
          </p>
        )}
      </div>
    </div>
  );
}
