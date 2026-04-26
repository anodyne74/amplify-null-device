'use client';

import { useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import OperatorRoute from '@/app/components/OperatorRoute';
import { getUserEmail } from '@/lib/amplify-config';

/**
 * Operator Portal Layout
 * Provides navigation, admin menu, and logout for authenticated operators
 * Responsive design: collapsible sidebar on mobile, fixed on desktop
 */
export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  const { signOut, user } = useAuthenticator();
  const userEmail = user ? getUserEmail(user) : '';
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <OperatorRoute>
      <div style={{ display: 'flex', height: '100vh', backgroundColor: '#fafafa', flexDirection: 'row', overflow: 'hidden' }}>
        {/* Mobile Menu Toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            display: 'none',
            position: 'fixed',
            top: '1rem',
            left: '1rem',
            zIndex: 1001,
            background: '#1b5e20',
            color: 'white',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '1.2rem',
          }}
          className="mobile-menu-toggle"
        >
          ☰
        </button>

        {/* Mobile Overlay */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            style={{
              display: 'none',
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              zIndex: 999,
            }}
            className="mobile-overlay"
          />
        )}

        {/* Sidebar Navigation */}
        <aside
          style={{
            width: '250px',
            backgroundColor: '#1b5e20',
            color: 'white',
            padding: '20px',
            overflowY: 'auto',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            transition: 'transform 0.3s ease',
            position: 'relative',
          }}
          className="sidebar"
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
            padding: 'clamp(1rem, 4vw, 2rem)',
            width: '100%',
          }}
        >
          {children}
        </main>

        <style>{`
          @media (max-width: 768px) {
            .mobile-menu-toggle {
              display: block !important;
            }
            .mobile-overlay {
              display: block !important;
            }
            .sidebar {
              position: fixed !important;
              left: 0;
              top: 0;
              height: 100vh !important;
              transform: ${sidebarOpen ? 'translateX(0)' : 'translateX(-100%)'} !important;
              z-index: 1000;
              width: 250px;
            }
            main {
              padding-top: 3rem !important;
              margin-left: 0 !important;
            }
          }
          @media (min-width: 769px) {
            .mobile-menu-toggle {
              display: none !important;
            }
            .mobile-overlay {
              display: none !important;
            }
          }
        `}</style>
      </div>
    </OperatorRoute>
  );
}
