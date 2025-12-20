'use client';

import { useAuthenticator } from '@aws-amplify/ui-react';
import OperatorRoute from '@/app/components/OperatorRoute';
import { getUserEmail } from '@/lib/amplify-config';

/**
 * Operator Portal Layout
 * Provides navigation, admin menu, and logout for authenticated operators
 */
export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  const { signOut, user } = useAuthenticator();
  const userEmail = user ? getUserEmail(user) : '';

  return (
    <OperatorRoute>
      <div style={{ display: 'flex', height: '100vh', backgroundColor: '#fafafa' }}>
        {/* Sidebar Navigation */}
        <aside
          style={{
            width: '250px',
            backgroundColor: '#1b5e20',
            color: 'white',
            padding: '20px',
            overflowY: 'auto',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }}
        >
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>
              Delivery Manager
            </h2>
            <p style={{ margin: '8px 0 0 0', fontSize: '12px', opacity: 0.9 }}>
              Operator Portal
            </p>
          </div>

          <nav>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{ marginBottom: '8px' }}>
                <a
                  href="/operator/dashboard"
                  style={{
                    display: 'block',
                    padding: '10px 12px',
                    borderRadius: '4px',
                    color: 'white',
                    textDecoration: 'none',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'rgba(255,255,255,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'transparent';
                  }}
                >
                  📊 Dashboard
                </a>
              </li>
              <li style={{ marginBottom: '8px' }}>
                <a
                  href="/operator/customers"
                  style={{
                    display: 'block',
                    padding: '10px 12px',
                    borderRadius: '4px',
                    color: 'white',
                    textDecoration: 'none',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'rgba(255,255,255,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'transparent';
                  }}
                >
                  👥 Customers
                </a>
              </li>
              <li style={{ marginBottom: '8px' }}>
                <a
                  href="/operator/routes"
                  style={{
                    display: 'block',
                    padding: '10px 12px',
                    borderRadius: '4px',
                    color: 'white',
                    textDecoration: 'none',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'rgba(255,255,255,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'transparent';
                  }}
                >
                  🛣️ Routes
                </a>
              </li>
              <li style={{ marginBottom: '8px' }}>
                <a
                  href="/operator/invoices"
                  style={{
                    display: 'block',
                    padding: '10px 12px',
                    borderRadius: '4px',
                    color: 'white',
                    textDecoration: 'none',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'rgba(255,255,255,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'transparent';
                  }}
                >
                  📄 Invoices
                </a>
              </li>
            </ul>
          </nav>

          <div
            style={{
              marginTop: '32px',
              paddingTop: '16px',
              borderTop: '1px solid rgba(255,255,255,0.2)',
            }}
          >
            <p style={{ margin: '0 0 8px 0', fontSize: '12px', opacity: 0.8 }}>
              Signed in as (Operator)
            </p>
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', wordBreak: 'break-word' }}>
              {userEmail}
            </p>
            <button
              onClick={() => signOut()}
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: 'rgba(255,255,255,0.2)',
                border: '1px solid rgba(255,255,255,0.3)',
                color: 'white',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(255,255,255,0.3)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(255,255,255,0.2)';
              }}
            >
              Logout
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            backgroundColor: 'white',
          }}
        >
          <div style={{ padding: '20px' }}>
            {children}
          </div>
        </main>
      </div>
    </OperatorRoute>
  );
}
