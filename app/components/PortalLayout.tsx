'use client';

import Link from 'next/link';
import { useState } from 'react';
import styles from './PortalLayout.module.css';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

interface PortalLayoutProps {
  children: React.ReactNode;
  variant: 'customer' | 'operator';
  portalTitle: string;
  navItems: NavItem[];
  userEmail: string;
  onLogout: () => void;
  /** If true, shows a confirm dialog before logging out (useful for session-aware portals) */
  confirmLogout?: boolean;
}

/**
 * Shared PortalLayout
 * Provides the sidebar + main content shell for both customer and operator portals.
 * Accept a `variant` prop to apply the correct NullDevice portal accent colour.
 */
export default function PortalLayout({
  children,
  variant,
  portalTitle,
  navItems,
  userEmail,
  onLogout,
  confirmLogout = false,
}: PortalLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const sidebarClass = `${styles.sidebar} ${styles[variant]}`;

  // The sidebar transform cannot be expressed as a static CSS rule because it
  // depends on the React state value `sidebarOpen`.
  const sidebarStyle =
    typeof window !== 'undefined' && window.innerWidth <= 768
      ? { transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)' }
      : undefined;

  function handleLogoutClick() {
    if (confirmLogout) {
      setShowLogoutConfirm(true);
    } else {
      onLogout();
    }
  }

  return (
    <div className={styles.layout}>
      {/* Mobile menu toggle */}
      <button
        className={styles.menuToggle}
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle navigation menu"
      >
        ☰
      </button>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className={styles.overlay}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside className={sidebarClass} style={sidebarStyle}>
        <div className={styles.brand}>
          <h2 className={styles.brandTitle}>NullDevice</h2>
          <p className={styles.brandSubtitle}>{portalTitle}</p>
        </div>

        <nav className={styles.nav}>
          <ul className={styles.navList}>
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={styles.navLink}
                  onClick={() => setSidebarOpen(false)}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.userSection}>
          <p className={styles.userLabel}>Signed in as</p>
          <p className={styles.userEmail}>{userEmail}</p>

          {showLogoutConfirm ? (
            <div className={styles.logoutConfirm}>
              <p className={styles.logoutConfirmText}>Are you sure you want to logout?</p>
              <div className={styles.logoutActions}>
                <button className={styles.logoutConfirmBtn} onClick={onLogout}>
                  Yes, Logout
                </button>
                <button
                  className={styles.logoutCancelBtn}
                  onClick={() => setShowLogoutConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className={styles.logoutBtn} onClick={handleLogoutClick}>
              Logout
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className={styles.main}>{children}</main>

      {/* Dynamic sidebar transform for mobile open/close */}
      <style>{`
        @media (max-width: 768px) {
          .${styles.sidebar} {
            transform: ${sidebarOpen ? 'translateX(0)' : 'translateX(-100%)'} !important;
          }
        }
      `}</style>
    </div>
  );
}
