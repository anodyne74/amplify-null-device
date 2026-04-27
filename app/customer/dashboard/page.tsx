'use client';

import { useAuthenticator } from '@aws-amplify/ui-react';
import { getUserEmail } from '@/lib/amplify-config';
import styles from '@/app/dashboard.module.css';

/**
 * Customer Dashboard
 * Shows overview of routes, invoices, and statistics
 */
export default function CustomerDashboard() {
  const { user } = useAuthenticator();
  const userEmail = user ? getUserEmail(user) : '';

  return (
    <div className={styles.page}>
      <div>
        <h1 className={styles.heading}>Dashboard</h1>
        <p className={styles.welcome}>Welcome, {userEmail}</p>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Active Routes</p>
          <p className={`${styles.statValue} ${styles.cyan}`}>0</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Pending Invoices</p>
          <p className={`${styles.statValue} ${styles.amber}`}>0</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Outstanding Balance</p>
          <p className={`${styles.statValue} ${styles.danger}`}>$0</p>
        </div>
      </div>

      <div className={styles.infoPanel}>
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
