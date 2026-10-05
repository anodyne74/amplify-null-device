'use client';

import Link from 'next/link';
import PageHeader from '@/app/customer/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { RequireFeature, useFeatureFlags } from '@/lib/useFeatureFlags';
import { helpPageBody, helpPages } from '@/lib/help/helpPages';
import { HelpMarkdown } from '@/lib/help/HelpMarkdown';
import { useHelpPages } from '@/lib/help/useHelpPages';
import styles from './help.module.css';

/**
 * One help page (#485). A page this user may not see reads as not found,
 * the same as a page that doesn't exist, so there's no sign of it.
 */
export default function HelpArticle({ slug }: { slug: string }) {
  return (
    <RequireFeature flag="customer-help">
      <Article slug={slug} />
    </RequireFeature>
  );
}

function Article({ slug }: { slug: string }) {
  const { ready, canSee } = useHelpPages();
  const { isOn } = useFeatureFlags();
  if (!ready) return null;

  const page = helpPages().find((p) => p.slug === slug);
  if (!page || !canSee(slug)) {
    return <p className={styles.notFound}>This page could not be found.</p>;
  }

  return (
    <div className={styles.page}>
      <Link href="/customer/help" className={styles.back}>
        All help
      </Link>
      <PageHeader title={page.title} subtitle={page.summary} />
      <Card>
        <div className={styles.prose}>
          <HelpMarkdown source={helpPageBody(page, isOn)} canSeeHelpPage={canSee} />
        </div>
      </Card>
    </div>
  );
}
