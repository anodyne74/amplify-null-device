'use client';

import Link from 'next/link';
import PageHeader from '@/app/customer/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { RequireFeature } from '@/lib/useFeatureFlags';
import { helpHref } from '@/lib/help/helpPages';
import { useHelpPages } from '@/lib/help/useHelpPages';
import styles from './help.module.css';

/**
 * The customer user guide's contents (#485): only the pages this user may
 * see, behind the customer-help flag.
 */
export default function CustomerHelpPage() {
  return (
    <RequireFeature flag="customer-help">
      <HelpIndex />
    </RequireFeature>
  );
}

function HelpIndex() {
  const { ready, pages } = useHelpPages();
  if (!ready) return null;

  return (
    <div className={styles.page}>
      <PageHeader title="Help" subtitle="How the portal works, and how to get things done" />
      <Card>
        <ul className={styles.index}>
          {pages.map((page) => (
            <li key={page.slug}>
              <Link href={helpHref(page.slug)} className={styles.indexLink}>
                {page.title}
              </Link>
              <p className={styles.indexSummary}>{page.summary}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
