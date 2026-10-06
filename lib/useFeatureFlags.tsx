'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { callApi } from '@/lib/apiClient';
import { useCurrentUserId } from '@/lib/use-user-groups';
import type { FeatureFlagName } from '@/lib/featureFlags';

/**
 * Customer portal Feature Flags (ADR 0005). FeatureFlagsProvider (in the
 * customer layout) asks /api/customer/feature-flags which flags are on for the
 * signed-in user's Customer, on first load and again on every navigation --
 * there are no live updates. Every flag reads as off while the first answer
 * is loading, after a failed call, and outside the provider.
 *
 * Use FeatureGate to hide a nav entry, button or section, RequireFeature on a
 * flagged page, and useFeatureFlags().isOn(name) for anything else. This only
 * hides UI: a flagged customer write must also be refused server-side with
 * isFeatureOnForCustomer (lib/server/featureFlags.ts).
 */

interface FeatureFlagsValue {
  isOn: (name: FeatureFlagName) => boolean;
  /** True until the first answer (or failure) arrives. */
  loading: boolean;
}

const ALL_OFF: FeatureFlagsValue = { isOn: () => false, loading: false };

const FeatureFlagsContext = createContext<FeatureFlagsValue | null>(null);

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const userId = useCurrentUserId();
  const pathname = usePathname();
  const [onFlags, setOnFlags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    callApi<{ flags?: unknown }>('/api/customer/feature-flags', {})
      .then((result) => {
        if (cancelled) return;
        setOnFlags(Array.isArray(result.flags) ? result.flags.filter((flag) => typeof flag === 'string') : []);
      })
      .catch(() => {
        if (!cancelled) setOnFlags([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, pathname]);

  const isOn = useCallback((name: FeatureFlagName) => onFlags.includes(name), [onFlags]);

  return <FeatureFlagsContext.Provider value={{ isOn, loading }}>{children}</FeatureFlagsContext.Provider>;
}

export function useFeatureFlags(): FeatureFlagsValue {
  return useContext(FeatureFlagsContext) ?? ALL_OFF;
}

/** Renders its children only when the flag is on for the Customer. */
export function FeatureGate({ flag, children }: { flag: FeatureFlagName; children: ReactNode }) {
  const { isOn } = useFeatureFlags();
  return isOn(flag) ? <>{children}</> : null;
}

/**
 * Wraps a flagged customer page: renders nothing until the flags load, then
 * the page if the flag is on, else redirects to the dashboard.
 */
export function RequireFeature({ flag, children }: { flag: FeatureFlagName; children: ReactNode }) {
  const { isOn, loading } = useFeatureFlags();
  const router = useRouter();
  const allowed = isOn(flag);

  useEffect(() => {
    if (!loading && !allowed) router.replace('/customer/dashboard');
  }, [loading, allowed, router]);

  return !loading && allowed ? <>{children}</> : null;
}
