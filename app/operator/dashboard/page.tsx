'use client';

import { useAuthenticator } from '@aws-amplify/ui-react';
import { getUserEmail } from '@/lib/amplify-config';

/**
 * Operator Dashboard
 * Shows system overview, customer management, and routing stats
 */
export default function OperatorDashboard() {
  const { user } = useAuthenticator();
  const userEmail = user ? getUserEmail(user) : '';

  return (
    <div>
      <h1>Operator Dashboard</h1>
      <p>Welcome, {userEmail}! (Operator)</p>

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
            Total Customers
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
            Active Routes
          </h3>
          <p style={{ margin: 0, fontSize: '32px', fontWeight: 'bold', color: '#388e3c' }}>
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
            Outstanding Invoices
          </h3>
          <p style={{ margin: 0, fontSize: '32px', fontWeight: 'bold', color: '#d32f2f' }}>
            0
          </p>
        </div>
      </div>

      <div style={{ marginTop: '32px', padding: '20px', backgroundColor: '#f1f8e9', borderRadius: '8px' }}>
        <h3>Admin Actions</h3>
        <ul>
          <li>Manage customer accounts in the Customers section</li>
          <li>View all active routes in the Routes section</li>
          <li>Monitor invoicing and payments in the Invoices section</li>
          <li>Review audit logs for compliance and security</li>
        </ul>
      </div>
    </div>
  );
}
