'use client';

import { useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { getUserEmail } from '@/lib/amplify-config';
import { getCustomerPortalContext } from '@/lib/queries';
import styles from '@/app/dashboard.module.css';

/**
 * Customer Dashboard
 * Shows overview of routes, invoices, and statistics
 */
export default function CustomerDashboard() {
  const { user } = useAuthenticator();
  const userEmail = user ? getUserEmail(user) : '';
  const [customerRole, setCustomerRole] = useState<'account_owner' | 'read_only'>('account_owner');

  useEffect(() => {
    if (!user?.userId) return;
    let cancelled = false;

    void getCustomerPortalContext(user.userId)
      .then((context) => {
        if (!cancelled) {
          setCustomerRole(context.role);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCustomerRole('account_owner');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user?.userId]);

  return (
    <div className={styles.page}>
      <div>
        <h1 className={styles.heading}>Dashboard</h1>
        <p className={styles.welcome}>
          Welcome, {userEmail} · {customerRole === 'account_owner' ? 'Owner' : 'Reviewer'}
        </p>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Active Routes</p>
          <p className={`${styles.statValue} ${styles.cyan}`}>0</p>
        </div>
        {customerRole === 'account_owner' ? (
          <>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Pending Invoices</p>
              <p className={`${styles.statValue} ${styles.amber}`}>0</p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Outstanding Balance</p>
              <p className={`${styles.statValue} ${styles.danger}`}>$0</p>
            </div>
          </>
        ) : (
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Access Level</p>
            <p className={`${styles.statValue} ${styles.green}`}>Read Only</p>
          </div>
        )}
      </div>

      <div className={styles.infoPanel}>
        <h3>{customerRole === 'account_owner' ? 'Owner Capabilities' : 'Reviewer Capabilities'}</h3>
        <ul>
          <li>View your active routes in the Routes section</li>
          {customerRole === 'account_owner' ? (
            <>
              <li>Download invoices from the Invoices section</li>
              <li>Check your statistics and billing info on the Dashboard</li>
            </>
          ) : (
            <>
              <li>Review planned and completed route progress</li>
              <li>Invoice access is restricted to the account owner</li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
}
