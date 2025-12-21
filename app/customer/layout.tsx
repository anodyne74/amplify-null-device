'use client';

import { useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import { getUserEmail } from '@/lib/amplify-config';
import { useSessionTimeout, useLogout } from '@/app/auth/sessionManager';

/**
 * Customer Portal Layout
 * Provides navigation, branding, and logout for authenticated customers
 * Includes session timeout after 30 minutes of inactivity
 */
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuthenticator();
  const userEmail = user ? getUserEmail(user) : '';
  const { logout } = useLogout();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Initialize session timeout monitoring
  useSessionTimeout();

  return (
    <ProtectedRoute requireCustomer={true}>
      <div style={{ display: 'flex', height: '100vh', backgroundColor: '#fafafa' }}>
        {/* Sidebar Navigation */}
        <aside
          style={{
            width: '250px',
            backgroundColor: '#1976d2',
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
              Customer Portal
            </p>
          </div>

          <nav>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{ marginBottom: '8px' }}>
                <a
                  href="/customer/dashboard"
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
                  href="/customer/routes"
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
                  href="/customer/invoices"
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
              Signed in as
            </p>
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', wordBreak: 'break-word' }}>
              {userEmail}
            </p>

            {showLogoutConfirm ? (
              <div style={{ padding: '12px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>
                <p style={{ margin: '0 0 12px 0', fontSize: '13px' }}>
                  Are you sure you want to logout?
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => logout()}
                    style={{
                      flex: 1,
                      padding: '8px',
                      backgroundColor: '#f44336',
                      border: 'none',
                      color: 'white',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '600',
                    }}
                  >
                    Yes, Logout
                  </button>
                  <button
                    onClick={() => setShowLogoutConfirm(false)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      backgroundColor: 'rgba(255,255,255,0.2)',
                      border: '1px solid rgba(255,255,255,0.3)',
                      color: 'white',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '600',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowLogoutConfirm(true)}
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
            )}
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
    </ProtectedRoute>
  );
}
