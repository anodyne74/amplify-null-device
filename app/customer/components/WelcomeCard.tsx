'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { useFeatureFlags } from '@/lib/useFeatureFlags';
import { useCustomerPortalContext } from '@/lib/useCustomerPortalContext';
import { getUserSettings, upsertUserSettings } from '@/lib/userSettings';
import { helpHref } from '@/lib/help/helpPages';
import { REQUESTS_EMAIL } from '@/lib/publicAppConfig';
import styles from './WelcomeCard.module.css';

/**
 * The Dashboard's one-time welcome (#486): how a Route goes from email to
 * invoice, and where the guide starts. Each Customer User sees it until they
 * dismiss it, which is stored on their UserSettings so it stays gone on every
 * device. Shown only while `customer-help` is on.
 */
export default function WelcomeCard() {
  const { isOn, loading } = useFeatureFlags();
  return !loading && isOn('customer-help') ? <DismissibleWelcome /> : null;
}

type Status = 'unknown' | 'shown' | 'dismissed';

function DismissibleWelcome() {
  const { userId, role, loading } = useCustomerPortalContext();
  const [status, setStatus] = useState<Status>('unknown');
  const [dismissFailed, setDismissFailed] = useState(false);

  useEffect(() => {
    if (loading || !userId) return;
    let cancelled = false;
    getUserSettings(userId).then(
      (settings) => {
        if (!cancelled) setStatus(settings?.welcomeDismissedAt ? 'dismissed' : 'shown');
      },
      // A welcome is only a pointer to the guide: when it can't tell whether
      // the user dismissed it, it stays away rather than risk coming back.
      () => {
        if (!cancelled) setStatus('dismissed');
      }
    );
    return () => {
      cancelled = true;
    };
  }, [loading, userId]);

  if (status !== 'shown' || !userId) return null;

  const dismiss = async () => {
    setStatus('dismissed');
    setDismissFailed(false);
    try {
      await upsertUserSettings(userId, { welcomeDismissedAt: new Date().toISOString() });
    } catch {
      setStatus('shown');
      setDismissFailed(true);
    }
  };

  return (
    <Card
      role="region"
      aria-label="Welcome"
      title="Welcome"
      subtitle="How a Route works, from your email to the invoice."
      footer={
        <div className={styles.footer}>
          <Link href={helpHref('getting-started')} className="nd-btn nd-btn--secondary nd-btn--sm">
            Getting started
          </Link>
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Dismiss
          </Button>
          {dismissFailed && (
            <span role="alert" className={styles.error}>
              Couldn&apos;t dismiss this. Try again.
            </span>
          )}
        </div>
      }
    >
      <ol className={styles.steps}>
        <li>
          Email a Route Request to <a href={`mailto:${REQUESTS_EMAIL}`}>{REQUESTS_EMAIL}</a> with your Schedule attached.
        </li>
        <li>
          Follow it under <Link href="/customer/routes">Routes</Link> as your signs go up and come down.
        </li>
        <li>
          We invoice you once the Route is complete
          {role === 'account_owner' ? (
            <>
              . It appears under <Link href="/customer/invoices">Invoices</Link>.
            </>
          ) : (
            '.'
          )}
        </li>
      </ol>
    </Card>
  );
}
