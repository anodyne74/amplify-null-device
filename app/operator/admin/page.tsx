'use client';

import Link from 'next/link';
import OperatorRoute from '@/app/components/OperatorRoute';
import styles from '@/app/dashboard.module.css';

export default function AdminHomePage() {
  return (
    <OperatorRoute requireAdmin>
      <div className={styles.page}>
        <div>
          <h1 className={styles.heading}>Administrator Functions</h1>
          <p className={styles.welcome}>Manage customers, invoices, users, and route operations.</p>
        </div>

        <div className={styles.statsGrid}>
          <Link href="/operator/customers" className={styles.statCard}>
            <p className={styles.statLabel}>Define Customers</p>
            <p className={`${styles.statValue} ${styles.cyan}`}>Open</p>
          </Link>
          <Link href="/operator/invoices" className={styles.statCard}>
            <p className={styles.statLabel}>Generate Invoices</p>
            <p className={`${styles.statValue} ${styles.green}`}>Open</p>
          </Link>
          <Link href="/operator/users" className={styles.statCard}>
            <p className={styles.statLabel}>Manage Users</p>
            <p className={`${styles.statValue} ${styles.danger}`}>Open</p>
          </Link>
        </div>
      </div>
    </OperatorRoute>
  );
}
