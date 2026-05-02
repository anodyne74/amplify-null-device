'use client';

import { useAuthenticator } from '@aws-amplify/ui-react';
import styles from '@/app/dashboard.module.css';

export default function PendingApprovalPage() {
  const { signOut } = useAuthenticator();

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Account Pending Approval</h1>
      <div className={styles.infoPanel}>
        <h3>Request Received</h3>
        <p className={styles.welcome}>
          Your account has been created, but access is pending administrator approval.
        </p>
        <p className={styles.welcome}>
          You will be able to access the portal once an administrator assigns your account role.
        </p>
        <button type="button" onClick={signOut} className={styles.actionButton}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
