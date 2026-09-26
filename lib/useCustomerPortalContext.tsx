'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type DependencyList,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { useCurrentUserId } from '@/lib/use-user-groups';
import { getCustomerPortalContext } from '@/lib/customers';

export interface CustomerPortalContext {
  userId: string;
  role: 'account_owner' | 'read_only';
  customerId: string;
}

interface ResolvedPortalState {
  userId: string | undefined;
  role: 'account_owner' | 'read_only';
  customerId: string | null;
  loading: boolean;
  error: string | null;
}

interface UseCustomerPortalContextOptions<TData> {
  /** Fetches whatever this screen needs beyond role/customerId themselves
   * (Customer record, route/invoice list, teammates, ...), run once the
   * portal context resolves with a customerId. Throw an Error with a
   * page-specific message to surface it via the returned `error`. */
  fetchData?: (context: CustomerPortalContext) => Promise<TData>;
  /** Extra values (e.g. a route/invoice id from the URL) that should trigger
   * a fetchData re-run on their own, since customerId resolving is otherwise
   * the only trigger. */
  fetchDataDeps?: DependencyList;
  /** Role to assume while the real role is still resolving. Defaults to the
   * fail-closed 'read_only', which is safe for pages that gate their whole
   * render behind `loading` (the placeholder is never actually shown).
   * Pages that render role-dependent UI *without* such a gate (nav filtering
   * in CustomerLayout, dashboard's per-tile stats) should pass
   * 'account_owner' to avoid flashing the read-only view for the common
   * account-owner case — safe because the actual data-fetch gating always
   * uses the resolved role, never this placeholder. */
  defaultRole?: 'account_owner' | 'read_only';
}

interface UseCustomerPortalContextResult<TData> {
  userId: string | undefined;
  role: 'account_owner' | 'read_only';
  customerId: string | null;
  data: TData | null;
  setData: Dispatch<SetStateAction<TData | null>>;
  loading: boolean;
  /** NO_CUSTOMER_ERROR when getCustomerPortalContext has no customerId, or
   * whatever fetchData threw. */
  error: string | null;
}

const NO_CUSTOMER_ERROR = 'Could not resolve your customer account.';

function createInitialPortalState(defaultRole: 'account_owner' | 'read_only'): ResolvedPortalState {
  return {
    userId: undefined,
    role: defaultRole,
    customerId: null,
    loading: true,
    error: null,
  };
}

const CustomerPortalContextReact = createContext<ResolvedPortalState | null>(null);

/** Resolves role/customerId for the signed-in user. Pass `skip: true` when a
 * `CustomerPortalContextProvider` ancestor already resolved it, so this
 * instance doesn't also call getCustomerPortalContext. */
function useResolvePortalContext(skip: boolean, defaultRole: 'account_owner' | 'read_only'): ResolvedPortalState {
  const userId = useCurrentUserId();
  const [state, setState] = useState<ResolvedPortalState>(() => createInitialPortalState(defaultRole));

  useEffect(() => {
    if (skip || !userId) return;
    let cancelled = false;

    async function load() {
      try {
        const context = await getCustomerPortalContext(userId as string);
        if (cancelled) return;
        setState({
          userId,
          role: context.role,
          customerId: context.customerId || null,
          loading: false,
          error: context.customerId ? null : NO_CUSTOMER_ERROR,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          userId,
          role: 'read_only',
          customerId: null,
          loading: false,
          error: err instanceof Error ? err.message : NO_CUSTOMER_ERROR,
        });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [skip, userId]);

  return state;
}

/**
 * Resolves the signed-in customer's role/customerId once and shares it with
 * every page beneath it, so CustomerLayout and each page don't each call
 * getCustomerPortalContext independently on every navigation. Wrap
 * CustomerLayout's children in this once; useCustomerPortalContext picks up
 * the shared value automatically wherever it's called beneath it.
 */
export function CustomerPortalContextProvider({
  children,
  defaultRole = 'read_only',
}: {
  children: ReactNode;
  defaultRole?: 'account_owner' | 'read_only';
}) {
  const state = useResolvePortalContext(false, defaultRole);
  return <CustomerPortalContextReact.Provider value={state}>{children}</CustomerPortalContextReact.Provider>;
}

/**
 * The resolve-and-gate scaffolding shared by every customer portal page:
 * read the signed-in user's role/customerId (shared from
 * CustomerPortalContextProvider when rendered beneath one, otherwise
 * resolved independently, e.g. in isolated tests), then run this page's own
 * fetchData once a customerId is available. Mirrors useSignRunPhaseScreen.
 */
export function useCustomerPortalContext<TData = undefined>({
  fetchData,
  fetchDataDeps = [],
  defaultRole = 'read_only',
}: UseCustomerPortalContextOptions<TData> = {}): UseCustomerPortalContextResult<TData> {
  const providedState = useContext(CustomerPortalContextReact);
  const ownState = useResolvePortalContext(providedState !== null, defaultRole);
  const { userId, role, customerId, loading: contextLoading, error: contextError } = providedState ?? ownState;

  const [data, setData] = useState<TData | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    if (contextLoading) return;
    if (!customerId || !fetchData) {
      setDataLoading(false);
      return;
    }
    let cancelled = false;
    setDataLoading(true);
    setDataError(null);

    fetchData({ userId: userId as string, role, customerId })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setDataLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setDataError(err instanceof Error ? err.message : NO_CUSTOMER_ERROR);
        setDataLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // fetchData is passed fresh on every render by callers — deliberately not a
    // dependency, since customerId (plus any caller-supplied fetchDataDeps)
    // is what should trigger a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, contextLoading, ...fetchDataDeps]);

  return {
    userId,
    role,
    customerId,
    data,
    setData,
    loading: contextLoading || dataLoading,
    error: contextError || dataError,
  };
}
