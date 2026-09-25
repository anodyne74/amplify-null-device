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
 * Subscribes to Route changes matching a single-field filter via AppSync's
 * observeQuery, which does an initial list then pushes onCreate/onUpdate/
 * onDelete events over the same subscription — so callers get live data
 * without polling. viewerSubs-based authorization (amplify/data/resource.ts)
 * already scopes which Routes a customer's subscription can ever receive, so
 * no separate access check is needed here.
 *
 * Also resubscribes on window focus: a dropped realtime connection (network
 * blip, backgrounded tab) can go stale without observeQuery surfacing an
 * error, so refreshing on focus bounds how long that staleness can last.
 */
function useObservedRoutes(field: 'customerId' | 'id', value: string | null): LiveRoutesState {
  const [state, setState] = useState<LiveRoutesState>(IDLE_STATE);
  const [resyncToken, setResyncToken] = useState(0);

  useEffect(() => {
    if (!value) {
      setState(IDLE_STATE);
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    const subscription = getDataClient()
      .models.Route.observeQuery({ filter: { [field]: { eq: value } } })
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
  }, [field, value, resyncToken]);

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

/** Live single Route, for the customer route detail page. Resolves to null
 * (never loading forever) if the route doesn't exist or isn't visible to
 * this customer. */
export function useLiveRoute(routeId: string | null): {
  route: Route | null;
  loading: boolean;
  error: string | null;
} {
  const { items, loading, error } = useObservedRoutes('id', routeId);
  return { route: items[0] ?? null, loading, error };
}
