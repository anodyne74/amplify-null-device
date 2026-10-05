'use client';

import { useMemo } from 'react';
import { useCustomerPortalContext } from '@/lib/useCustomerPortalContext';
import { useFeatureFlags } from '@/lib/useFeatureFlags';
import { helpPages, canSeeHelpPage, type HelpPage } from '@/lib/help/helpPages';

export interface HelpPages {
  /** False until the user's role and the Customer's flags are known. */
  ready: boolean;
  /** The help pages this user may see, in reading order. */
  pages: HelpPage[];
  canSee: (slug: string) => boolean;
}

/**
 * The help pages the signed-in Customer User may see (#485). Only call it
 * once `customer-help` is on: it parses the help pages on first use.
 */
export function useHelpPages(): HelpPages {
  const { role, loading: roleLoading } = useCustomerPortalContext();
  const { isOn, loading: flagsLoading } = useFeatureFlags();
  const ready = !roleLoading && !flagsLoading;

  return useMemo(() => {
    const pages = ready ? helpPages().filter((page) => canSeeHelpPage(page, { role, isOn })) : [];
    const slugs = new Set(pages.map((page) => page.slug));
    return { ready, pages, canSee: (slug: string) => slugs.has(slug) };
  }, [ready, role, isOn]);
}
