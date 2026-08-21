'use client';

import { useRouter } from 'next/navigation';
import { signOut } from 'aws-amplify/auth';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import styles from './page.module.css';

export default function PendingApprovalPage() {
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  return (
    <div className={styles.wrapper}>
      <Card className={styles.card}>
        <h1 className={styles.heading}>Account Pending Approval</h1>
        <p className={styles.text}>
          Your account has been created, but access is pending administrator approval.
        </p>
        <p className={styles.text}>
          You will be able to access the portal once an administrator assigns your account role.
        </p>
        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={() => void handleSignOut()}>
            Sign Out
          </Button>
        </div>
      </Card>
    </div>
  );
}
