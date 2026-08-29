'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/app/components/ui/core/Icon';
import { Logo } from '@/app/components/ui/core/Logo';
import { Button } from '@/app/components/ui/core/Button';
import { Dialog } from '@/app/components/ui/feedback/Dialog';
import ThemeModeSelect from '@/app/components/ThemeModeSelect';
import styles from './AdminShell.module.css';

export interface AdminNavItem {
  href: string;
  label: string;
  icon: string;
}

interface AdminShellProps {
  children: React.ReactNode;
  navItems: AdminNavItem[];
  userEmail: string;
  onLogout: () => void;
}

export default function AdminShell({ children, navItems, userEmail, onLogout }: AdminShellProps) {
  const pathname = usePathname();
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

      <aside className={styles.sidebar} data-theme="dark" style={sidebarStyle}>
        <div className={styles.brand}>
          <Logo theme="light" height={32} />
          <p className={styles.brandSubtitle}>Administrator Portal</p>
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
          <div className={styles.themeControls}>
            <ThemeModeSelect label="Theme" />
          </div>

          <p className={styles.userLabel}>Signed in as</p>
          <p className={styles.userEmail}>{userEmail}</p>

          <Button variant="inverse" size="sm" block onClick={() => setShowLogoutConfirm(true)}>
            Logout
          </Button>
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.content}>{children}</div>
      </main>

      <Dialog
        open={showLogoutConfirm}
        title="Log out?"
        description="You'll need to sign in again to access the administrator portal."
        onClose={() => setShowLogoutConfirm(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowLogoutConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={onLogout}>
              Yes, logout
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
