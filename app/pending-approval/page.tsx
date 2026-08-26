'use client';

import { useRouter } from 'next/navigation';
import { signOut } from 'aws-amplify/auth';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import styles from './page.module.css';

/**
 * Pending Approval Page
 * Fallback destination (see lib/auth-routing.ts) for an authenticated user who
 * currently holds no portal-role Cognito group -- e.g. an administrator
 * removed their access, or they're viewing this in the brief window right
 * after being invited before their token has refreshed with the new group.
 * Portal access is invite-only (an administrator or a customer's account
 * owner grants it), so there's nothing for the user to do here themselves.
 */
export default function PendingApprovalPage() {
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  return (
    <div className={styles.wrapper}>
      <Card className={styles.card}>
        <h1 className={styles.heading}>No portal access yet</h1>
        <p className={styles.text}>
          Your account isn&apos;t assigned to a portal yet. Contact your administrator (or, if you&apos;re
          joining a company already using Null Device, that company&apos;s account owner) to have your access
          switched on.
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
