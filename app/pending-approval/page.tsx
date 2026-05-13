'use client';

import { useRouter } from 'next/navigation';
import { signOut } from 'aws-amplify/auth';
import styles from '@/app/dashboard.module.css';
import pageStyles from '@/app/pending-approval/page.module.css';

export default function PendingApprovalPage() {
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  return (
    <div className={styles.page}>
      <div className={pageStyles.headerRow}>
        <h1 className={styles.heading}>Account Pending Approval</h1>
      </div>
      <div className={styles.infoPanel}>
        <h3>Request Received</h3>
        <p className={styles.welcome}>
          Your account has been created, but access is pending administrator approval.
        </p>
        <p className={styles.welcome}>
          You will be able to access the portal once an administrator assigns your account role.
        </p>
        <button type="button" onClick={() => void handleSignOut()}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
