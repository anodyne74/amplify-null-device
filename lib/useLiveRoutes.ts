'use client';

import { useEffect, useState } from 'react';
import { getDataClient } from '@/lib/data-client';
import type { Route } from '@/amplify/types';

interface LiveRoutesState {
  items: Route[];
  loading: boolean;
  error: string | null;
}

const IDLE_STATE: LiveRoutesState = { items: [], loading: false, error: null };

/**
 * Subscribes to Route changes — either every Route (field === null) or those
 * matching a single-field filter — via AppSync's observeQuery, which does an
 * initial list then pushes onCreate/onUpdate/onDelete events over the same
 * subscription — so callers get live data without polling. viewerSubs-based
 * authorization (amplify/data/resource.ts) already scopes which Routes a
 * customer's subscription can ever receive, so a filtered caller needs no
 * separate access check here. The unfiltered (field === null) case is only
 * used by operator/administrator callers, who already have full Route read
 * access, so no per-user filter is needed there either.
 *
 * Also resubscribes on window focus: a dropped realtime connection (network
 * blip, backgrounded tab) can go stale without observeQuery surfacing an
 * error, so refreshing on focus bounds how long that staleness can last.
 */
function useObservedRoutes(
  field: 'customerId' | 'assignedOperatorSub' | null,
  value: string | null
): LiveRoutesState {
  const [state, setState] = useState<LiveRoutesState>(IDLE_STATE);
  const [resyncToken, setResyncToken] = useState(0);
  const active = field === null || value !== null;

  useEffect(() => {
    if (!active) {
      setState(IDLE_STATE);
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    const subscription = getDataClient()
      .models.Route.observeQuery(field && value ? { filter: { [field]: { eq: value } } } : {})
      .subscribe({
        next: ({ items, isSynced }) => {
          setState({ items: items as unknown as Route[], loading: !isSynced, error: null });
        },
        error: (err: unknown) => {
          setState({
            items: [],
            loading: false,
            error: err instanceof Error ? err.message : 'Failed to load live route data.',
          });
        },
      });

    return () => subscription.unsubscribe();
  }, [field, value, active, resyncToken]);

  useEffect(() => {
    function handleFocus() {
      setResyncToken((token) => token + 1);
    }
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  return state;
}

/** Live Route list for every route visible to a customer, for the customer
 * routes list and dashboard. */
export function useLiveRoutes(customerId: string | null): {
  routes: Route[];
  loading: boolean;
  error: string | null;
} {
  const { items, loading, error } = useObservedRoutes('customerId', customerId);
  return { routes: items, loading, error };
}

/** Live Route list for every route in the system, for the operator dashboard
 * and routes list — operators already have full read access to every Route
 * (see amplify/data/resource.ts), so no per-user filter is needed here. */
export function useLiveAllRoutes(): {
  routes: Route[];
  loading: boolean;
  error: string | null;
} {
  const { items, loading, error } = useObservedRoutes(null, null);
  return { routes: items, loading, error };
}

/** Live Route list scoped to the routes currently assigned to one operator —
 * used to detect newly-assigned routes and instruction changes for in-app
 * notifications (see lib/useOperatorRouteNotifications.ts). */
export function useLiveOperatorRoutes(operatorSub: string | null): {
  routes: Route[];
  loading: boolean;
  error: string | null;
} {
  const { items, loading, error } = useObservedRoutes('assignedOperatorSub', operatorSub);
  return { routes: items, loading, error };
}
