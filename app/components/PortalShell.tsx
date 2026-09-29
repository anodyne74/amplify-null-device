'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/app/components/ui/core/Icon';
import { Logo } from '@/app/components/ui/core/Logo';
import { Button } from '@/app/components/ui/core/Button';
import { Dialog } from '@/app/components/ui/feedback/Dialog';
import { useThemeMode } from '@/app/components/AmplifyThemeProvider';
import styles from './PortalShell.module.css';

export type PortalVariant = 'administrator' | 'operator' | 'customer';

export interface PortalNavItem {
  href: string;
  label: string;
  icon: string;
}

interface PortalShellProps {
  children: React.ReactNode;
  variant: PortalVariant;
  navItems: PortalNavItem[];
  userName: string;
  onLogout: () => void;
  /** Pinned to the top-right corner of every page, e.g. the operator's save status. */
  status?: React.ReactNode;
  /** Replaces the logout confirmation's copy when logging out would lose something. */
  logoutWarning?: string | null;
}

const PORTAL_TITLES: Record<PortalVariant, string> = {
  administrator: 'Administrator Portal',
  operator: 'Operator Portal',
  customer: 'Customer Portal',
};

/**
 * The sidebar and content frame every portal renders in. Staff portals get the
 * fixed navy chrome; the customer portal's sidebar follows the visitor's theme.
 */
export default function PortalShell({
  children,
  variant,
  navItems,
  userName,
  onLogout,
  status,
  logoutWarning,
}: PortalShellProps) {
  const pathname = usePathname();
  const { resolvedMode } = useThemeMode();
  const staff = variant !== 'customer';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // The sidebar transform cannot be expressed as a static CSS rule because it
  // depends on the React state value `sidebarOpen`.
  const sidebarStyle =
    typeof window !== 'undefined' && window.innerWidth <= 768
      ? { transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)' }
      : undefined;

  function isNavItemActive(href: string) {
    if (!pathname) return false;
    if (pathname === href) return true;

    const segmentCount = href.split('/').filter(Boolean).length;
    if (segmentCount <= 1) return false;

    return pathname.startsWith(`${href}/`);
  }

  return (
    <div className={styles.layout}>
      <button
        className={styles.menuToggle}
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle navigation menu"
      >
        <Icon name="menu" size={20} />
      </button>

      {sidebarOpen && (
        <div
          className={`${styles.overlay} ${styles.open}`}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={staff ? styles.sidebar : `${styles.sidebar} ${styles.sidebarThemed}`}
        data-theme={staff ? 'dark' : undefined}
        style={sidebarStyle}
      >
        <div className={styles.brand}>
          <Logo theme={staff || resolvedMode === 'dark' ? 'light' : 'dark'} height={32} />
          <p className={styles.brandSubtitle}>{PORTAL_TITLES[variant]}</p>
        </div>

        <nav className={styles.nav}>
          <ul className={styles.navList}>
            {navItems.map((item) => {
              const isActive = isNavItemActive(item.href);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
                    onClick={() => setSidebarOpen(false)}
                    title={item.label}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon name={item.icon} size={18} />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className={styles.userSection}>
          <p className={styles.userLabel}>Signed in as</p>
          <p className={styles.userEmail}>{userName}</p>

          <Button variant={staff ? 'inverse' : 'secondary'} size="sm" block onClick={() => setShowLogoutConfirm(true)}>
            Logout
          </Button>
        </div>
      </aside>

      <main className={styles.main}>
        {status && <div className={styles.status}>{status}</div>}
        <div className={styles.content}>{children}</div>
      </main>

      <Dialog
        open={showLogoutConfirm}
        title="Log out?"
        description={logoutWarning || `You'll need to sign in again to access the ${variant} portal.`}
        onClose={() => setShowLogoutConfirm(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowLogoutConfirm(false)}>
              {logoutWarning ? 'Stay signed in' : 'Cancel'}
            </Button>
            <Button variant="danger" onClick={onLogout}>
              {logoutWarning ? 'Log out anyway' : 'Yes, logout'}
            </Button>
          </>
        }
      />

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
