'use client';

import type { Route } from '@/amplify/types';

interface RouteTimelineProps {
  route: Route;
}

/**
 * RouteTimeline component
 * Displays the status progression timeline of a route
 */
export default function RouteTimeline({ route }: RouteTimelineProps) {
  const statuses = [
    { id: 'planned', label: 'Planned', timestamp: route.createdAt },
    { id: 'active', label: 'Active', timestamp: route.actualStartTime },
    { id: 'completed', label: 'Completed', timestamp: route.actualEndTime },
  ];

  const currentStatusIndex =
    route.status === 'completed' ? 2 : route.status === 'active' ? 1 : 0;

  return (
    <div style={{ padding: '16px', backgroundColor: '#f5f5f5', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: '600', textTransform: 'uppercase' }}>
        Route Status
      </h3>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        {statuses.map((status, index) => {
          const isActive = index === currentStatusIndex;
          const isCompleted = index < currentStatusIndex;

          return (
            <div key={status.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {/* Status Circle */}
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '8px',
                  backgroundColor: isActive ? '#1976d2' : isCompleted ? '#4caf50' : '#e0e0e0',
                  color: isActive || isCompleted ? '#fff' : '#999',
                  fontWeight: 'bold',
                  fontSize: '14px',
                }}
              >
                {isCompleted ? '✓' : isActive ? '●' : index + 1}
              </div>

              {/* Status Label */}
              <p
                style={{
                  margin: '0 0 4px 0',
                  fontSize: '12px',
                  fontWeight: isActive ? 'bold' : '500',
                  color: isActive ? '#1976d2' : '#333',
                  textAlign: 'center',
                }}
              >
                {status.label}
              </p>

              {/* Timestamp */}
              {status.timestamp && (
                <p
                  style={{
                    margin: 0,
                    fontSize: '10px',
                    color: '#999',
                    textAlign: 'center',
                  }}
                >
                  {new Date(status.timestamp).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              )}

              {/* Connector Line */}
              {index < statuses.length - 1 && (
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    marginLeft: '24px',
                    marginTop: '32px',
                    width: 'calc(100% - 48px)',
                    height: '2px',
                    backgroundColor: isCompleted ? '#4caf50' : '#e0e0e0',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
