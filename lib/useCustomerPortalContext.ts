'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useCurrentUserId } from '@/lib/use-user-groups';
import { getCustomerPortalContext } from '@/lib/queries';

export interface CustomerPortalContext {
  userId: string;
  role: 'account_owner' | 'read_only';
  customerId: string;
}

interface UseCustomerPortalContextOptions<TExtra> {
  /** Fetches whatever this screen needs beyond role/customerId themselves
   * (Customer record, route/invoice list, teammates, ...), run once the
   * portal context resolves with a customerId. Throw an Error with a
   * page-specific message to surface it via the returned `error`. */
  fetchExtra?: (context: CustomerPortalContext) => Promise<TExtra>;
}

interface UseCustomerPortalContextResult<TExtra> {
  userId: string | undefined;
  role: 'account_owner' | 'read_only';
  customerId: string | null;
  extra: TExtra | null;
  setExtra: Dispatch<SetStateAction<TExtra | null>>;
  loading: boolean;
  /** "Could not resolve your customer account" when getCustomerPortalContext
   * has no customerId, or whatever fetchExtra threw. */
  error: string | null;
}

const NO_CUSTOMER_ERROR = 'Could not resolve your customer account.';

/**
 * The resolve-and-gate scaffolding shared by every customer portal page:
 * read the signed-in user, call getCustomerPortalContext for their
 * role/customerId, bail out with a shared error if there's no customerId,
 * then run this page's own fetchExtra. Mirrors useSignRunPhaseScreen.
 */
export function useCustomerPortalContext<TExtra = undefined>({
  fetchExtra,
}: UseCustomerPortalContextOptions<TExtra> = {}): UseCustomerPortalContextResult<TExtra> {
  const userId = useCurrentUserId();
  const [role, setRole] = useState<'account_owner' | 'read_only'>('account_owner');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [extra, setExtra] = useState<TExtra | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const context = await getCustomerPortalContext(userId as string);
        if (cancelled) return;

        setRole(context.role);
        setCustomerId(context.customerId || null);

        if (!context.customerId) {
          setError(NO_CUSTOMER_ERROR);
          setLoading(false);
          return;
        }

        if (fetchExtra) {
          const extraResult = await fetchExtra({
            userId: userId as string,
            role: context.role,
            customerId: context.customerId,
          });
          if (!cancelled) setExtra(extraResult);
        }
        if (!cancelled) setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : NO_CUSTOMER_ERROR);
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // fetchExtra is passed fresh on every render by callers — deliberately not a
    // dependency, since userId is the only thing that should trigger a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return { userId, role, customerId, extra, setExtra, loading, error };
}
