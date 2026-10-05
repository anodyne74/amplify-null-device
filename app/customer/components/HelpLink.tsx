'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/app/components/ui/core/Icon';
import { useFeatureFlags } from '@/lib/useFeatureFlags';
import { helpHref, helpPageForPath } from '@/lib/help/helpPages';
import { useHelpPages } from '@/lib/help/useHelpPages';
import styles from './HelpLink.module.css';

/**
 * The "?" link to this screen's help page (#485). Shown only while
 * `customer-help` is on and the user may see that page.
 */
export default function HelpLink() {
  const { isOn } = useFeatureFlags();
  return isOn('customer-help') ? <ScreenHelpLink /> : null;
}

function ScreenHelpLink() {
  const pathname = usePathname() ?? '';
  const { canSee } = useHelpPages();
  const page = helpPageForPath(pathname);
  if (!page || !canSee(page.slug)) return null;

  return (
    <Link href={helpHref(page.slug)} className={styles.link} aria-label={`Help: ${page.title}`} title={`Help: ${page.title}`}>
      <Icon name="circle-help" size={20} aria-hidden="true" />
    </Link>
  );
}
