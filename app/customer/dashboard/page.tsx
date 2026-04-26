'use client';

import { useAuthenticator } from '@aws-amplify/ui-react';
import { getUserEmail } from '@/lib/amplify-config';

/**
 * Customer Dashboard
 * Shows overview of routes, invoices, and statistics
 */
export default function CustomerDashboard() {
  const { user } = useAuthenticator();
  const userEmail = user ? getUserEmail(user) : '';

  return (
    <div>
      <h1>Customer Dashboard</h1>
      <p>Welcome, {userEmail}!</p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '20px',
          marginTop: '24px',
        }}
      >
        <div
          style={{
            padding: '20px',
            backgroundColor: '#f5f5f5',
            borderRadius: '8px',
            border: '1px solid #e0e0e0',
          }}
        >
          <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#666' }}>
            Active Routes
          </h3>
          <p style={{ margin: 0, fontSize: '32px', fontWeight: 'bold', color: '#1976d2' }}>
            0
          </p>
        </div>

        <div
          style={{
            padding: '20px',
            backgroundColor: '#f5f5f5',
            borderRadius: '8px',
            border: '1px solid #e0e0e0',
          }}
        >
          <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#666' }}>
            Pending Invoices
          </h3>
          <p style={{ margin: 0, fontSize: '32px', fontWeight: 'bold', color: '#d32f2f' }}>
            0
          </p>
        </div>

        <div
          style={{
            padding: '20px',
            backgroundColor: '#f5f5f5',
            borderRadius: '8px',
            border: '1px solid #e0e0e0',
          }}
        >
          <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#666' }}>
            Outstanding Balance
          </h3>
          <p style={{ margin: 0, fontSize: '32px', fontWeight: 'bold', color: '#f57c00' }}>
            $0
          </p>
        </div>
      </div>

      <div style={{ marginTop: '32px', padding: '20px', backgroundColor: '#e3f2fd', borderRadius: '8px' }}>
        <h3>Getting Started</h3>
        <ul>
          <li>View your active routes in the Routes section</li>
          <li>Download invoices from the Invoices section</li>
          <li>Check your statistics and billing info on the Dashboard</li>
        </ul>
      </div>
    </div>
  );
}
