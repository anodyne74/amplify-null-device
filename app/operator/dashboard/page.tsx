'use client';

import { useAuthenticator } from '@aws-amplify/ui-react';
import { getUserEmail } from '@/lib/amplify-config';
import styles from '@/app/dashboard.module.css';

/**
 * Operator Dashboard
 * Shows system overview, customer management, and routing stats
 */
export default function OperatorDashboard() {
  const { user } = useAuthenticator();
  const userEmail = user ? getUserEmail(user) : '';

  return (
    <div className={styles.page}>
      <div>
        <h1 className={styles.heading}>Operator Dashboard</h1>
        <p className={styles.welcome}>Welcome, {userEmail}</p>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Total Customers</p>
          <p className={`${styles.statValue} ${styles.cyan}`}>0</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Active Routes</p>
          <p className={`${styles.statValue} ${styles.green}`}>0</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Outstanding Invoices</p>
          <p className={`${styles.statValue} ${styles.danger}`}>0</p>
        </div>
      </div>

      <div className={styles.infoPanel}>
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
